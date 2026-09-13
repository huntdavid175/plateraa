import { createApiClient } from '@plateraa/api-client';
import { pesewas, type OrderStatus, type SyncCommandInput } from '@plateraa/shared';
import { expect } from 'vitest';
import {
  advance,
  cancelOrder,
  closeDrawer,
  openDrawer,
  payCash,
  placeOrder,
  type Counter,
} from '../../counter/actions';
import type { TicketLine } from '../../counter/ticket';
import { SyncEngine } from '../engine';
import { openLocalDatabase } from '../schema';
import type { Database } from '../sql';
import {
  TransportError,
  httpTransport,
  type OutboxReport,
  type PullResponse,
  type PushOutcome,
  type SyncTransport,
} from '../transport';
import { nodeSqliteDriver } from './node-sqlite';
import type { StressSetup, StressVendor } from './stress-server';

/** Helpers for the offline stress run (sync.stress.ts). */

/** A repeatable random source (mulberry32): the same seed gives the same run. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** JSON with object keys sorted, so answers compare the same whatever order Postgres keeps. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

export type Trouble = 'offline' | 'lostAnswer' | 'twice';

/**
 * The real connection to the API, with the trouble a counter's Wi-Fi gives it. Every upload that
 * reaches the server is kept, with the server's answer, so the day can be sent again later.
 */
export class FlakyNetwork implements SyncTransport {
  /** Airplane mode: nothing gets through. */
  offline = false;
  /** The next this-many uploads reach the server, but its answer never comes back. */
  lostAnswers = 0;
  /** Every upload reaches the server twice, as when a retried request's first try got through too. */
  twice = false;
  /** Random trouble on each call, with these odds (0–1). */
  chaos: Partial<Record<Trouble, number>> | null = null;

  readonly stats = { uploads: 0, batchSizes: [] as number[], offline: 0, lostAnswers: 0, twice: 0 };
  readonly delivered: { commands: SyncCommandInput[]; answers: PushOutcome[] }[] = [];
  /** Uploads the server answered differently the second time. Must stay empty. */
  readonly mismatches: string[] = [];

  constructor(
    private readonly server: SyncTransport,
    private readonly random: () => number = seededRandom(1),
  ) {}

  async push(commands: SyncCommandInput[], report?: OutboxReport): Promise<PushOutcome[]> {
    const trouble = this.trouble();
    if (trouble === 'offline') {
      this.stats.offline += 1;
      throw new TransportError('offline', 'No connection');
    }
    const answers = await this.server.push(commands, report);
    this.stats.uploads += 1;
    this.stats.batchSizes.push(commands.length);
    this.delivered.push({ commands, answers });
    if (trouble === 'twice') {
      this.stats.twice += 1;
      return this.resend(commands, answers);
    }
    if (trouble === 'lostAnswer') {
      this.stats.lostAnswers += 1;
      throw new TransportError('offline', 'The answer never arrived');
    }
    return answers;
  }

  async pull(cursor: string | null, report?: OutboxReport): Promise<PullResponse> {
    if (this.offline || this.roll('offline')) {
      this.stats.offline += 1;
      throw new TransportError('offline', 'No connection');
    }
    return this.server.pull(cursor, report);
  }

  /** Sends an upload again, straight to the server; notes it if the answers differ. */
  async resend(commands: SyncCommandInput[], first: PushOutcome[]): Promise<PushOutcome[]> {
    const again = await this.server.push(commands);
    if (canonical(again) !== canonical(first)) {
      this.mismatches.push(`first ${canonical(first)}\nagain ${canonical(again)}`);
    }
    return again;
  }

  private trouble(): Trouble | null {
    if (this.offline) return 'offline';
    if (this.lostAnswers > 0) {
      this.lostAnswers -= 1;
      return 'lostAnswer';
    }
    if (this.twice) return 'twice';
    for (const kind of ['offline', 'lostAnswer', 'twice'] as const) {
      if (this.roll(kind)) return kind;
    }
    return null;
  }

  private roll(kind: Trouble): boolean {
    const odds = this.chaos?.[kind];
    return odds !== undefined && this.random() < odds;
  }
}

export interface Tablet {
  db: Database;
  engine: SyncEngine;
  network: FlakyNetwork;
  counter: Counter;
  /** Unexpected failures inside the engine. Must stay empty. */
  errors: unknown[];
  /** The app is killed: the database is let go mid-whatever. */
  kill(): void;
}

