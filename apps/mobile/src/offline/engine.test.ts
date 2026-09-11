import { ulid } from 'ulid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvalidCommandError } from './engine';
import { MIGRATIONS, SYNCED_TABLES, columnsOf, migrate, openLocalDatabase } from './schema';
import type { Database, Row } from './sql';
import { provisionalSql } from './store';
import {
  MENU,
  NOW,
  STAFF_ID,
  TODAY,
  applied,
  jollofStock,
  line,
  menuChanges,
  newEngine,
  refused,
  retry,
  serverLine,
  serverOrder,
  serverShift,
  setUp,
  walkIn,
} from './testing/fixtures';
import { nodeSqliteDriver } from './testing/node-sqlite';

const orderRow = (db: Database, id: string) =>
  db.get<Row>('SELECT * FROM orders WHERE id = ?', [id]);

const isProvisional = async (db: Database, id: string) =>
  (await db.get<{ yes: number }>(`SELECT ${provisionalSql('orders', '?')} AS yes`, [id]))!.yes ===
  1;

const soldOut = (itemId: string) => ({ itemId, soldOut: true, businessDate: TODAY });

/** An unpaid GH₵45 order and this tablet's open drawer, both already on the server. */
async function withOrderAndDrawer() {
  const tablet = await setUp();
  const orderId = ulid();
  const shiftId = ulid();
  tablet.server.changes = {
    orders: [serverOrder({ id: orderId })],
    shifts: [serverShift(shiftId)],
  };
  await tablet.engine.syncNow();
  return { ...tablet, orderId, shiftId };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('local database', () => {
  it('has a column for every field it mirrors', async () => {
    const db = await openLocalDatabase(nodeSqliteDriver());
    for (const table of SYNCED_TABLES) {
      const columns = await db.all<{ name: string }>(`PRAGMA table_info(${table.name})`);
      expect(columns.map((c) => c.name).sort(), table.name).toEqual(columnsOf(table).sort());
    }
  });

  it('runs each migration once', async () => {
    const db = await openLocalDatabase(nodeSqliteDriver());
    await migrate(db);
    expect(await db.get('PRAGMA user_version')).toEqual({ user_version: MIGRATIONS.length });
  });
});

describe('sync engine', () => {
  it('fills the menu on the first sync and drops what the server deletes', async () => {
    const { db, server, engine } = await setUp();
    expect(server.pulls).toEqual([null]);
    expect(await db.all('SELECT name FROM items ORDER BY position')).toEqual([
      { name: 'Jollof rice' },
      { name: 'Waakye' },
    ]);
    expect(await db.get('SELECT * FROM settings')).toEqual({
      id: 'tenant',
      require_payment_before_prep: 1,
      count_portions: 0,
      idle_lock_seconds: 180,
    });

    server.changes = { items: [{ ...menuChanges().items![1]!, deletedAt: NOW.toISOString() }] };
    await engine.syncNow();
    expect(server.pulls).toEqual([null, '1']);
    expect(await db.all('SELECT name FROM items')).toEqual([{ name: 'Jollof rice' }]);
    expect(engine.getState()).toMatchObject({
      connection: 'online',
      lastSyncedAt: NOW.toISOString(),
    });
  });

  it('saves a sale on the tablet at once, with provisional totals', async () => {
    const { db, engine } = await setUp();
    const chicken = { modifierId: MENU.chicken, unitPriceDelta: 1500, quantity: 1 };
    const sale = walkIn([line(MENU.jollof, 2, 4500, { modifiers: [chicken] })]);
    await engine.record('order.create', sale, STAFF_ID);

    expect(await orderRow(db, sale.orderId)).toMatchObject({
      status: 'CONFIRMED',
      subtotal: 12000,
      total: 12000,
      amount_paid: 0,
      created_by: STAFF_ID,
    });
    expect(await db.get('SELECT name, quantity, line_total, modifiers FROM order_items')).toEqual({
      name: 'Jollof rice',
      quantity: 2,
      line_total: 12000,
      modifiers: JSON.stringify([{ ...chicken, name: 'Chicken' }]),
    });
    expect(await isProvisional(db, sale.orderId)).toBe(true);
    expect(await db.get('SELECT on_hand FROM stock_items')).toEqual({ on_hand: 1 });
    expect(engine.getState()).toMatchObject({ pending: 1, dataVersion: 2 });
  });

  it("replaces the tablet's figures with the server's once it confirms", async () => {
    const { db, server, engine } = await setUp();
    const jollof = line(MENU.jollof, 1, 4000); // An old price: the server keeps it but flags it.
    const sale = walkIn([jollof]);
    await engine.record('order.create', sale, STAFF_ID);

    server.changes = {
      orders: [
        serverOrder({
          id: sale.orderId,
          subtotal: 4000,
          total: 4000,
          reviewReasons: ['PRICE_MISMATCH'],
        }),
      ],
      orderItems: [serverLine(sale.orderId, jollof)],
      stockItems: [jollofStock(2)],
    };
    await engine.syncNow();

    expect(server.pushes).toEqual([
      [
        expect.objectContaining({
          type: 'order.create',
          deviceSeq: 1,
          staffId: STAFF_ID,
          payload: expect.objectContaining({ orderId: sale.orderId }),
        }),
      ],
    ]);
    expect(await orderRow(db, sale.orderId)).toMatchObject({
      total: 4000,
      review_reasons: '["PRICE_MISMATCH"]',
    });
    expect(await db.all('SELECT id FROM order_items')).toEqual([{ id: jollof.lineId }]);
    expect(await isProvisional(db, sale.orderId)).toBe(false);
    expect(await db.all('SELECT * FROM row_locks')).toEqual([]);
    expect(await db.all('SELECT * FROM shadows')).toEqual([]);
    expect(await db.all('SELECT * FROM outbox')).toEqual([]); // Confirmed, so it's let go.
    expect(engine.getState().pending).toBe(0);
  });

  it("keeps showing the tablet's own change until the server has it too", async () => {
    const { db, server, engine, orderId } = await withOrderAndDrawer();

    // A manager takes GH₵5 off on the dashboard while the counter puts the order on hold.
    server.changes = { orders: [serverOrder({ id: orderId, discount: 500, total: 4000 })] };
    server.duringPull = () => engine.record('order.hold', { orderId }, STAFF_ID);
    await engine.syncNow();
    expect(await orderRow(db, orderId)).toMatchObject({ on_hold: 1, total: 4500 });
    expect(await isProvisional(db, orderId)).toBe(true);

    server.changes = {
      orders: [serverOrder({ id: orderId, discount: 500, total: 4000, onHold: true })],
    };
    await engine.syncNow();
    expect(await orderRow(db, orderId)).toMatchObject({ on_hold: 1, total: 4000 });
    expect(await isProvisional(db, orderId)).toBe(false);
  });

  it('undoes a change the server refuses and lists it under Needs attention', async () => {
    const { db, server, engine, orderId, shiftId } = await withOrderAndDrawer();
    const paymentId = ulid();
    await engine.record(
      'payment.record_cash',
      { paymentId, orderId, shiftId, amount: 4500, tendered: 5000 },
      STAFF_ID,
    );
    // Pay before prep: the payment that clears the order sends it to the kitchen.
    expect(await orderRow(db, orderId)).toMatchObject({ amount_paid: 4500, status: 'PREPARING' });

    server.answer = (c) => refused(c, 'SHIFT_CLOSED', 'That drawer shift is already closed');
    await engine.syncNow();
    expect(await orderRow(db, orderId)).toMatchObject({ amount_paid: 0, status: 'CONFIRMED' });
    expect(await db.all('SELECT id FROM payments')).toEqual([]);
    expect(await engine.needsAttention()).toEqual([
      expect.objectContaining({
        type: 'payment.record_cash',
        staffId: STAFF_ID,
        code: 'SHIFT_CLOSED',
        message: 'That drawer shift is already closed',
      }),
    ]);
    expect(engine.getState()).toMatchObject({ pending: 0, needsAttention: 1 });

    await engine.syncNow();
    expect(server.pushes).toHaveLength(1); // Never sent again.

    const [refusal] = await engine.needsAttention();
    await engine.dismiss(refusal!.id);
    expect(await engine.needsAttention()).toEqual([]);
    expect(engine.getState().needsAttention).toBe(0);
  });

  it('keeps the other waiting changes when one of them is refused', async () => {
    const { db, server, engine, orderId, shiftId } = await withOrderAndDrawer();
    server.down = 'offline';
    const hold = await engine.record('order.hold', { orderId }, STAFF_ID);
    const paymentId = ulid();
    await engine.record(
      'payment.record_cash',
      { paymentId, orderId, shiftId, amount: 4500 },
      STAFF_ID,
    );
    await engine.syncNow();
    expect(engine.getState()).toMatchObject({ connection: 'offline', pending: 2 });

    // Back online: the hold is refused, the payment taken, then the connection drops again
    // before the results can be pulled.
    server.down = null;
    server.answer = (c) => {
      if (c.type === 'payment.record_cash') server.down = 'offline';
      return c.id === hold
        ? refused(c, 'ORDER_CLOSED', 'This order is already finished')
        : applied(c);
    };
    await engine.syncNow();

    expect(await orderRow(db, orderId)).toMatchObject({
      on_hold: 0,
      amount_paid: 4500,
      status: 'PREPARING',
    });
    expect(await db.all('SELECT id FROM payments')).toEqual([{ id: paymentId }]);
    expect(await db.all('SELECT status FROM outbox ORDER BY seq')).toEqual([
      { status: 'REJECTED' },
      { status: 'APPLIED' },
    ]);
  });

  it('stops at a command the server asks to retry, and sends it again later in order', async () => {
    const { db, server, engine } = await setUp();
    const first = await engine.record('item.set_sold_out', soldOut(MENU.jollof), STAFF_ID);
    const second = await engine.record('item.set_sold_out', soldOut(MENU.waakye), STAFF_ID);
    const third = await engine.record(
      'item.set_sold_out',
      { ...soldOut(MENU.jollof), soldOut: false },
      STAFF_ID,
    );

    server.answer = (c) => (c.id === second ? retry(c) : applied(c));
    await engine.syncNow();
    expect(server.pushes[0]!.map((c) => c.id)).toEqual([first, second, third]);
    expect(server.pulls).toEqual([null]); // No pull after an unfinished upload.
    expect(await db.all('SELECT id, status, attempts FROM outbox ORDER BY seq')).toEqual([
      { id: first, status: 'APPLIED', attempts: 0 },
      { id: second, status: 'PENDING', attempts: 1 },
      { id: third, status: 'PENDING', attempts: 0 },
    ]);
    expect(engine.getState()).toMatchObject({ connection: 'online', pending: 2 });

    server.answer = applied;
    await engine.syncNow();
    expect(server.pushes[1]!.map((c) => [c.id, c.deviceSeq])).toEqual([
      [second, 2],
      [third, 3],
    ]);
    expect(engine.getState().pending).toBe(0);
  });

  it('uploads a long queue 50 at a time, oldest first', async () => {
    const { server, engine } = await setUp();
    server.down = 'offline';
    for (let i = 0; i < 120; i++) {
      await engine.record(
        'item.set_sold_out',
        { ...soldOut(MENU.jollof), soldOut: i % 2 === 0 },
        STAFF_ID,
      );
    }
    await engine.syncNow();
    expect(engine.getState()).toMatchObject({ connection: 'offline', pending: 120 });

    server.down = null;
    await engine.syncNow();
    expect(server.pushes.map((batch) => batch.length)).toEqual([50, 50, 20]);
    expect(server.pushes.flat().map((c) => c.deviceSeq)).toEqual(
      Array.from({ length: 120 }, (_, i) => i + 1),
    );
    expect(engine.getState()).toMatchObject({ connection: 'online', pending: 0 });
  });

  it("sends one at a time when the server can't read a batch, refusing only the bad one", async () => {
    const { db, server, engine } = await setUp();
    const first = await engine.record('item.set_sold_out', soldOut(MENU.jollof), STAFF_ID);
    const bad = await engine.record('item.set_sold_out', soldOut(MENU.waakye), STAFF_ID);
    const third = await engine.record('item.set_sold_out', soldOut(MENU.jollof), STAFF_ID);
    server.unreadable.add(bad);

    await engine.syncNow();
    expect(server.pushes.map((batch) => batch.map((c) => c.id))).toEqual([
      [first, bad, third],
      [first],
      [bad],
      [third],
    ]);
    // The two the server took are confirmed and gone; the bad one waits under Needs attention.
    expect(await db.all('SELECT id, status, error_code FROM outbox')).toEqual([
      { id: bad, status: 'REJECTED', error_code: 'INVALID_COMMAND' },
    ]);
  });

  it('refuses at once what the server would refuse, and saves nothing', async () => {
    const { db, engine, orderId, shiftId } = await withOrderAndDrawer();
    await expect(
      engine.record(
        'payment.record_cash',
        { paymentId: ulid(), orderId, shiftId, amount: 5000 },
        STAFF_ID,
      ),
    ).rejects.toMatchObject({
      code: 'OVERPAYMENT',
      message: 'Only GH₵45.00 is left to pay on this order',
    });
    await expect(
      engine.record('order.set_status', { orderId, status: 'PREPARING' }, STAFF_ID),
    ).rejects.toMatchObject({ code: 'AWAITING_PAYMENT' });
    await expect(engine.record('order.create', walkIn([]), STAFF_ID)).rejects.toBeInstanceOf(
      InvalidCommandError,
    );
    expect(await db.all('SELECT * FROM outbox')).toEqual([]);
    expect(await db.all('SELECT * FROM row_locks')).toEqual([]);
  });

  it('keeps changes made while the first full sync was on its way', async () => {
    const { db, server, engine } = await newEngine();
    await engine.init();
    const customerId = ulid();
    server.duringPull = () =>
      engine.record(
        'customer.upsert',
        { customerId, phone: '024 123 4567', name: 'Kofi' },
        STAFF_ID,
      );
    await engine.syncNow();

    expect(await db.get('SELECT phone, name FROM customers WHERE id = ?', [customerId])).toEqual({
      phone: '+233241234567',
      name: 'Kofi',
    });
    expect(await db.all('SELECT name FROM items')).toHaveLength(2);
    expect(engine.getState().pending).toBe(1);
  });

  it('clears finished orders from before yesterday', async () => {
    const { db, server, engine } = await setUp();
    const old = ulid();
    const stillOpen = ulid();
    const yesterdays = ulid();
    server.changes = {
      orders: [
        serverOrder({ id: old, businessDate: '2026-09-14', status: 'COMPLETED' }),
        serverOrder({ id: stillOpen, businessDate: '2026-09-14', status: 'READY' }),
        serverOrder({ id: yesterdays, businessDate: '2026-09-16', status: 'COMPLETED' }),
      ],
      orderItems: [serverLine(old, line(MENU.jollof, 1, 4500))],
    };
    await engine.syncNow();

    const ids = (await db.all<{ id: string }>('SELECT id FROM orders')).map((o) => o.id);
    expect(ids.sort()).toEqual([stillOpen, yesterdays].sort());
    expect(await db.all('SELECT id FROM order_items')).toEqual([]);
  });

  it("doesn't clear an old order until the server has the tablet's change to it", async () => {
    const { db, server, engine } = await setUp();
    const old = ulid();
    const oldOrder = (status: string) =>
      serverOrder({ id: old, businessDate: '2026-09-14', status });
    server.changes = { orders: [oldOrder('READY')] };
    await engine.syncNow();

    // Handed over while a pull is on its way: finished and old, but the server doesn't know yet.
    server.duringPull = () =>
      engine.record('order.set_status', { orderId: old, status: 'COMPLETED' }, STAFF_ID);
    await engine.syncNow();
    expect(await orderRow(db, old)).toMatchObject({ status: 'COMPLETED' });
    expect(engine.getState().pending).toBe(1);

    server.changes = { orders: [oldOrder('COMPLETED')] };
    await engine.syncNow();
    expect(await orderRow(db, old)).toBeUndefined();
    expect(await db.all('SELECT * FROM outbox')).toEqual([]);
  });

  it('shows the tablet as signed out when its device token stops working', async () => {
    const { server, engine } = await setUp();
    server.down = 'unauthorized';
    await engine.syncNow();
    expect(engine.getState().connection).toBe('signed-out');
  });

  it('uploads shortly after a change and pulls every 30 seconds', async () => {
    const { server, engine } = await setUp();
    vi.useFakeTimers();
    engine.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.pulls).toHaveLength(2);

    await engine.record('item.set_sold_out', soldOut(MENU.jollof), STAFF_ID);
    await vi.advanceTimersByTimeAsync(300);
    expect(server.pushes).toHaveLength(1);
    expect(server.pulls).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(server.pulls).toHaveLength(4);
    engine.stop();
  });
});
