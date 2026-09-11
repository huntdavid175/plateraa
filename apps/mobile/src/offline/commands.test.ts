import { ulid } from 'ulid';
import { describe, expect, it } from 'vitest';
import {
  MENU,
  STAFF_ID,
  TODAY,
  line,
  serverOrder,
  serverShift,
  setUp,
  walkIn,
} from './testing/fixtures';

const stock = async (db: Awaited<ReturnType<typeof setUp>>['db']) => ({
  ...(await db.get('SELECT on_hand FROM stock_items WHERE id = ?', [MENU.jollofStock])),
  ...(await db.get('SELECT sold_out_on FROM items WHERE id = ?', [MENU.jollof])),
});

describe('commands on the tablet', () => {
  it('counts prep stock down with sales and back up with edits and cancels', async () => {
    const { db, engine } = await setUp();
    const jollof = line(MENU.jollof, 3, 4500);
    const sale = walkIn([jollof]);
    await engine.record('order.create', sale, STAFF_ID);
    expect(await stock(db)).toEqual({ on_hand: 0, sold_out_on: TODAY });

    await engine.record(
      'order.update_items',
      { orderId: sale.orderId, lines: [{ ...jollof, quantity: 1 }] },
      STAFF_ID,
    );
    expect(await stock(db)).toEqual({ on_hand: 2, sold_out_on: null });
    expect(await db.get('SELECT total FROM orders')).toEqual({ total: 4500 });

    await engine.record(
      'order.cancel',
      { orderId: sale.orderId, reason: 'Customer left' },
      STAFF_ID,
    );
    expect(await stock(db)).toEqual({ on_hand: 3, sold_out_on: null });
    expect(await db.get('SELECT status, cancel_reason FROM orders')).toEqual({
      status: 'CANCELLED',
      cancel_reason: 'Customer left',
    });
  });

  it('takes an item off sold out when more is made', async () => {
    const { db, engine } = await setUp();
    await engine.record('order.create', walkIn([line(MENU.jollof, 3, 4500)]), STAFF_ID);
    await engine.record(
      'stock.prep_count',
      { movementId: ulid(), stockItemId: MENU.jollofStock, quantity: 20, businessDate: TODAY },
      STAFF_ID,
    );
    expect(await stock(db)).toEqual({ on_hand: 20, sold_out_on: null });
  });

  it('works out the drawer at close from the float, cash taken, drops and pay-ins', async () => {
    const { db, server, engine } = await setUp();
    const orderId = ulid();
    const shiftId = ulid();
    server.changes = { orders: [serverOrder({ id: orderId })], shifts: [serverShift(shiftId)] };
    await engine.syncNow();

    await engine.record(
      'payment.record_cash',
      { paymentId: ulid(), orderId, shiftId, amount: 4500 },
      STAFF_ID,
    );
    const move = (type: 'DROP' | 'PAY_IN', amount: number) =>
      engine.record('shift.cash_movement', { movementId: ulid(), shiftId, type, amount }, STAFF_ID);
    await move('DROP', 2000);
    await move('PAY_IN', 500);
    await engine.record('shift.close', { shiftId, counted: 12800 }, STAFF_ID);

    // GH₵100 float + 45 cash − 20 dropped + 5 paid in = GH₵130 expected.
    expect(
      await db.get('SELECT status, expected_cash, counted_cash, variance FROM shifts'),
    ).toEqual({ status: 'CLOSED', expected_cash: 13000, counted_cash: 12800, variance: -200 });
  });

  it('keeps a known customer by phone and fills in a missing name', async () => {
    const { db, engine } = await setUp();
    const customerId = ulid();
    await engine.record('customer.upsert', { customerId, phone: '0241234567' }, STAFF_ID);
    await engine.record(
      'order.create',
      {
        ...walkIn([line(MENU.waakye, 1, 3500)]),
        type: 'PICKUP',
        source: 'PHONE',
        customer: { phone: '+233 24 123 4567', name: 'Kofi' },
      },
      STAFF_ID,
    );
    expect(await db.all('SELECT id, name FROM customers')).toEqual([
      { id: customerId, name: 'Kofi' },
    ]);
    expect(await db.get('SELECT customer_id FROM orders')).toEqual({ customer_id: customerId });
  });
});
