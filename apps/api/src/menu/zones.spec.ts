import type { NestExpressApplication } from '@nestjs/platform-express';
import { auditEvents, eq, withTenant, type Database } from '@brixx/db';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { removeVendors, setUpVendor, type Vendor } from '../test/fixtures';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

/** Delivery zones from the dashboard, and what the tablet gets of them. */
describe.skipIf(!hasDatabase())('delivery zones (against Neon)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let vendor: Vendor;
  const osu = ulid();
  const labone = ulid();

  const server = () => app.getHttpServer();
  const asOwner = (req: request.Test) =>
    req.set('Authorization', `Bearer ${vendor.session}`).set('x-tenant-id', vendor.tenantId);
  const save = (zoneId: string, body: object) =>
    asOwner(request(server()).put(`/api/delivery-zones/${zoneId}`)).send(body);
  const list = async () =>
    (await asOwner(request(server()).get('/api/delivery-zones')).expect(200)).body;
  const pull = async (cursor?: string) =>
    (
      await request(server())
        .get('/api/sync/pull')
        .query(cursor ? { cursor } : {})
        .set('x-device-token', vendor.deviceToken)
        .expect(200)
    ).body;

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    db = app.get<DatabaseHandle>(DATABASE).db;
    vendor = await setUpVendor(server(), 'Esi');
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('adds zones in the order they were made, and changes them', async () => {
    await save(osu, { name: 'Osu', fee: 1500, active: true }).expect(200, { id: osu });
    await save(labone, { name: 'Labone', fee: 2000, active: true }).expect(200);
    await save(osu, { name: 'Osu', fee: 1800, active: false }).expect(200);

    expect(await list()).toEqual([
      { id: osu, name: 'Osu', fee: 1800, active: false },
      { id: labone, name: 'Labone', fee: 2000, active: true },
    ]);

    const audit = await withTenant(db, vendor.tenantId, (tx) =>
      tx
        .select({ action: auditEvents.action, after: auditEvents.after })
        .from(auditEvents)
        .where(eq(auditEvents.entityId, osu)),
    );
    expect(audit).toHaveLength(2);
    expect(audit).toContainEqual({
      action: 'delivery_zone.saved',
      after: { name: 'Osu', fee: 1800, active: false },
    });
  });

  it('refuses a second zone with the same name', async () => {
    const res = await save(ulid(), { name: 'labone', fee: 900, active: true }).expect(400);
    expect(res.body.message).toMatch(/already a zone called labone/);
    await save(ulid(), { name: '', fee: 900, active: true }).expect(400);
    await save('not-an-id', { name: 'Cantonments', fee: 900, active: true }).expect(400);
  });

  it('sends zones to the tablet, and their removal', async () => {
    const first = await pull();
    expect(first.changes.deliveryZones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: labone, name: 'Labone', fee: 2000, active: true }),
      ]),
    );

    await asOwner(request(server()).delete(`/api/delivery-zones/${labone}`)).expect(204);
    await asOwner(request(server()).delete(`/api/delivery-zones/${labone}`)).expect(404);
    expect((await list()).map((zone: { id: string }) => zone.id)).toEqual([osu]);

    const next = await pull(first.cursor);
    expect(next.changes.deliveryZones).toEqual([
      expect.objectContaining({ id: labone, deletedAt: expect.any(String) }),
    ]);
    await save(labone, { name: 'Labone', fee: 2000, active: true }).expect(404);
  });

  it('keeps zones from staff, who can’t set up the menu', async () => {
    const cashier = await asOwner(request(server()).post('/api/staff'))
      .send({ displayName: 'Yaw', role: 'STAFF', pin: '305871' })
      .expect(201);
    const login = await request(server())
      .post('/api/sessions/pin')
      .set('x-device-token', vendor.deviceToken)
      .send({ staffId: cashier.body.id, pin: '305871' })
      .expect(200);
    await request(server())
      .get('/api/delivery-zones')
      .set('x-device-token', vendor.deviceToken)
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(403);
  });
});
