import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { syncClient } from '../test/sync-client';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

/**
 * Three drawers on one tablet, one after another, pushed the way the tablet would:
 * - 1: float GH₵50, GH₵90 cash, a GH₵30 drop; expected GH₵110, counted GH₵95: GH₵15 short;
 * - 2: float GH₵20, GH₵45 cash; expected GH₵65, counted GH₵65.50: within GH₵1, so exact;
 * - 3: float nothing, GH₵10 cash, a GH₵5 pay-in; expected GH₵15, counted GH₵35: GH₵20 over.
 */
describe.skipIf(!hasDatabase())('cash over and short (against Neon)', () => {
  let app: NestExpressApplication;
  let vendor: Vendor;
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  const drawers = { short: ulid(), exact: ulid(), over: ulid() };

  const dashboard = (path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${vendor.session}`)
      .set('x-tenant-id', vendor.tenantId);

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    vendor = await setUpVendor(app.getHttpServer(), 'Adwoa');
    const menu = await seedMenu(app, vendor.tenantId, today);
    const sync = syncClient(app.getHttpServer(), vendor);

    const sale = (shiftId: string, displayNumber: string, quantity: number, unitPrice: number) => {
      const orderId = ulid();
      return [
        sync.command('order.create', {
          orderId,
          displayNumber,
          businessDate: today,
          source: 'POS',
          type: 'PICKUP',
          lines: [{ lineId: ulid(), itemId: menu.jollof, quantity, unitPrice }],
        }),
        sync.command('payment.record_cash', {
          paymentId: ulid(),
          orderId,
          shiftId,
          amount: quantity * unitPrice,
        }),
      ];
    };
    const moveCash = (shiftId: string, type: 'DROP' | 'PAY_IN', amount: number) =>
      sync.command('shift.cash_movement', {
        movementId: ulid(),
        shiftId,
        type,
        amount,
        note: type === 'DROP' ? 'To the safe' : 'Change from the bank',
      });

    const results = await sync.push(
      sync.command('shift.open', { shiftId: drawers.short, float: 5000 }),
      ...sale(drawers.short, 'A1', 2, 4500),
      moveCash(drawers.short, 'DROP', 3000),
      sync.command('shift.close', { shiftId: drawers.short, counted: 9500 }),

      sync.command('shift.open', { shiftId: drawers.exact, float: 2000 }),
      ...sale(drawers.exact, 'A2', 1, 4500),
      sync.command('shift.close', { shiftId: drawers.exact, counted: 6550 }),

      sync.command('shift.open', { shiftId: drawers.over, float: 0 }),
      ...sale(drawers.over, 'A3', 1, 1000),
      moveCash(drawers.over, 'PAY_IN', 500),
      sync.command('shift.close', { shiftId: drawers.over, counted: 3500 }),
    );
    expect(results.map((r) => r.status)).toEqual(Array(14).fill('APPLIED'));
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('adds up the closes, with GH₵1 either way counted as exact', async () => {
    const res = await dashboard(`/api/cash/closes?from=${today}&to=${today}`).expect(200);
    expect(res.body.tolerance).toBe(100);
    expect(res.body.summary).toEqual({
      closes: 3,
      exact: 1,
      short: 1,
      over: 1,
      shortAmount: 1500,
      overAmount: 2000,
    });
    const byId = new Map(
      (res.body.closes as { shiftId: string }[]).map((close) => [close.shiftId, close]),
    );
    expect(byId.get(drawers.short)).toMatchObject({
      float: 5000,
      expected: 11000,
      counted: 9500,
      variance: -1500,
      result: 'SHORT',
      openedBy: 'Adwoa',
      closedBy: 'Adwoa',
    });
    expect(byId.get(drawers.exact)).toMatchObject({ variance: 50, result: 'EXACT' });
    expect(byId.get(drawers.over)).toMatchObject({
      expected: 1500,
      variance: 2000,
      result: 'OVER',
    });
  });

  it('says who was on the drawers', async () => {
    const res = await dashboard(`/api/cash/closes?from=${today}&to=${today}`).expect(200);
    expect(res.body.people).toEqual([
      {
        staffId: vendor.ownerStaffId,
        name: 'Adwoa',
        closes: 3,
        short: 1,
        over: 1,
        shortAmount: 1500,
        overAmount: 2000,
      },
    ]);
  });

  it('shows how one drawer’s expected cash was worked out', async () => {
    const res = await dashboard(`/api/cash/closes/${drawers.short}`).expect(200);
    expect(res.body).toMatchObject({
      status: 'CLOSED',
      float: 5000,
      cashSales: 9000,
      payIns: 0,
      payouts: 0,
      drops: 3000,
      expected: 11000,
      expectedNow: 11000,
      counted: 9500,
      variance: -1500,
      result: 'SHORT',
      movements: [{ type: 'DROP', amount: 3000, note: 'To the safe', by: 'Adwoa' }],
      cashBy: [{ staffId: vendor.ownerStaffId, name: 'Adwoa', amount: 9000, payments: 1 }],
    });
    const over = await dashboard(`/api/cash/closes/${drawers.over}`).expect(200);
    expect(over.body).toMatchObject({ payIns: 500, cashSales: 1000, expectedNow: 1500 });
  });

  it('keeps to the days asked for, and refuses what it can’t answer', async () => {
    const res = await dashboard('/api/cash/closes?from=2020-01-01&to=2020-01-07').expect(200);
    expect(res.body.summary.closes).toBe(0);
    expect(res.body.people).toEqual([]);
    await dashboard(`/api/cash/closes?from=${today}&to=2020-01-01`).expect(400);
    await dashboard('/api/cash/closes?from=2026-01-01&to=2026-12-31').expect(400);
    await dashboard(`/api/cash/closes/${ulid()}`).expect(404);
  });
});
