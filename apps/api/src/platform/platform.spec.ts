import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { BUSINESS_REQUEST, removeVendors, setUpVendor, type Vendor } from '../test/fixtures';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

/** The admin console's API: Brixx's own team, its two roles, and what each may do. */
describe.skipIf(!hasDatabase())('the admin console (against Neon)', () => {
  let app: NestExpressApplication;
  let vendor: Vendor;
  let pendingVendor: Vendor;
  // Unique, so searches find this test's business and no other on the shared test branch.
  const vendorName = `Efua${ulid().slice(-6)}`;
  const team: { id: string; session: string }[] = [];
  let admin: string;
  let support: string;
  const server = () => app.getHttpServer();
  const as = (session: string, req: request.Test) => req.set('Authorization', `Bearer ${session}`);

  async function signUp(name: string) {
    const response = await request(server())
      .post('/api/auth/sign-up/email')
      .set('Origin', loadEnv().BETTER_AUTH_URL)
      .send({
        email: `team-${ulid().toLowerCase()}@test.brixx.dev`,
        password: 'correct-horse-battery-staple',
        name,
      })
      .expect(200);
    return {
      id: response.body.user.id as string,
      session: response.headers['set-auth-token'] as string,
    };
  }

  async function joinTeam(name: string, role: 'ADMIN' | 'SUPPORT') {
    const login = await signUp(name);
    const { pool } = app.get<DatabaseHandle>(DATABASE);
    await pool.query('insert into platform_staff (user_id, role) values ($1, $2)', [
      login.id,
      role,
    ]);
    team.push(login);
    return login.session;
  }

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    vendor = await setUpVendor(server(), vendorName);
    admin = await joinTeam('Kwame', 'ADMIN');
    support = await joinTeam('Akosua', 'SUPPORT');

    // A business that has asked to join and is still waiting.
    const owner = await signUp('Yaw');
    const business = await as(owner.session, request(server()).post('/api/onboarding/business'))
      .send({
        name: `Yaw's Waakye ${ulid().slice(-5)}`,
        vendorType: 'CHOP_BAR',
        ...BUSINESS_REQUEST,
      })
      .expect(201);
    pendingVendor = {
      userId: owner.id,
      session: owner.session,
      tenantId: business.body.tenantId,
      ownerStaffId: business.body.staffId,
      deviceToken: '',
      deviceId: '',
    };
  });

  afterAll(async () => {
    await removeVendors(app, [vendor, pendingVendor]);
    const { pool } = app.get<DatabaseHandle>(DATABASE);
    await pool.query('delete from "user" where id = any($1)', [team.map((t) => t.id)]);
    await app.close();
  });

  it("refuses a login that isn't on the Brixx team", async () => {
    await as(vendor.session, request(server()).get('/api/platform/me')).expect(403);
    await request(server()).get('/api/platform/overview').expect(401);
  });

  it('tells each team member their role and what it allows', async () => {
    const me = await as(support, request(server()).get('/api/platform/me')).expect(200);
    expect(me.body).toMatchObject({ name: 'Akosua', role: 'SUPPORT' });
    expect(me.body.capabilities).toContain('requests.decide');
    expect(me.body.capabilities).not.toContain('businesses.suspend');
  });

  it('lets customer service decline a request, and approve it after all', async () => {
    const waiting = await as(support, request(server()).get('/api/platform/requests')).expect(200);
    expect(waiting.body.map((r: { id: string }) => r.id)).toContain(pendingVendor.tenantId);

    const one = await as(
      support,
      request(server()).get(`/api/platform/requests/${pendingVendor.tenantId}`),
    ).expect(200);
    expect(one.body.owner).toMatchObject({ name: 'Yaw', emailVerified: false });
    expect(one.body.owner.signedUpAt).toBeTruthy();
    expect(Array.isArray(one.body.lookalikes)).toBe(true);

    await as(
      support,
      request(server()).post(`/api/platform/requests/${pendingVendor.tenantId}/decline`),
    )
      .send({ reason: 'Could not reach them' })
      .expect(204);
    const declined = await as(support, request(server()).get('/api/platform/requests')).expect(200);
    expect(
      declined.body.find((r: { id: string }) => r.id === pendingVendor.tenantId),
    ).toMatchObject({
      status: 'DECLINED',
      statusReason: 'Could not reach them',
    });

    await as(
      support,
      request(server()).post(`/api/platform/requests/${pendingVendor.tenantId}/approve`),
    ).expect(204);
    await as(
      support,
      request(server()).post(`/api/platform/requests/${pendingVendor.tenantId}/approve`),
    ).expect(409);
  });

  it('lets only an Admin suspend a business, which stops its dashboard until restored', async () => {
    const path = `/api/platform/businesses/${vendor.tenantId}`;
    await as(support, request(server()).post(`${path}/suspend`))
      .send({ reason: 'Asked us to' })
      .expect(403);
    await as(admin, request(server()).post(`${path}/suspend`))
      .send({ reason: 'Asked us to' })
      .expect(204);

    const context = () =>
      as(vendor.session, request(server()).get('/api/me/context')).set(
        'x-tenant-id',
        vendor.tenantId,
      );
    expect((await context()).status).toBeGreaterThanOrEqual(400);

    await as(admin, request(server()).post(`${path}/restore`))
      .send({ reason: 'Paid up' })
      .expect(204);
    await context().expect(200);
  });

  it('shows a business in full without PINs or keys', async () => {
    const list = await as(support, request(server()).get('/api/platform/businesses'))
      .query({ search: vendorName })
      .expect(200);
    expect(list.body[0]).toMatchObject({ id: vendor.tenantId, tablets: 1, status: 'ACTIVE' });

    const detail = await as(
      support,
      request(server()).get(`/api/platform/businesses/${vendor.tenantId}`),
    ).expect(200);
    expect(detail.body.staff).toEqual([expect.objectContaining({ role: 'OWNER', hasPin: true })]);
    expect(detail.body.tabletList).toHaveLength(1);
    expect(detail.body.trend).toHaveLength(30);
    expect(JSON.stringify(detail.body)).not.toMatch(/pbkdf2|argon|token/i);
  });

  it('resets a PIN for a vendor on the phone, and records who did it', async () => {
    const path = `/api/platform/businesses/${vendor.tenantId}/staff/${vendor.ownerStaffId}/pin`;
    await as(support, request(server()).post(path))
      .send({ pin: '111111', reason: 'Owner forgot it' })
      .expect(400);
    await as(support, request(server()).post(path))
      .send({ pin: '730294', reason: 'Owner forgot it' })
      .expect(204);

    await request(server())
      .post('/api/sessions/pin')
      .set('x-device-token', vendor.deviceToken)
      .send({ staffId: vendor.ownerStaffId, pin: '730294' })
      .expect(200);

    const log = await as(support, request(server()).get('/api/platform/audit'))
      .query({ tenantId: vendor.tenantId, who: 'brixx' })
      .expect(200);
    expect(log.body[0]).toMatchObject({
      action: 'staff.pin_reset',
      actorName: 'Akosua (Brixx)',
      byBrixx: true,
    });
  });

  it("keeps the team's notes on a business", async () => {
    await as(support, request(server()).post(`/api/platform/businesses/${vendor.tenantId}/notes`))
      .send({ body: 'Called 27 Oct: tablet battery dead.' })
      .expect(204);
    const detail = await as(
      admin,
      request(server()).get(`/api/platform/businesses/${vendor.tenantId}`),
    ).expect(200);
    expect(detail.body.notes[0]).toMatchObject({
      body: 'Called 27 Oct: tablet battery dead.',
      authorName: 'Akosua',
    });
  });

  it('answers Home, Analytics, Health and search', async () => {
    const overview = await as(support, request(server()).get('/api/platform/overview')).expect(200);
    expect(overview.body.byHour).toHaveLength(24);
    const analytics = await as(support, request(server()).get('/api/platform/analytics'))
      .query({ days: 7 })
      .expect(200);
    expect(analytics.body.daily).toHaveLength(7);
    expect(analytics.body.previousDaily).toHaveLength(7);
    expect(analytics.body.byHour).toHaveLength(24);
    expect(analytics.body.byWeekday).toHaveLength(7);
    await as(support, request(server()).get('/api/platform/analytics'))
      .query({ days: 12 })
      .expect(400);
    const health = await as(support, request(server()).get('/api/platform/health')).expect(200);
    expect(health.body.sync.byHour).toHaveLength(24);
    expect(health.body.links.byDay).toHaveLength(7);
    expect(typeof health.body.server.databaseMs).toBe('number');
    const found = await as(support, request(server()).get('/api/platform/search'))
      .query({ q: vendorName })
      .expect(200);
    expect(found.body.businesses[0]).toMatchObject({ id: vendor.tenantId });
  });

  it('lets only an Admin export the audit log and manage the team', async () => {
    await as(support, request(server()).get('/api/platform/audit/export')).expect(403);
    const csv = await as(admin, request(server()).get('/api/platform/audit/export'))
      .query({ tenantId: vendor.tenantId })
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);

    const email = `new-${ulid().toLowerCase()}@test.brixx.dev`;
    await as(support, request(server()).post('/api/platform/team'))
      .send({ email, role: 'SUPPORT' })
      .expect(403);
    await as(admin, request(server()).post('/api/platform/team'))
      .send({ email, role: 'SUPPORT' })
      .expect(400);
    await as(admin, request(server()).post('/api/platform/team'))
      .send({ email, role: 'SUPPORT', name: 'Esi', password: 'a-long-starting-password' })
      .expect(204);
    const members = await as(admin, request(server()).get('/api/platform/team')).expect(200);
    const esi = members.body.find((m: { email: string }) => m.email === email);
    expect(esi).toMatchObject({ role: 'SUPPORT', active: true, addedByName: 'Kwame' });
    team.push({ id: esi.userId, session: '' });

    const me = await as(admin, request(server()).get('/api/platform/me')).expect(200);
    await as(admin, request(server()).put(`/api/platform/team/${me.body.id}`))
      .send({ role: 'SUPPORT', active: true })
      .expect(403);
  });

  it('keeps the Brixx team and vendors on separate logins', async () => {
    // A team login can't ask for a business, so it never shows up as a vendor.
    await as(admin, request(server()).post('/api/onboarding/business'))
      .send({
        name: `Team Kitchen ${ulid().slice(-5)}`,
        vendorType: 'CHOP_BAR',
        ...BUSINESS_REQUEST,
      })
      .expect(403);

    // A vendor's login can't join the team.
    const { pool } = app.get<DatabaseHandle>(DATABASE);
    const { rows } = await pool.query<{ email: string }>('select email from "user" where id = $1', [
      vendor.userId,
    ]);
    const refused = await as(admin, request(server()).post('/api/platform/team'))
      .send({ email: rows[0]!.email, role: 'SUPPORT' })
      .expect(400);
    expect(refused.body.message).toMatch(/vendor’s login/);
  });
});
