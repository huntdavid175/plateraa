import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, dailyReports, eq, sql, withTenant, type Database } from '@plateraa/db';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { syncClient } from '../test/sync-client';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';
import { REPORT_VERSION, shiftDay } from './daily';

/**
 * Finished days are kept in daily_reports and read back from there, until something on the day
 * changes. Three days ago, pushed the way a tablet would:
 * - A: jollof, GH₵45 cash;
 * - B: sobolo, GH₵10 cash.
 */
describe.skipIf(!hasDatabase())('kept daily reports (against Neon)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let vendor: Vendor;
  let sync: ReturnType<typeof syncClient>;
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  const past = shiftDay(today, -3);
  const shiftId = ulid();
  const ids = { a: ulid(), b: ulid() };

  const asOwner = (req: request.Test) =>
    req.set('Authorization', `Bearer ${vendor.session}`).set('x-tenant-id', vendor.tenantId);
  const day = async (date: string) =>
    (await asOwner(request(app.getHttpServer()).get(`/api/reports/day?date=${date}`)).expect(200))
      .body;
  const kept = (date: string) =>
    withTenant(db, vendor.tenantId, (tx) =>
      tx.select().from(dailyReports).where(eq(dailyReports.businessDate, date)),
    );

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    db = app.get<DatabaseHandle>(DATABASE).db;
    vendor = await setUpVendor(app.getHttpServer(), 'Afua');
    const menu = await seedMenu(app, vendor.tenantId, past);
    sync = syncClient(app.getHttpServer(), vendor);

    const order = (orderId: string, displayNumber: string, itemId: string, unitPrice: number) =>
      sync.command('order.create', {
        orderId,
        displayNumber,
        businessDate: past,
        source: 'POS',
        type: 'WALK_IN',
        lines: [{ lineId: ulid(), itemId, quantity: 1, unitPrice }],
      });
    const cash = (orderId: string, amount: number) =>
      sync.command('payment.record_cash', { paymentId: ulid(), orderId, shiftId, amount });

    const results = await sync.push(
      sync.command('shift.open', { shiftId, float: 5000 }),
      order(ids.a, 'A1', menu.jollof, 4500),
      cash(ids.a, 4500),
      order(ids.b, 'A2', menu.sobolo, 1000),
      cash(ids.b, 1000),
    );
    expect(results.map((r) => r.status)).toEqual(Array(5).fill('APPLIED'));
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('keeps a finished day once it has been worked out', async () => {
    expect(await kept(past)).toEqual([]);
    expect(await day(past)).toMatchObject({ date: past, orders: 2, sales: 5500, moneyIn: 5500 });

    const [row] = await kept(past);
    expect(row).toMatchObject({ version: REPORT_VERSION, businessDate: past });
    expect(row!.figures).toMatchObject({ orders: 2, moneyIn: 5500 });
  });

  it('reads a finished day back from what was kept', async () => {
    // Change the kept figures by hand: if the report shows them, it read them rather than the orders.
    await withTenant(db, vendor.tenantId, (tx) =>
      tx
        .update(dailyReports)
        .set({ figures: sql`jsonb_set(${dailyReports.figures}, '{orders}', '99')` })
        .where(eq(dailyReports.businessDate, past)),
    );
    expect(await day(past)).toMatchObject({ orders: 99 });
  });

  it('works the day out again when a late cancel or refund changes it', async () => {
    const cancelled = await sync.pushOne(
      sync.command('order.cancel', { orderId: ids.b, reason: 'Wrong order' }),
    );
    expect(cancelled.status).toBe('APPLIED');
    // B's cash still counts until its refund is recorded.
    expect(await day(past)).toMatchObject({ orders: 1, sales: 4500, moneyIn: 5500 });

    await asOwner(request(app.getHttpServer()).post(`/api/orders/${ids.b}/refunds`))
      .send({ refundId: ulid(), amount: 1000, method: 'CASH', reason: 'Wrong order' })
      .expect(201);
    expect(await day(past)).toMatchObject({ orders: 1, moneyIn: 4500 });
    const [row] = await kept(past);
    expect(row!.figures).toMatchObject({ orders: 1, moneyIn: 4500 });
  });

  it('counts an expense typed in later for that day', async () => {
    await asOwner(request(app.getHttpServer()).post('/api/expenses'))
      .send({ id: ulid(), amount: 700, category: 'GAS', method: 'OWNER_CASH', spentOn: past })
      .expect(201);
    const res = await asOwner(
      request(app.getHttpServer()).get(`/api/reports/period?from=${past}&to=${today}`),
    ).expect(200);
    expect(res.body.totals).toMatchObject({ orders: 1, moneyIn: 4500, moneyOut: 700 });
    expect(res.body.byDay[0]).toEqual({
      date: past,
      orders: 1,
      sales: 4500,
      moneyIn: 4500,
      moneyOut: 700,
    });
    expect(res.body.byItem).toEqual([{ name: 'Jollof rice', quantity: 1, sales: 4500 }]);
    expect(res.body.staff).toEqual([{ name: 'Afua', orders: 1, sales: 4500, cash: 5500 }]);
  });

  it('keeps the quiet days in the range too, but never today', async () => {
    const rows = await withTenant(db, vendor.tenantId, (tx) =>
      tx
        .select({ date: dailyReports.businessDate })
        .from(dailyReports)
        .where(and(eq(dailyReports.tenantId, vendor.tenantId))),
    );
    expect(rows.map((row) => row.date).sort()).toEqual([
      past,
      shiftDay(today, -2),
      shiftDay(today, -1),
    ]);
  });
});
