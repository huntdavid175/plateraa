import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  channelCommissions,
  customers,
  eq,
  items,
  orders,
  platformReceivables,
  stockItems,
  tenantSettings,
  withTenant,
  type Database,
} from '@plateraa/db';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { syncClient } from '../test/sync-client';
import { createTestApp, hasDatabase } from '../test/test-app';

/**
 * Money, the cash drawer and stock, pushed the way a tablet would, in one story, with pay before
 * prep on (the default). The drawer: GH₵50 float, +GH₵90 and +GH₵10 cash, −GH₵20 drop, +GH₵5
 * pay-in, so GH₵135 expected at close. The cancelled order's GH₵10 stays in the drawer: refunds
 * are paid back from outside it.
 */
describe.skipIf(!hasDatabase())('sync: money, drawer and stock (against Neon)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let vendor: Vendor;
  let menu: Awaited<ReturnType<typeof seedMenu>>;
  let sync: ReturnType<typeof syncClient>;
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  const shiftId = ulid();

  const line = (itemId: string, quantity: number, unitPrice: number) => ({
    lineId: ulid(),
    itemId,
    quantity,
    unitPrice,
  });

  const order = (lines: ReturnType<typeof line>[], extra: Record<string, unknown> = {}) =>
    sync.command('order.create', {
      orderId: ulid(),
      displayNumber: '010',
      businessDate: today,
      source: 'POS',
      type: 'WALK_IN',
      lines,
      ...extra,
    });

  const inTenant = <T>(fn: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(db, vendor.tenantId, fn);

  beforeAll(async () => {
    app = await createTestApp(loadEnv());
    db = app.get<DatabaseHandle>(DATABASE).db;
    vendor = await setUpVendor(app.getHttpServer(), 'Esi');
    menu = await seedMenu(app, vendor.tenantId, today);
    sync = syncClient(app.getHttpServer(), vendor);
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  let paidOrder: ReturnType<typeof order>;

  it('keeps an unpaid order away from the kitchen', async () => {
    expect(await sync.pushOne(sync.command('shift.open', { shiftId, float: 5000 }))).toMatchObject({
      status: 'APPLIED',
    });
    paidOrder = order([line(menu.jollof, 2, 4500)]);
    expect(await sync.pushOne(paidOrder)).toMatchObject({
      status: 'APPLIED',
      result: { status: 'CONFIRMED' },
    });
    const tooEarly = await sync.pushOne(
      sync.command('order.set_status', { orderId: paidOrder.payload.orderId, status: 'PREPARING' }),
    );
    expect(tooEarly).toMatchObject({ status: 'REJECTED', error: { code: 'AWAITING_PAYMENT' } });
  });

  it('takes cash, shows the change and sends the order to the kitchen', async () => {
    const paid = await sync.pushOne(
      sync.command('payment.record_cash', {
        paymentId: ulid(),
        orderId: paidOrder.payload.orderId,
        shiftId,
        amount: 9000,
        tendered: 10_000,
      }),
    );
    expect(paid).toMatchObject({
      status: 'APPLIED',
      result: { amountPaid: 9000, outstanding: 0, change: 1000, status: 'PREPARING' },
    });
  });

  it('allows only one open drawer per tablet', async () => {
    const second = await sync.pushOne(sync.command('shift.open', { shiftId: ulid(), float: 0 }));
    expect(second).toMatchObject({ status: 'REJECTED', error: { code: 'SHIFT_ALREADY_OPEN' } });
  });

  it('refuses to take more than is owed', async () => {
    const extra = await sync.pushOne(
      sync.command('payment.record_cash', {
        paymentId: ulid(),
        orderId: paidOrder.payload.orderId,
        shiftId,
        amount: 100,
      }),
    );
    expect(extra).toMatchObject({ status: 'REJECTED', error: { code: 'OVERPAYMENT' } });
  });

  it('cancels a paid order and leaves the money as a refund owed', async () => {
    const sobolo = order([line(menu.sobolo, 1, 1000)]);
    await sync.push(
      sobolo,
      sync.command('payment.record_cash', {
        paymentId: ulid(),
        orderId: sobolo.payload.orderId,
        shiftId,
        amount: 1000,
      }),
    );
    const cancelled = await sync.pushOne(
      sync.command('order.cancel', { orderId: sobolo.payload.orderId, reason: 'Changed mind' }),
    );
    expect(cancelled).toMatchObject({
      status: 'APPLIED',
      result: { status: 'CANCELLED', refundOwed: 1000 },
    });
    const [saved] = await inTenant((tx) =>
      tx.select().from(orders).where(eq(orders.id, sobolo.payload.orderId)),
    );
    expect(saved).toMatchObject({ status: 'CANCELLED', amountPaid: 1000 });
  });

  it('takes drops and pay-ins, but refuses payouts from the tablet', async () => {
    const movement = (type: 'DROP' | 'PAY_IN', amount: number) =>
      sync.command('shift.cash_movement', { movementId: ulid(), shiftId, type, amount });
    expect(await sync.pushOne(movement('DROP', 2000))).toMatchObject({ status: 'APPLIED' });
    expect(await sync.pushOne(movement('PAY_IN', 500))).toMatchObject({ status: 'APPLIED' });

    const drop = movement('DROP', 2000);
    const payout = { ...drop, payload: { ...drop.payload, type: 'PAYOUT' } };
    await request(app.getHttpServer())
      .post('/api/sync/push')
      .set('x-device-token', vendor.deviceToken)
      .send({ commands: [payout] })
      .expect(400);
  });

  it('closes the drawer with expected, counted and the difference', async () => {
    const closed = await sync.pushOne(sync.command('shift.close', { shiftId, counted: 13_000 }));
    expect(closed).toMatchObject({
      status: 'APPLIED',
      result: { expected: 13_500, counted: 13_000, variance: -500 },
    });
  });

  it('records a platform payment as money the platform owes, and starts the order', async () => {
    await inTenant((tx) =>
      tx
        .insert(channelCommissions)
        .values({ id: ulid(), tenantId: vendor.tenantId, source: 'BOLT_FOOD', rateBps: 2000 }),
    );
    const boltOrder = order([line(menu.sobolo, 3, 1000)], {
      source: 'BOLT_FOOD',
      type: 'PICKUP',
      customer: { phone: '0244000111' },
    });
    const [, paid] = await sync.push(
      boltOrder,
      sync.command('payment.record_platform', {
        paymentId: ulid(),
        orderId: boltOrder.payload.orderId,
        amount: 3000,
      }),
    );
    expect(paid).toMatchObject({
      status: 'APPLIED',
      result: { commissionEstimate: 600, status: 'PREPARING' },
    });
    const [receivable] = await inTenant((tx) =>
      tx
        .select()
        .from(platformReceivables)
        .where(eq(platformReceivables.orderId, boltOrder.payload.orderId)),
    );
    expect(receivable).toMatchObject({ source: 'BOLT_FOOD', gross: 3000, commissionEstimate: 600 });
  });

  it('lets the kitchen start unpaid orders when pay-first is switched off', async () => {
    await inTenant((tx) => tx.update(tenantSettings).set({ requirePaymentBeforePrep: false }));
    const unpaid = order([line(menu.sobolo, 1, 1000)]);
    await sync.pushOne(unpaid);
    const started = await sync.pushOne(
      sync.command('order.set_status', { orderId: unpaid.payload.orderId, status: 'PREPARING' }),
    );
    expect(started).toMatchObject({ status: 'APPLIED', result: { status: 'PREPARING' } });
  });

  it('adds prep to today and records the difference on a raw count', async () => {
    // 3 prepped, 2 sold: 1 left before this count.
    const prep = await sync.pushOne(
      sync.command('stock.prep_count', {
        movementId: ulid(),
        stockItemId: menu.jollofStock,
        quantity: 10,
        businessDate: today,
      }),
    );
    expect(prep).toMatchObject({ status: 'APPLIED', result: { onHand: 11 } });

    const riceBags = ulid();
    await inTenant((tx) =>
      tx.insert(stockItems).values({
        id: riceBags,
        tenantId: vendor.tenantId,
        kind: 'RAW',
        name: 'Rice (50 kg bag)',
        unit: 'bag',
        onHand: 5,
      }),
    );
    const counted = await sync.pushOne(
      sync.command('stock.raw_count', {
        movementId: ulid(),
        stockItemId: riceBags,
        counted: 3,
        businessDate: today,
      }),
    );
    expect(counted).toMatchObject({ status: 'APPLIED', result: { onHand: 3, difference: -2 } });
  });

  it('marks an item sold out and back again', async () => {
    const soldOut = async (value: boolean) => {
      await sync.pushOne(
        sync.command('item.set_sold_out', {
          itemId: menu.sobolo,
          soldOut: value,
          businessDate: today,
        }),
      );
      const [item] = await inTenant((tx) =>
        tx.select().from(items).where(eq(items.id, menu.sobolo)),
      );
      return item!.soldOutOn;
    };
    expect(await soldOut(true)).toBe(today);
    expect(await soldOut(false)).toBeNull();
  });

  it('keeps one customer per phone number', async () => {
    const first = await sync.pushOne(
      sync.command('customer.upsert', {
        customerId: ulid(),
        phone: '024 555 1234',
        name: 'Akosua',
      }),
    );
    const again = await sync.pushOne(
      sync.command('customer.upsert', {
        customerId: ulid(),
        phone: '+233245551234',
        name: 'Akosua M.',
      }),
    );
    expect(again.result!.customerId).toBe(first.result!.customerId);
    const [customer] = await inTenant((tx) =>
      tx
        .select()
        .from(customers)
        .where(eq(customers.id, first.result!.customerId as string)),
    );
    expect(customer).toMatchObject({ phone: '+233245551234', name: 'Akosua M.' });
  });

  it('gzips pull responses', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sync/pull')
      .set('x-device-token', vendor.deviceToken)
      .set('Accept-Encoding', 'gzip')
      .expect(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });
});
