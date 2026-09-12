import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq, items, orders, stockItems, withTenant, type Database } from '@plateraa/db';
import type { SyncCommandInput } from '@plateraa/shared';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

describe.skipIf(!hasDatabase())('sync (against Neon)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let db: Database;
  let vendor: Vendor;
  let menu: Awaited<ReturnType<typeof seedMenu>>;
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  let seq = 0;

  function command<T extends SyncCommandInput['type']>(
    type: T,
    payload: Extract<SyncCommandInput, { type: T }>['payload'],
    staffId = vendor.ownerStaffId,
  ) {
    return {
      id: ulid(),
      deviceSeq: ++seq,
      deviceTs: new Date().toISOString(),
      staffId,
      type,
      payload,
    };
  }

  const line = (itemId: string, quantity: number, unitPrice: number) => ({
    lineId: ulid(),
    itemId,
    quantity,
    unitPrice,
  });

  const walkIn = (lines: ReturnType<typeof line>[], staffId?: string) =>
    command(
      'order.create',
      {
        orderId: ulid(),
        displayNumber: '001',
        businessDate: today,
        source: 'POS',
        type: 'WALK_IN',
        lines,
      },
      staffId,
    );

  async function push(commands: unknown[]) {
    const res = await request(server)
      .post('/api/sync/push')
      .set('x-device-token', vendor.deviceToken)
      .send({ commands })
      .expect(200);
    return res.body.results as Array<Record<string, unknown>>;
  }

  async function pull(cursor?: string) {
    const res = await request(server)
      .get('/api/sync/pull')
      .query(cursor ? { cursor } : {})
      .set('x-device-token', vendor.deviceToken)
      .expect(200);
    return res.body as { cursor: string; changes: Record<string, Array<Record<string, unknown>>> };
  }

  const stockOnHand = async () => {
    const [stock] = await withTenant(db, vendor.tenantId, (tx) =>
      tx.select().from(stockItems).where(eq(stockItems.id, menu.jollofStock)),
    );
    const [jollof] = await withTenant(db, vendor.tenantId, (tx) =>
      tx.select().from(items).where(eq(items.id, menu.jollof)),
    );
    return { onHand: stock!.onHand, soldOutOn: jollof!.soldOutOn };
  };

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    server = app.getHttpServer();
    db = app.get<DatabaseHandle>(DATABASE).db;
    vendor = await setUpVendor(server);
    menu = await seedMenu(app, vendor.tenantId, today);
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  let firstOrder: ReturnType<typeof walkIn>;

  it('applies an order once, however often it is pushed', async () => {
    firstOrder = walkIn([line(menu.jollof, 2, 4500)]);
    const [first] = await push([firstOrder]);
    expect(first).toMatchObject({ status: 'APPLIED', result: { total: 9000, reviewReasons: [] } });

    const [again] = await push([firstOrder]);
    expect(again).toEqual(first);
    const saved = await withTenant(db, vendor.tenantId, (tx) =>
      tx.select().from(orders).where(eq(orders.id, firstOrder.payload.orderId)),
    );
    expect(saved).toHaveLength(1);
  });

  it('counts down prep stock and marks the item sold out at zero', async () => {
    expect(await stockOnHand()).toEqual({ onHand: 1, soldOutOn: null });
    await push([walkIn([line(menu.jollof, 1, 4500)])]);
    expect(await stockOnHand()).toEqual({ onHand: 0, soldOutOn: today });
  });

  it('keeps a sale with a wrong price but flags it for review', async () => {
    const [result] = await push([walkIn([line(menu.sobolo, 1, 800)])]);
    expect(result).toMatchObject({
      status: 'APPLIED',
      result: { total: 800, reviewReasons: ['PRICE_MISMATCH'] },
    });
  });

  it('refuses impossible commands and remembers the refusal', async () => {
    const order = walkIn([line(menu.sobolo, 1, 1000)]);
    await push([order]);

    const complete = command('order.set_status', {
      orderId: order.payload.orderId,
      status: 'COMPLETED',
    });
    const [refused] = await push([complete]);
    expect(refused).toMatchObject({ status: 'REJECTED', error: { code: 'INVALID_STATUS' } });
    expect((await push([complete]))[0]).toEqual(refused);

    const [unknown] = await push([walkIn([line(ulid(), 1, 1000)])]);
    expect(unknown).toMatchObject({ status: 'REJECTED', error: { code: 'UNKNOWN_ITEM' } });
  });

  it('cancels an unpaid order and puts its stock back', async () => {
    const [cancelled] = await push([
      command('order.cancel', { orderId: firstOrder.payload.orderId, reason: 'Customer left' }),
    ]);
    expect(cancelled).toMatchObject({ status: 'APPLIED', result: { status: 'CANCELLED' } });
    expect(await stockOnHand()).toEqual({ onHand: 2, soldOutOn: null });
  });

  it('checks the permissions of whoever did the action', async () => {
    const rider = await request(server)
      .post('/api/staff')
      .set('Authorization', `Bearer ${vendor.session}`)
      .set('x-tenant-id', vendor.tenantId)
      .send({ displayName: 'Yaw', role: 'RIDER', pin: '917364' })
      .expect(201);
    const [result] = await push([walkIn([line(menu.sobolo, 1, 1000)], rider.body.id)]);
    expect(result).toMatchObject({ status: 'REJECTED', error: { code: 'NOT_ALLOWED' } });
  });

  it('pulls what changed since the cursor, without cost prices or PIN hashes', async () => {
    const first = await pull();
    const jollof = first.changes.items!.find((i) => i.id === menu.jollof);
    expect(jollof).toBeDefined();
    expect(jollof).not.toHaveProperty('costPrice');
    expect(first.changes.orders!.length).toBeGreaterThan(0);
    expect(first.changes.orderItems![0]).not.toHaveProperty('costPrice');
    expect(first.changes.staff![0]).not.toHaveProperty('pinHash');

    const quiet = await pull(first.cursor);
    expect(quiet.changes.categories).toEqual([]);

    const order = walkIn([line(menu.sobolo, 2, 1000)]);
    await push([order]);
    const next = await pull(quiet.cursor);
    expect(next.changes.orders!.map((o) => o.id)).toContain(order.payload.orderId);
    expect(next.changes.categories).toEqual([]);
  });

  it('still sends an old order that finishes after the first pull', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    const old = command('order.create', {
      ...walkIn([line(menu.sobolo, 1, 1000)]).payload,
      businessDate: threeDaysAgo,
    });
    await push([old]);
    const ids = (changes: Awaited<ReturnType<typeof pull>>) =>
      changes.changes.orders!.map((o) => o.id);

    const first = await pull();
    expect(ids(first)).toContain(old.payload.orderId); // Still open, so the tablet gets it.

    await push([
      command('order.cancel', { orderId: old.payload.orderId, reason: 'Never collected' }),
    ]);
    const next = await pull(first.cursor);
    expect(next.changes.orders!.find((o) => o.id === old.payload.orderId)).toMatchObject({
      status: 'CANCELLED',
    });
    expect(ids(await pull())).not.toContain(old.payload.orderId); // A new tablet doesn't need it.
  });

  it('needs a registered tablet', async () => {
    await request(server)
      .post('/api/sync/push')
      .send({ commands: [walkIn([line(menu.sobolo, 1, 1000)])] })
      .expect(401);
  });
});