/** Tablets whose database is still open, so the run can let them all go at the end. */
const open = new Set<Tablet>();

/** Closes every tablet still open (Windows won't delete an open SQLite file). */
export function killAll(): void {
  for (const tablet of open) tablet.kill();
}

/** A tablet on `vendor`'s registered device, keeping its SQLite in `file` (so it can be killed). */
export async function openTablet(
  setup: StressSetup,
  vendor: StressVendor,
  file: string,
  options: { chaos?: FlakyNetwork['chaos']; random?: () => number } = {},
): Promise<Tablet> {
  const driver = nodeSqliteDriver(file);
  const db = await openLocalDatabase(driver);
  const api = createApiClient(setup.baseUrl, { deviceToken: () => vendor.deviceToken });
  // The API runs on this laptop, so each of its queries crosses to Neon in Frankfurt: a batch of 50
  // takes about two minutes here (on Render, next to the database, it's a couple of seconds and
  // the tablet's own 20 s limit is plenty). Wait long enough that a slow batch isn't taken for a
  // dropped connection.
  const network = new FlakyNetwork(httpTransport(api, 5 * 60_000), options.random);
  network.chaos = options.chaos ?? null;
  const errors: unknown[] = [];
  const engine = new SyncEngine({
    db,
    transport: network,
    deviceId: vendor.deviceId,
    onError: (error) => errors.push(error),
  });
  await engine.init();
  const tablet: Tablet = {
    db,
    engine,
    network,
    errors,
    counter: { engine, staffId: vendor.ownerStaffId, deviceId: vendor.deviceId, deviceCode: 'A' },
    kill: () => {
      if (!open.delete(tablet)) return;
      driver.close();
    },
  };
  open.add(tablet);
  return tablet;
}

/** Syncs until nothing is waiting, as the engine's timer would. Fails if it never gets there. */
export async function drain(tablet: Tablet, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    await tablet.engine.syncNow();
    const state = tablet.engine.getState();
    if (state.pending === 0 && state.connection === 'online') return;
  }
  throw new Error(
    `${tablet.engine.getState().pending} changes still waiting after ${attempts} syncs`,
  );
}

interface Expected {
  orderId: string;
  total: number;
  amountPaid: number;
  status: OrderStatus;
  quantity: number;
}

/**
 * The counter, selling the way staff do (placeOrder, payCash, advance, cancelOrder from
 * counter/actions), with a hand tally of what each order should end up as on the server.
 */
export class Till {
  readonly orders = new Map<string, Expected>();
  readonly float = 10_000;
  cash = 0;
  /** Sync commands recorded so far. */
  commands = 0;
  private shiftId: string | null = null;
  private menu: { id: string; name: string; price: number }[] = [];

  constructor(
    private tablet: Tablet,
    private readonly random: () => number = seededRandom(7),
  ) {}

  /** After the app restarts: the same till, on the new tablet. */
  use(tablet: Tablet) {
    this.tablet = tablet;
  }

  async loadMenu() {
    this.menu = await this.tablet.db.all('SELECT id, name, price FROM items ORDER BY name');
    if (this.menu.length === 0) throw new Error('The menu never reached the tablet');
  }

  async openDrawer() {
    this.shiftId = await openDrawer(this.tablet.counter, pesewas(this.float));
    this.commands += 1;
  }

  async closeDrawer() {
    // Counted: exactly what should be there, so the server's difference must be zero.
    await closeDrawer(this.tablet.counter, this.shiftId!, pesewas(this.float + this.cash));
    this.commands += 1;
  }

