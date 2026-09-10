import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { createTestApp, hasDatabase } from '../test/test-app';

/**
 * The whole identity journey against Neon: owner signs up, creates a business, registers a
 * phone, adds a cashier, and PINs unlock (and lock) as they should. Skipped without a database.
 */
describe.skipIf(!hasDatabase())('identity (against Neon)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  const createdTenants: string[] = [];
  const createdUsers: string[] = [];

  async function signUpOwner(name: string) {
    const email = `owner-${ulid().toLowerCase()}@test.plateraa.dev`;
    const res = await request(server)
      .post('/api/auth/sign-up/email')
      .set('Origin', loadEnv().BETTER_AUTH_URL)
      .send({ email, password: 'correct-horse-battery-staple', name })
      .expect(200);
    createdUsers.push(res.body.user.id);
    const session = res.headers['set-auth-token'];
    expect(typeof session).toBe('string');

    const business = await request(server)
      .post('/api/onboarding/business')
      .set('Authorization', `Bearer ${session}`)
      .send({ name: `${name}'s Chop Bar`, vendorType: 'CHOP_BAR' })
      .expect(201);
    createdTenants.push(business.body.tenantId);
    return {
      session: session as string,
      tenantId: business.body.tenantId as string,
      staffId: business.body.staffId as string,
    };
  }

  let owner: Awaited<ReturnType<typeof signUpOwner>>;
  let deviceToken: string;
  let cashierId: string;

  beforeAll(async () => {
    app = await createTestApp(loadEnv());
    server = app.getHttpServer();
    owner = await signUpOwner('Ama');
  });

  afterAll(async () => {
    const { pool } = app.get<DatabaseHandle>(DATABASE);
    // Clean up as the owner connection (bypasses RLS); the audit log is append-only for app_user.
    for (const table of [
      'audit_events',
      'devices',
      'staff_members',
      'tenant_settings',
      'locations',
    ]) {
      await pool.query(`delete from ${table} where tenant_id = any($1)`, [createdTenants]);
    }
    await pool.query('delete from tenants where id = any($1)', [createdTenants]);
    await pool.query('delete from "user" where id = any($1)', [createdUsers]);
    await app.close();
  });

  const dashboard = (req: request.Test, who = owner) =>
    req.set('Authorization', `Bearer ${who.session}`).set('x-tenant-id', who.tenantId);

  it('lists the new business for its owner', async () => {
    const res = await request(server)
      .get('/api/me/businesses')
      .set('Authorization', `Bearer ${owner.session}`)
      .expect(200);
    expect(res.body).toContainEqual(
      expect.objectContaining({ tenantId: owner.tenantId, role: 'OWNER' }),
    );
  });

  it('refuses an obvious PIN', async () => {
    await dashboard(request(server).put(`/api/staff/${owner.staffId}/pin`))
      .send({ pin: '123456' })
      .expect(400);
  });

  it('sets the owner PIN and registers a phone', async () => {
    await dashboard(request(server).put(`/api/staff/${owner.staffId}/pin`))
      .send({ pin: '482913' })
      .expect(204);

    const res = await request(server)
      .post('/api/devices/register')
      .set('Authorization', `Bearer ${owner.session}`)
      .send({ tenantId: owner.tenantId, name: 'Counter phone' })
      .expect(201);
    deviceToken = res.body.deviceToken;
    expect(res.body.device.code).toBe('A');

    const roster = await request(server)
      .get('/api/devices/current/staff')
      .set('x-device-token', deviceToken)
      .expect(200);
    const ownerRow = roster.body.find((s: { id: string }) => s.id === owner.staffId);
    expect(ownerRow.pinVerifier).toMatch(/^pbkdf2-sha256\$/);
  });

  it('adds a cashier who can unlock the phone but not manage staff', async () => {
    const created = await dashboard(request(server).post('/api/staff'))
      .send({ displayName: 'Kofi', role: 'STAFF', pin: '305871' })
      .expect(201);
    cashierId = created.body.id;

    const login = await request(server)
      .post('/api/sessions/pin')
      .set('x-device-token', deviceToken)
      .send({ staffId: cashierId, pin: '305871' })
      .expect(200);
    expect(login.body.capabilities).toContain('orders.take');
    expect(login.body.capabilities).not.toContain('reports.revenue.view');

    await request(server)
      .post('/api/staff')
      .set('x-device-token', deviceToken)
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ displayName: 'Sneaky', role: 'STAFF', pin: '917364' })
      .expect(403);
  });

  it('locks a PIN after five wrong tries', async () => {
    const attempt = (pin: string) =>
      request(server)
        .post('/api/sessions/pin')
        .set('x-device-token', deviceToken)
        .send({ staffId: cashierId, pin });

    for (const expected of [401, 401, 401, 401]) await attempt('111222').expect(expected);
    const locked = await attempt('111222').expect(429);
    expect(locked.body.retryAfterSeconds).toBe(30);
    // Even the right PIN waits out the lock.
    await attempt('305871').expect(429);
  });

  it('keeps businesses apart', async () => {
    const other = await signUpOwner('Yaw');
    await dashboard(request(server).post('/api/staff'), { ...other, tenantId: owner.tenantId })
      .send({ displayName: 'Intruder', role: 'STAFF', pin: '560238' })
      .expect(403);
  });

  it('rejects phones that are not registered', async () => {
    await request(server)
      .post('/api/sessions/pin')
      .set('x-device-token', 'not-a-real-device-token')
      .send({ staffId: owner.staffId, pin: '482913' })
      .expect(401);
  });
});
