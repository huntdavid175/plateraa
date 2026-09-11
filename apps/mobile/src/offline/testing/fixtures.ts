import type { SyncCommandInput } from '@plateraa/shared';
import { ulid } from 'ulid';
import { SyncEngine } from '../engine';
import { openLocalDatabase } from '../schema';
import type { PullChanges, ServerRow } from '../store';
import {
  TransportError,
  type PullResponse,
  type PushOutcome,
  type SyncTransport,
  type TransportErrorKind,
} from '../transport';
import { nodeSqliteDriver } from './node-sqlite';

export const NOW = new Date('2026-09-17T10:00:00.000Z');
export const TODAY = '2026-09-17';
export const DEVICE_ID = ulid();
export const STAFF_ID = ulid();
export const MENU = {
  jollof: ulid(),
  waakye: ulid(),
  large: ulid(),
  protein: ulid(),
  chicken: ulid(),
  jollofStock: ulid(),
};

export const applied = (command: { id: string }): PushOutcome => ({
  id: command.id,
  status: 'APPLIED',
  result: {},
});

export const refused = (command: { id: string }, code: string, message: string): PushOutcome => ({
  id: command.id,
  status: 'REJECTED',
  error: { code, message },
});

export const retry = (command: { id: string }): PushOutcome => ({
  id: command.id,
  status: 'RETRY',
  error: { code: 'TRY_AGAIN', message: 'Could not save this yet; the tablet will try again' },
});

/** A server that answers the way each test tells it to. */
export class FakeServer implements SyncTransport {
  readonly pushes: SyncCommandInput[][] = [];
  readonly pulls: (string | null)[] = [];
  /** How each pushed command is answered. Like the real server, it stops at a RETRY. */
  answer: (command: SyncCommandInput) => PushOutcome = applied;
  /** What the next pull returns. */
  changes: PullChanges = {};
  /** Unreachable (or failing) until set back to null. */
  down: TransportErrorKind | null = null;
  /** Commands the server can't read: a batch holding one is refused whole. */
  readonly unreadable = new Set<string>();
  /** Runs while a pull is on its way, as if someone tapped something meanwhile. */
  duringPull: (() => Promise<unknown>) | null = null;
  private cursor = 0;

  async push(commands: SyncCommandInput[]): Promise<PushOutcome[]> {
    if (this.down) throw new TransportError(this.down, `Server ${this.down}`);
    this.pushes.push(commands);
    if (commands.some((command) => this.unreadable.has(command.id))) {
      throw new TransportError('invalid', 'commands.0.payload: Invalid input');
    }
    const outcomes: PushOutcome[] = [];
    for (const command of commands) {
      const outcome = this.answer(command);
      outcomes.push(outcome);
      if (outcome.status === 'RETRY') break;
    }
    return outcomes;
  }

  async pull(cursor: string | null): Promise<PullResponse> {
    if (this.down) throw new TransportError(this.down, `Server ${this.down}`);
    this.pulls.push(cursor);
    const changes = this.changes;
    this.changes = {};
    const during = this.duringPull;
    this.duringPull = null;
    await during?.();
    return { cursor: String(++this.cursor), changes };
  }
}

const serverColumns = () => ({
  tenantId: 'TENANT',
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  deletedAt: null,
  syncXid: '1',
});

/** The menu and settings as the server sends them on a first sync. */
export function menuChanges(): PullChanges {
  const item = { description: null, prepMinutes: 10, station: 'KITCHEN', photoKey: null };
  return {
    tenantSettings: [{ requirePaymentBeforePrep: true, idleLockSeconds: 180, deletedAt: null }],
    staff: [
      {
        id: STAFF_ID,
        displayName: 'Ama',
        role: 'STAFF',
        active: true,
        pinVerifier: 'pbkdf2-sha256$50000$c2FsdA$aGFzaA',
        deletedAt: null,
      },
    ],
    categories: [],
    items: [
      {
        ...serverColumns(),
        ...item,
        id: MENU.jollof,
        categoryId: null,
        name: 'Jollof rice',
        price: 4500,
        soldOutOn: null,
        position: 0,
        active: true,
      },
      {
        ...serverColumns(),
        ...item,
        id: MENU.waakye,
        categoryId: null,
        name: 'Waakye',
        price: 3500,
        soldOutOn: null,
        position: 1,
        active: true,
      },
    ],
    itemVariants: [
      {
        ...serverColumns(),
        id: MENU.large,
        itemId: MENU.jollof,
        name: 'Large',
        price: 6000,
        position: 0,
        active: true,
      },
    ],
    modifierGroups: [
      {
        ...serverColumns(),
        id: MENU.protein,
        name: 'Protein',
        minSelect: 0,
        maxSelect: 1,
        position: 0,
      },
    ],
    modifiers: [
      {
        ...serverColumns(),
        id: MENU.chicken,
        groupId: MENU.protein,
        name: 'Chicken',
        priceDelta: 1500,
        position: 0,
        active: true,
      },
    ],
    stockItems: [jollofStock(3)],
  };
}

