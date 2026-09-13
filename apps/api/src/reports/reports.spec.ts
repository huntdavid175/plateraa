import type { NestExpressApplication } from '@nestjs/platform-express';
import { channelCommissions, expenses, locations, withTenant, type Database } from '@plateraa/db';
import { pesewas } from '@plateraa/shared';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { syncClient } from '../test/sync-client';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

/**
 * One trading day, pushed the way a tablet would:
 * - A: jollof × 2, GH₵90 cash;
 * - B: sobolo, GH₵10, not paid;
 * - C: a Bolt order, GH₵45 paid via the platform, 20% commission;
 * - D: sobolo, GH₵10 cash, then cancelled (refund owed).
 * Plus a GH₵25 gas expense.
 */
describe.skipIf(!hasDatabase())('reports and order lists (against Neon)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let vendor: Vendor;
  let sync: ReturnType<typeof syncClient>;
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  const shiftId = ulid();
  const ids = { a: ulid(), b: ulid(), c: ulid(), d: ulid() };

  const dashboard = (path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${vendor.session}`)
      .set('x-tenant-id', vendor.tenantId);

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    db = app.get<DatabaseHandle>(DATABASE).db;
    vendor = await setUpVendor(app.getHttpServer(), 'Adwoa');
    const menu = await seedMenu(app, vendor.tenantId, today);
    sync = syncClient(app.getHttpServer(), vendor);

    await withTenant(db, vendor.tenantId, async (tx) => {
      await tx.insert(channelCommissions).values({
        id: ulid(),
        tenantId: vendor.tenantId,
        source: 'BOLT_FOOD',
        rateBps: 2000,
      });
      const [location] = await tx.select({ id: locations.id }).from(locations);
      await tx.insert(expenses).values({
        id: ulid(),
        tenantId: vendor.tenantId,
        locationId: location!.id,
        amount: pesewas(2500),
        category: 'GAS',
        method: 'OWNER_CASH',
        spentOn: today,
        createdBy: vendor.ownerStaffId,
      });
    });

    const order = (
      orderId: string,
      displayNumber: string,
      itemId: string,
      quantity: number,
      unitPrice: number,
      source: 'POS' | 'BOLT_FOOD' = 'POS',
    ) =>
      sync.command('order.create', {
        orderId,
        displayNumber,
        businessDate: today,
        source,
        type: 'DINE_IN',
        lines: [{ lineId: ulid(), itemId, quantity, unitPrice }],
      });
    const cash = (orderId: string, amount: number) =>
      sync.command('payment.record_cash', { paymentId: ulid(), orderId, shiftId, amount });

    const results = await sync.push(
      sync.command('shift.open', { shiftId, float: 5000 }),
      order(ids.a, 'A1', menu.jollof, 2, 4500),
      cash(ids.a, 9000),
      order(ids.b, 'A2', menu.sobolo, 1, 1000),
      order(ids.c, 'A3', menu.jollof, 1, 4500, 'BOLT_FOOD'),
      sync.command('payment.record_platform', { paymentId: ulid(), orderId: ids.c, amount: 4500 }),
      order(ids.d, 'A4', menu.sobolo, 1, 1000),
      cash(ids.d, 1000),
      sync.command('order.cancel', { orderId: ids.d, reason: 'Changed mind' }),
    );
    expect(results.map((r) => r.status)).toEqual(Array(9).fill('APPLIED'));
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('adds up the day', async () => {
    const res = await dashboard('/api/reports/day').expect(200);
    expect(res.body).toMatchObject({
      date: today,
      orders: 3, // D was cancelled
      sales: 14500,
      moneyIn: 10000, // A's cash, and D's until its refund is recorded
      platformOwed: 4500,
      unpaid: 1000,
      notYetCollected: 5500,
      commissionEstimate: 900,
      moneyOut: 2500,
      expenses: 1,
      left: 7500,
      profit: 11100, // 10000 + 4500 − 900 − 2500
    });
    expect(res.body.bySource).toEqual(
      expect.arrayContaining([
        { source: 'POS', orders: 2, sales: 10000 },
        { source: 'BOLT_FOOD', orders: 1, sales: 4500 },
      ]),
    );
    expect(res.body.byType).toEqual([{ type: 'DINE_IN', orders: 3, sales: 14500 }]);
    expect(res.body.byMethod).toEqual(
      expect.arrayContaining([
        { method: 'CASH', amount: 10000 },
        { method: 'PLATFORM', amount: 4500 },
      ]),
    );
    const byHour = res.body.byHour as { moneyIn: number }[];
    expect(byHour.reduce((sum, hour) => sum + hour.moneyIn, 0)).toBe(10000);
  });

  it('adds up a range of days: best sellers, staff, expenses and profit and loss', async () => {
    const res = await dashboard(`/api/reports/period?from=${today}&to=${today}`).expect(200);
    expect(res.body.totals).toEqual({
      orders: 3,
      sales: 14500,
      moneyIn: 10000,
      platformOwed: 4500,
      commissionEstimate: 900,
      moneyOut: 2500,
      purchases: 0,
      otherExpenses: 2500,
      left: 7500,
      profit: 11100,
    });
    expect(res.body.byDay).toEqual([
      { date: today, orders: 3, sales: 14500, moneyIn: 10000, moneyOut: 2500 },
    ]);
    // D was cancelled, so its sobolo doesn't count.
    expect(res.body.byItem).toEqual([
      { name: 'Jollof rice', quantity: 3, sales: 13500 },
      { name: 'Sobolo', quantity: 1, sales: 1000 },
    ]);
    expect(res.body.byCategory).toEqual([{ category: 'GAS', amount: 2500 }]);
    expect(res.body.byType).toEqual([{ type: 'DINE_IN', orders: 3, sales: 14500 }]);
    expect(res.body.staff).toEqual([
      { staffId: vendor.ownerStaffId, name: 'Adwoa', orders: 3, sales: 14500, cash: 10000 },
    ]);
    expect(res.body.drawerCloses).toEqual([]);

    await dashboard(`/api/reports/period?from=${today}&to=2020-01-01`).expect(400);
    await dashboard('/api/reports/period?from=2026-01-01&to=2026-12-31').expect(400);
  });

  it('gives an empty day for a day with nothing on it', async () => {
    const res = await dashboard('/api/reports/day?date=2026-01-01').expect(200);
    expect(res.body).toMatchObject({ orders: 0, moneyIn: 0, moneyOut: 0, byHour: [] });
  });

  it('keeps the day’s money from staff the owner hasn’t allowed', async () => {
    const server = app.getHttpServer();
    const cashier = await request(server)
      .post('/api/staff')
      .set('Authorization', `Bearer ${vendor.session}`)
      .set('x-tenant-id', vendor.tenantId)
      .send({ displayName: 'Kojo', role: 'STAFF', pin: '305871' })
      .expect(201);
    const login = await request(server)
      .post('/api/sessions/pin')
      .set('x-device-token', vendor.deviceToken)
      .send({ staffId: cashier.body.id, pin: '305871' })
      .expect(200);
    await request(server)
      .get('/api/reports/day')
      .set('x-device-token', vendor.deviceToken)
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(403);
  });

  it('lists the day’s orders, newest first, with what was ordered and how it was paid', async () => {
    const res = await dashboard('/api/orders').expect(200);
    const rows = res.body as { id: string }[];
    expect(rows.map((row) => row.id).sort()).toEqual(Object.values(ids).sort());
    expect(rows.find((row) => row.id === ids.a)).toMatchObject({
      displayNumber: 'A1',
      source: 'POS',
      total: 9000,
      amountDue: 9000,
      amountPaid: 9000,
      refundOwed: 0,
      paidWith: ['CASH'],
      items: [{ name: 'Jollof rice', variantName: null, quantity: 2 }],
      takenBy: 'Adwoa',
      customerPhone: null,
    });

    const limited = await dashboard('/api/orders?limit=2').expect(200);
    expect(limited.body).toHaveLength(2);
  });

  it('shows one order in full: lines, payments and its history', async () => {
    const res = await dashboard(`/api/orders/${ids.d}`).expect(200);
    expect(res.body).toMatchObject({
      id: ids.d,
      displayNumber: 'A4',
      status: 'CANCELLED',
      cancelReason: 'Changed mind',
      takenBy: 'Adwoa',
      refundOwed: 1000,
      items: [{ name: 'Sobolo', quantity: 1, unitPrice: 1000, lineTotal: 1000, modifiers: [] }],
      payments: [{ method: 'CASH', status: 'CONFIRMED', amount: 1000, by: 'Adwoa' }],
      refunds: [],
      links: [],
    });
    expect(res.body.history.at(-1)).toMatchObject({ to: 'CANCELLED', by: 'Adwoa' });

    await dashboard(`/api/orders/${ulid()}`).expect(404);
  });

  it('lists the orders owed a refund', async () => {
    const res = await dashboard('/api/orders/refunds-owed').expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({ id: ids.d, status: 'CANCELLED', refundOwed: 1000 }),
    ]);
  });

  it('filters the orders the way the dashboard’s figures link to them', async () => {
    const found = async (query: string) =>
      ((await dashboard(`/api/orders?${query}`).expect(200)).body as { id: string }[])
        .map((row) => row.id)
        .sort();
    const sorted = (...list: string[]) => [...list].sort();

    expect(await found(`from=${today}&to=${today}`)).toEqual(sorted(ids.a, ids.b, ids.c, ids.d));
    expect(await found('source=BOLT_FOOD')).toEqual([ids.c]);
    expect(await found('type=DINE_IN')).toEqual(sorted(ids.a, ids.b, ids.c, ids.d));
    expect(await found('type=DELIVERY')).toEqual([]);
    expect(await found('paid=PAID')).toEqual(sorted(ids.a, ids.c));
    expect(await found('paid=UNPAID')).toEqual([ids.b]);
    expect(await found('paid=REFUND_OWED')).toEqual([ids.d]);
    expect(await found('method=CASH')).toEqual(sorted(ids.a, ids.d));
    expect(await found('method=CASH,LINK')).toEqual(sorted(ids.a, ids.d));
    expect(await found('method=PLATFORM')).toEqual([ids.c]);
    expect(await found('item=Sobolo')).toEqual(sorted(ids.b, ids.d));
    expect(await found(`staffId=${vendor.ownerStaffId}&source=POS&paid=PAID`)).toEqual([ids.a]);

    await dashboard(`/api/orders?from=${today}`).expect(400);
    await dashboard(`/api/orders?from=${today}&to=2020-01-01`).expect(400);
    await dashboard('/api/orders?from=2026-01-01&to=2026-12-31').expect(400);
    await dashboard('/api/orders?method=CHEQUE').expect(400);
  });
});
