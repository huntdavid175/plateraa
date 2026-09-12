import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { removeVendors, setUpVendor, type Vendor } from '../test/fixtures';
import { syncClient } from '../test/sync-client';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

/** Expenses, purchases that restock an ingredient, and ingredient counts, from the dashboard. */
describe.skipIf(!hasDatabase())('expenses and stock (against Neon)', () => {
  let app: NestExpressApplication;
  let vendor: Vendor;
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  const rice = ulid();
  const purchase = ulid();

  const asOwner = (req: request.Test) =>
    req.set('Authorization', `Bearer ${vendor.session}`).set('x-tenant-id', vendor.tenantId);
  const server = () => app.getHttpServer();
  const get = async (path: string) => (await asOwner(request(server()).get(path)).expect(200)).body;
  const riceRow = async () =>
    ((await get('/api/stock')) as { id: string }[]).find((row) => row.id === rice);

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    vendor = await setUpVendor(server(), 'Esi');
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('adds an ingredient that is already running low', async () => {
    await asOwner(request(server()).post('/api/stock'))
      .send({ id: rice, name: 'Rice', unit: 'bag', lowThreshold: 3, onHand: 2 })
      .expect(201);
    expect(await riceRow()).toEqual({
      id: rice,
      name: 'Rice',
      unit: 'bag',
      onHand: 2,
      lowThreshold: 3,
      low: true,
    });
  });

  it('records a purchase once, adding to the stock and to money out', async () => {
    const body = {
      id: purchase,
      amount: 250_000,
      category: 'INGREDIENTS',
      method: 'MOMO',
      spentOn: today,
      supplierName: 'Makola',
      purchase: { stockItemId: rice, quantity: 5 },
    };
    await asOwner(request(server()).post('/api/expenses')).send(body).expect(201);
    await asOwner(request(server()).post('/api/expenses')).send(body).expect(201);
    expect(await riceRow()).toMatchObject({ onHand: 7, low: false });

    const list = await get('/api/expenses');
    expect(list).toEqual([
      expect.objectContaining({
        id: purchase,
        amount: 250_000,
        method: 'MOMO',
        fromDrawer: false,
        purchase: { stockItemId: rice, name: 'Rice', unit: 'bag', quantity: 5 },
        by: 'Esi',
      }),
    ]);
    expect((await get('/api/reports/day')).moneyOut).toBe(250_000);
  });

  it('counts an ingredient, recording the difference', async () => {
    const counted = await asOwner(request(server()).post(`/api/stock/${rice}/count`))
      .send({ movementId: ulid(), counted: 6 })
      .expect(201);
    expect(counted.body).toEqual({ onHand: 6, difference: -1 });
  });

  it('takes a purchase back out, and its stock with it', async () => {
    await asOwner(request(server()).delete(`/api/expenses/${purchase}`)).expect(204);
    expect(await get('/api/expenses')).toEqual([]);
    expect(await riceRow()).toMatchObject({ onHand: 1, low: true });
  });

  it('keeps a drawer payout, which the drawer counts on', async () => {
    const shiftId = ulid();
    const sync = syncClient(server(), vendor);
    await sync.pushOne(sync.command('shift.open', { shiftId, float: 5000 }));
    await asOwner(request(server()).post(`/api/drawers/${shiftId}/payouts`))
      .send({ payoutId: ulid(), amount: 1000, category: 'GAS' })
      .expect(201);
    const [payout] = await get('/api/expenses');
    expect(payout).toMatchObject({ fromDrawer: true, method: 'CASH_DRAWER' });
    await asOwner(request(server()).delete(`/api/expenses/${payout.id}`)).expect(400);
  });

  it('refuses a date that hasn’t come yet', async () => {
    await asOwner(request(server()).post('/api/expenses'))
      .send({ id: ulid(), amount: 100, category: 'OTHER', method: 'OTHER', spentOn: '2099-01-01' })
      .expect(400);
  });
});
