import type { NestExpressApplication } from '@nestjs/platform-express';
import { auditEvents, eq, withTenant, type Database } from '@plateraa/db';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { syncClient } from '../test/sync-client';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

/**
 * Customers on the dashboard. Pushed the way a tablet would:
 * - A: a phone order from Kofi (+233241234567), jollof GH₵45, paid cash;
 * - B: another from the same number typed the local way (024…), sobolo GH₵10, not paid;
 * - C: a walk-in with no number.
 */
describe.skipIf(!hasDatabase())('customers (against Neon)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let vendor: Vendor;
  let sync: ReturnType<typeof syncClient>;
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  const shiftId = ulid();
  const ids = { a: ulid(), b: ulid(), c: ulid() };
  const kofi = '+233241234567';

  const server = () => app.getHttpServer();
  const asOwner = (req: request.Test) =>
    req.set('Authorization', `Bearer ${vendor.session}`).set('x-tenant-id', vendor.tenantId);
  const list = async (search?: string) =>
    (
      await asOwner(request(server()).get('/api/customers'))
        .query(search ? { search } : {})
        .expect(200)
    ).body as { id: string; phone: string }[];

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    db = app.get<DatabaseHandle>(DATABASE).db;
    vendor = await setUpVendor(server(), 'Abena');
    const menu = await seedMenu(app, vendor.tenantId, today);
    sync = syncClient(server(), vendor);

    const line = (itemId: string, unitPrice: number) => [
      { lineId: ulid(), itemId, quantity: 1, unitPrice },
    ];
    const results = await sync.push(
      sync.command('shift.open', { shiftId, float: 5000 }),
      sync.command('order.create', {
        orderId: ids.a,
        displayNumber: 'A1',
        businessDate: today,
        source: 'PHONE',
        type: 'PICKUP',
        customer: { phone: kofi, name: 'Kofi' },
        lines: line(menu.jollof, 4500),
      }),
      sync.command('payment.record_cash', {
        paymentId: ulid(),
        orderId: ids.a,
        shiftId,
        amount: 4500,
      }),
      sync.command('order.create', {
        orderId: ids.b,
        displayNumber: 'A2',
        businessDate: today,
        source: 'PHONE',
        type: 'PICKUP',
        customer: { phone: '0241234567' },
        lines: line(menu.sobolo, 1000),
      }),
      sync.command('order.create', {
        orderId: ids.c,
        displayNumber: 'A3',
        businessDate: today,
        source: 'POS',
        type: 'WALK_IN',
        lines: line(menu.sobolo, 1000),
      }),
    );
    expect(results.map((r) => r.status)).toEqual(Array(5).fill('APPLIED'));
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('lists customers with what they ordered', async () => {
    expect(await list()).toEqual([
      {
        id: expect.any(String),
        phone: kofi,
        name: 'Kofi',
        notes: null,
        orders: 2,
        spent: 5500,
        firstOrderOn: today,
        lastOrderOn: today,
      },
    ]);
  });

  it('finds a customer by part of a name or number', async () => {
    expect(await list('kof')).toHaveLength(1);
    expect(await list('024 123')).toHaveLength(1);
    expect(await list('+233 24123')).toHaveLength(1);
    expect(await list('ama')).toEqual([]);
    expect(await list('%')).toEqual([]);
  });

  it('shows one customer with their orders, and each order links back to them', async () => {
    const [customer] = await list();
    const res = await asOwner(request(server()).get(`/api/customers/${customer!.id}`)).expect(200);
    expect(res.body).toMatchObject({ phone: kofi, orders: 2, spent: 5500 });
    const orderIds = (res.body.recentOrders as { id: string }[]).map((order) => order.id);
    expect(orderIds.sort()).toEqual([ids.a, ids.b].sort());

    const order = await asOwner(request(server()).get(`/api/orders/${ids.a}`)).expect(200);
    expect(order.body.customerId).toBe(customer!.id);
    await asOwner(request(server()).get(`/api/customers/${ulid()}`)).expect(404);
  });

  it('changes the name and notes, audited, and the tablet gets them', async () => {
    const [customer] = await list();
    const path = `/api/customers/${customer!.id}`;
    await asOwner(request(server()).put(path))
      .send({ name: 'Kofi Mensah', notes: 'Call on arrival' })
      .expect(204);
    expect((await asOwner(request(server()).get(path)).expect(200)).body).toMatchObject({
      name: 'Kofi Mensah',
      notes: 'Call on arrival',
    });

    const pulled = await request(server())
      .get('/api/sync/pull')
      .set('x-device-token', vendor.deviceToken)
      .expect(200);
    expect(pulled.body.changes.customers).toEqual([
      expect.objectContaining({ id: customer!.id, name: 'Kofi Mensah', notes: 'Call on arrival' }),
    ]);

    await asOwner(request(server()).put(path)).send({ name: '', notes: '' }).expect(204);
    expect((await asOwner(request(server()).get(path)).expect(200)).body).toMatchObject({
      name: null,
      notes: null,
    });

    const audit = await withTenant(db, vendor.tenantId, (tx) =>
      tx
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(eq(auditEvents.entityId, customer!.id)),
    );
    expect(audit).toEqual([{ action: 'customer.updated' }, { action: 'customer.updated' }]);
  });

  it('hides what customers spent from staff, and keeps editing from them', async () => {
    const cashier = await asOwner(request(server()).post('/api/staff'))
      .send({ displayName: 'Yaw', role: 'STAFF', pin: '305871' })
      .expect(201);
    const login = await request(server())
      .post('/api/sessions/pin')
      .set('x-device-token', vendor.deviceToken)
      .send({ staffId: cashier.body.id, pin: '305871' })
      .expect(200);
    const asStaff = (req: request.Test) =>
      req
        .set('x-device-token', vendor.deviceToken)
        .set('Authorization', `Bearer ${login.body.token}`);

    const res = await asStaff(request(server()).get('/api/customers')).expect(200);
    expect(res.body[0]).toMatchObject({ orders: 2, spent: null });
    await asStaff(request(server()).put(`/api/customers/${res.body[0].id}`))
      .send({ name: 'Someone', notes: '' })
      .expect(403);
  });
});