  /** One walk-in of 1–3 lines. Most pay cash and go through the kitchen; some wait unpaid; a few are cancelled. */
  async sell(): Promise<void> {
    const { counter, db } = this.tablet;
    const lines: TicketLine[] = [];
    const count = 1 + Math.floor(this.random() * 3);
    for (let i = 0; i < count; i++) {
      const item = this.menu[Math.floor(this.random() * this.menu.length)]!;
      lines.push({
        lineId: counter.engine.newId(),
        itemId: item.id,
        name: item.name,
        unitPrice: pesewas(item.price),
        modifiers: [],
        quantity: 1 + Math.floor(this.random() * 3),
      });
    }
    const placed = await placeOrder(counter, { source: 'POS', type: 'WALK_IN', lines });
    this.commands += 1;

    let amountPaid = 0;
    const roll = this.random();
    if (roll < 0.1) {
      await cancelOrder(counter, placed.orderId, 'Customer left');
      this.commands += 1;
    } else if (roll >= 0.2) {
      const tendered = pesewas(Math.ceil(placed.due / 500) * 500);
      await payCash(counter, {
        orderId: placed.orderId,
        shiftId: this.shiftId!,
        amount: placed.due,
        tendered,
      });
      this.commands += 1;
      amountPaid = placed.due;
      this.cash += placed.due;
      // Pay before prep sent it to the kitchen; staff tap it on until it's handed over.
      let status: OrderStatus | null = 'PREPARING';
      while (status && status !== 'COMPLETED') {
        status = await advance(counter, { id: placed.orderId, status, type: 'WALK_IN' });
        if (status) this.commands += 1;
      }
    }

    const row = await db.get<{ status: OrderStatus }>('SELECT status FROM orders WHERE id = ?', [
      placed.orderId,
    ]);
    this.orders.set(placed.orderId, {
      orderId: placed.orderId,
      total: placed.total,
      amountPaid,
      status: row!.status,
      quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    });
  }
}

/** What the owner sees on the dashboard for today: the orders and the day summary. */
export async function serverDay(setup: StressSetup, vendor: StressVendor) {
  const api = createApiClient(setup.baseUrl, {
    bearer: () => vendor.session,
    tenantId: () => vendor.tenantId,
  });
  const orders = await api.GET('/api/orders', { params: { query: { limit: 500 } } });
  const day = await api.GET('/api/reports/day', { params: { query: {} } });
  if (!orders.data || !day.data) throw new Error('The dashboard reads failed');
  const drawers = await api.GET('/api/reports/period', {
    params: { query: { from: day.data.date, to: day.data.date } },
  });
  if (!drawers.data) throw new Error('The period report failed');
  return { orders: orders.data, day: day.data, drawerCloses: drawers.data.drawerCloses };
}

/**
 * The end of every scenario: nothing waiting or refused on the tablet, every order on the server
 * exactly once and as the counter left it, the tablet showing what the server has, and the day
 * summary matching the hand tally.
 */
export async function expectInStep(
  setup: StressSetup,
  vendor: StressVendor,
  tablet: Tablet,
  till: Till,
) {
  expect(tablet.engine.getState()).toMatchObject({ pending: 0, needsAttention: 0 });
  expect(tablet.errors).toEqual([]);
  expect(tablet.network.mismatches).toEqual([]);

  const { orders, day } = await serverDay(setup, vendor);
  const expected = [...till.orders.values()].sort((a, b) => a.orderId.localeCompare(b.orderId));
  const onServer = [...orders].sort((a, b) => a.id.localeCompare(b.id));
  expect(onServer.map((order) => order.id)).toEqual(expected.map((order) => order.orderId));
  expect(
    onServer.map((order) => ({
      orderId: order.id,
      total: order.total,
      amountPaid: order.amountPaid,
      status: order.status,
      quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
    })),
  ).toEqual(expected);

  const local = await tablet.db.all<{
    id: string;
    status: string;
    total: number;
    amount_paid: number;
  }>('SELECT id, status, total, amount_paid FROM orders ORDER BY id');
  expect(local).toEqual(
    onServer.map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
      amount_paid: order.amountPaid,
    })),
  );
  expect(await tablet.db.all('SELECT * FROM row_locks')).toEqual([]);

  const sold = expected.filter((order) => order.status !== 'CANCELLED');
  expect(day).toMatchObject({
    orders: sold.length,
    sales: sold.reduce((sum, order) => sum + order.total, 0),
    moneyIn: till.cash,
    unpaid: sold.reduce((sum, order) => sum + order.total - order.amountPaid, 0),
    moneyOut: 0,
  });
}

/** A line for the run's output: how rough the connection was. */
export function trouble(network: FlakyNetwork, till: Till): string {
  const { uploads, offline, lostAnswers, twice } = network.stats;
  return `${till.orders.size} orders, ${till.commands} changes, ${uploads} uploads reached the server; ${offline} tries offline, ${lostAnswers} answers lost, ${twice} uploads doubled`;
}
