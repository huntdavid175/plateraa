import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { syncClient } from '../test/sync-client';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

/**
 * A manager's money tools on the dashboard, with pay before prep on (the default):
 * - "cancelled": jollof × 2, GH₵90 cash, then cancelled, so GH₵90 is owed back;
 * - "unpaid": sobolo, GH₵10, nothing paid;
 * - "partly": jollof, GH₵45, GH₵20 paid in cash.
 * The drawer opened with a GH₵50 float.
 */
describe.skipIf(!hasDatabase())('manager money tools (against Neon)', () => {
  let app: NestExpressApplication;
  let vendor: Vendor;
  let sync: ReturnType<typeof syncClient>;
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  const shiftId = ulid();
  const ids = { cancelled: ulid(), unpaid: ulid(), partly: ulid() };

  const asOwner = (req: request.Test) =>
    req.set('Authorization', `Bearer ${vendor.session}`).set('x-tenant-id', vendor.tenantId);
  const get = (path: string) => asOwner(request(app.getHttpServer()).get(path));
  const post = (path: string, body: object) =>
    asOwner(request(app.getHttpServer()).post(path)).send(body);
  const put = (path: string, body: object) =>
    asOwner(request(app.getHttpServer()).put(path)).send(body);

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    vendor = await setUpVendor(app.getHttpServer(), 'Efua');
    const menu = await seedMenu(app, vendor.tenantId, today);
    sync = syncClient(app.getHttpServer(), vendor);

    const order = (
      orderId: string,
      displayNumber: string,
      itemId: string,
      qty: number,
      price: number,
    ) =>
      sync.command('order.create', {
        orderId,
        displayNumber,
        businessDate: today,
        source: 'POS',
        type: 'DINE_IN',
        lines: [{ lineId: ulid(), itemId, quantity: qty, unitPrice: price }],
      });
    const cash = (orderId: string, amount: number) =>
      sync.command('payment.record_cash', { paymentId: ulid(), orderId, shiftId, amount });

    const results = await sync.push(
      sync.command('shift.open', { shiftId, float: 5000 }),
      order(ids.cancelled, 'A1', menu.jollof, 2, 4500),
      cash(ids.cancelled, 9000),
      sync.command('order.cancel', { orderId: ids.cancelled, reason: 'Customer left' }),
      order(ids.unpaid, 'A2', menu.sobolo, 1, 1000),
      order(ids.partly, 'A3', menu.jollof, 1, 4500),
      cash(ids.partly, 2000),
    );
    expect(results.map((r) => r.status)).toEqual(Array(7).fill('APPLIED'));
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('records a refund given back, in parts, and only once per refund', async () => {
    const path = `/api/orders/${ids.cancelled}/refunds`;
    await post(path, {
      refundId: ulid(),
      amount: 9001,
      method: 'CASH',
      reason: 'Cancelled',
    }).expect(400);

    const first = { refundId: ulid(), amount: 4000, method: 'CASH', reason: 'Cancelled' };
    const recorded = await post(path, first).expect(201);
    expect(recorded.body).toEqual({ refundId: first.refundId, amountPaid: 5000, refundOwed: 5000 });
    const again = await post(path, first).expect(201);
    expect(again.body).toMatchObject({ amountPaid: 5000, refundOwed: 5000 });

    const rest = await post(path, {
      refundId: ulid(),
      amount: 5000,
      method: 'LINK',
      reason: 'Cancelled',
    }).expect(201);
    expect(rest.body).toMatchObject({ amountPaid: 0, refundOwed: 0 });

    expect((await get('/api/orders/refunds-owed').expect(200)).body).toEqual([]);
    const detail = await get(`/api/orders/${ids.cancelled}`).expect(200);
    expect(detail.body.refunds).toHaveLength(2);
    await post(path, { refundId: ulid(), amount: 100, method: 'CASH', reason: 'Again' }).expect(
      400,
    );
  });

  it('discounts an unpaid order, re-priced on the server', async () => {
    const path = `/api/orders/${ids.unpaid}/discount`;
    const percent = await put(path, { kind: 'percent', bps: 1000 }).expect(200);
    expect(percent.body).toMatchObject({ discount: 100, total: 900, amountDue: 900 });

    const amount = await put(path, { kind: 'amount', amount: 300 }).expect(200);
    expect(amount.body).toMatchObject({ discount: 300, total: 700, status: 'CONFIRMED' });

    const paid = await sync.pushOne(
      sync.command('payment.record_cash', {
        paymentId: ulid(),
        orderId: ids.unpaid,
        shiftId,
        amount: 700,
      }),
    );
    expect(paid).toMatchObject({ status: 'APPLIED', result: { amountPaid: 700 } });
    await put(path, { kind: 'none' }).expect(400);
  });

  it('sends an order to the kitchen when a discount clears what is owed', async () => {
    const res = await put(`/api/orders/${ids.partly}/discount`, {
      kind: 'amount',
      amount: 2500,
    }).expect(200);
    expect(res.body).toMatchObject({ total: 2000, amountPaid: 2000, status: 'PREPARING' });
  });

  it('records a payout from an open drawer and books it as an expense', async () => {
    const before = await get('/api/drawers').expect(200);
    // Float 50 + cash 90 + 7 + 20. The refunds were paid from outside the drawer.
    expect(before.body).toEqual([
      expect.objectContaining({ shiftId, deviceName: 'Counter tablet', expectedCash: 16700 }),
    ]);

    const path = `/api/drawers/${shiftId}/payouts`;
    await post(path, { payoutId: ulid(), amount: 20000, category: 'GAS' }).expect(400);
    const payout = { payoutId: ulid(), amount: 2500, category: 'GAS', note: 'Gas refill' };
    await post(path, payout).expect(201);
    await post(path, payout).expect(201);

    const after = await get('/api/drawers').expect(200);
    expect(after.body[0]).toMatchObject({ expectedCash: 14200 });
    const day = await get('/api/reports/day').expect(200);
    expect(day.body).toMatchObject({ moneyOut: 2500, expenses: 1 });
  });
});
