import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { removeVendors, setUpVendor, type Vendor } from '../test/fixtures';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

/** The dashboard's Staff page: the team, who sees sales totals, and the tablets. */
describe.skipIf(!hasDatabase())('staff and tablets from the dashboard (against Neon)', () => {
  let app: NestExpressApplication;
  let vendor: Vendor;
  let kojo: string;
  const PIN = '305871';

  const asOwner = (req: request.Test) =>
    req.set('Authorization', `Bearer ${vendor.session}`).set('x-tenant-id', vendor.tenantId);
  const server = () => app.getHttpServer();
  const team = async () => (await asOwner(request(server()).get('/api/staff')).expect(200)).body;
  const pinLogin = () =>
    request(server())
      .post('/api/sessions/pin')
      .set('x-device-token', vendor.deviceToken)
      .send({ staffId: kojo, pin: PIN });

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    vendor = await setUpVendor(server(), 'Abena');
    const created = await asOwner(request(server()).post('/api/staff'))
      .send({ displayName: 'Kojo', role: 'STAFF', pin: PIN })
      .expect(201);
    kojo = created.body.id;
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('lists the team without PINs, owner first', async () => {
    const body = await team();
    expect(body.staff).toEqual([
      expect.objectContaining({ role: 'OWNER', you: true, hasLogin: true, active: true }),
      {
        id: kojo,
        displayName: 'Kojo',
        role: 'STAFF',
        active: true,
        hasPin: true,
        pinLocked: false,
        hasLogin: false,
        seesRevenue: null,
        you: false,
      },
    ]);
    expect(body.revenueByRole).toEqual({ MANAGER: false, STAFF: false, RIDER: false });
    expect(JSON.stringify(body)).not.toMatch(/pbkdf2|argon/);
  });

  it('renames someone and changes their role, but never the owner', async () => {
    await asOwner(request(server()).put(`/api/staff/${kojo}`))
      .send({ displayName: 'Kojo Boateng', role: 'RIDER' })
      .expect(204);
    expect((await team()).staff[1]).toMatchObject({ displayName: 'Kojo Boateng', role: 'RIDER' });

    await asOwner(request(server()).put(`/api/staff/${vendor.ownerStaffId}`))
      .send({ role: 'STAFF' })
      .expect(403);
  });

  it('lets the owner decide who sees sales totals, by role and per person', async () => {
    await asOwner(request(server()).put('/api/staff/revenue-visibility'))
      .send({ byRole: { MANAGER: true, STAFF: true, RIDER: false } })
      .expect(204);
    const riderLogin = await pinLogin().expect(200);
    expect(riderLogin.body.capabilities).not.toContain('reports.revenue.view');

    await asOwner(request(server()).put(`/api/staff/${kojo}`))
      .send({ seesRevenue: true })
      .expect(204);
    const allowed = await pinLogin().expect(200);
    expect(allowed.body.capabilities).toContain('reports.revenue.view');
  });

  it('switches someone off, so their PIN stops working', async () => {
    await asOwner(request(server()).put(`/api/staff/${kojo}`))
      .send({ active: false })
      .expect(204);
    const refused = await pinLogin();
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect((await team()).staff[1]).toMatchObject({ active: false });
  });

  it('lists the tablets and signs one out', async () => {
    await request(server())
      .get('/api/sync/pull')
      .set('x-device-token', vendor.deviceToken)
      .expect(200);
    const tablets = (await asOwner(request(server()).get('/api/devices')).expect(200)).body;
    expect(tablets).toEqual([
      expect.objectContaining({ id: vendor.deviceId, code: 'A', signedOut: false }),
    ]);
    expect(tablets[0].lastSeenAt).not.toBeNull();

    await asOwner(request(server()).post(`/api/devices/${vendor.deviceId}/sign-out`)).expect(204);
    await request(server())
      .get('/api/sync/pull')
      .set('x-device-token', vendor.deviceToken)
      .expect(401);
    const after = (await asOwner(request(server()).get('/api/devices')).expect(200)).body;
    expect(after[0]).toMatchObject({ signedOut: true });
  });
});