export function jollofStock(onHand: number): ServerRow {
  return {
    ...serverColumns(),
    id: MENU.jollofStock,
    kind: 'SELLABLE',
    itemId: MENU.jollof,
    name: 'Jollof rice',
    unit: 'plate',
    lowThreshold: null,
    onHand,
    onHandDate: TODAY,
  };
}

/** An order as the server sends it in a pull: one jollof, unpaid, unless overridden. */
export function serverOrder(overrides: ServerRow & { id: string }): ServerRow {
  return {
    ...serverColumns(),
    locationId: 'LOCATION',
    deviceId: DEVICE_ID,
    displayNumber: 'A1',
    businessDate: TODAY,
    source: 'POS',
    arrivalMethod: 'MANUAL',
    externalReference: null,
    type: 'WALK_IN',
    status: 'CONFIRMED',
    onHold: false,
    customerId: null,
    deliveryAddress: null,
    deliveryZoneId: null,
    deliveryFee: 0,
    deliveryFeeCollectedBy: null,
    note: null,
    discountBps: null,
    discountAmountInput: null,
    subtotal: 4500,
    discount: 0,
    total: 4500,
    amountPaid: 0,
    reviewReasons: [],
    cancelReason: null,
    createdBy: STAFF_ID,
    createdAtDevice: NOW.toISOString(),
    ...overrides,
  };
}

export function serverLine(
  orderId: string,
  line: { lineId: string; itemId: string; quantity: number; unitPrice: number },
): ServerRow {
  return {
    ...serverColumns(),
    id: line.lineId,
    orderId,
    itemId: line.itemId,
    variantId: null,
    name: 'Jollof rice',
    variantName: null,
    unitPrice: line.unitPrice,
    modifiers: [],
    quantity: line.quantity,
    unitTotal: line.unitPrice,
    lineTotal: line.unitPrice * line.quantity,
    station: 'KITCHEN',
    note: null,
    position: 0,
  };
}

/** This tablet's open drawer with a GH₵100 float, as the server sends it. */
export function serverShift(id: string): ServerRow {
  return {
    ...serverColumns(),
    locationId: 'LOCATION',
    deviceId: DEVICE_ID,
    status: 'OPEN',
    openedBy: STAFF_ID,
    openedAt: NOW.toISOString(),
    floatAmount: 10000,
    closedBy: null,
    closedAt: null,
    expectedCash: null,
    countedCash: null,
    variance: null,
    id,
  };
}

export const line = (
  itemId: string,
  quantity: number,
  unitPrice: number,
  extra: Record<string, unknown> = {},
) => ({ lineId: ulid(), itemId, quantity, unitPrice, ...extra });

export const walkIn = (lines: ReturnType<typeof line>[], orderId = ulid()) => ({
  orderId,
  displayNumber: 'A1',
  businessDate: TODAY,
  source: 'POS' as const,
  type: 'WALK_IN' as const,
  lines,
});

export function newEngine() {
  return openLocalDatabase(nodeSqliteDriver()).then((db) => {
    const server = new FakeServer();
    server.changes = menuChanges();
    const errors: unknown[] = [];
    const engine = new SyncEngine({
      db,
      transport: server,
      deviceId: DEVICE_ID,
      now: () => NOW,
      onError: (error) => errors.push(error),
    });
    return { db, server, engine, errors };
  });
}

/** A tablet that has done its first sync: the menu is on it. */
export async function setUp() {
  const tablet = await newEngine();
  await tablet.engine.init();
  await tablet.engine.syncNow();
  return tablet;
}
