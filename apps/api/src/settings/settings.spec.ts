import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq, moolreAccounts, stockItems, withTenant, type Database } from '@plateraa/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { MoolreError, type MoolreAccount, type MoolreApi } from '../payments/moolre';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

/** A pretend Moolre that knows one account and refuses the rest, as the real one does. */
class FakeMoolre implements MoolreApi {
  readonly checked: MoolreAccount[] = [];

  async createLink(): Promise<never> {
    throw new Error('Settings never make links');
  }

  async paymentStatus(account: MoolreAccount) {
    this.checked.push(account);
    if (account.apiUser !== 'amas_kitchen') throw new MoolreError('AIN03', 'User not found', false);
    return null;
  }

  async sendSms() {}
}

describe.skipIf(!hasDatabase())('owner settings (against Neon)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let vendor: Vendor;
  const moolre = new FakeMoolre();
  const today = new Date().toISOString().slice(0, 10);

  const asOwner = (req: request.Test) =>
    req.set('Authorization', `Bearer ${vendor.session}`).set('x-tenant-id', vendor.tenantId);
  const server = () => app.getHttpServer();
  const settings = async () =>
    (await asOwner(request(server()).get('/api/settings')).expect(200)).body;
  const account = {
    apiUser: 'amas_kitchen',
    publicKey: 'pk_live_abcdefghijklmnop',
    accountNumber: '10000234567',
    email: 'ama@example.com',
  };

  beforeAll(async () => {
    app = await createTestApp(
      { ...testEnv(), SECRETS_KEY: randomBytes(32).toString('base64url') },
      { moolre },
    );
    db = app.get<DatabaseHandle>(DATABASE).db;
    vendor = await setUpVendor(server(), 'Ama');
    await seedMenu(app, vendor.tenantId, today);
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('starts from the defaults', async () => {
    expect(await settings()).toEqual({
      business: { name: "Ama's Chop Bar", vendorType: 'CHOP_BAR' },
      orders: { requirePaymentBeforePrep: true, countPortions: false, idleLockSeconds: 180 },
      moolre: { connected: false, apiUser: null, accountEnding: null, email: null },
      commissions: {
        BOLT_FOOD: { rateBps: null, flatAmount: null },
        CHOWDECK: { rateBps: null, flatAmount: null },
      },
    });
  });

  it('renames the business', async () => {
    await asOwner(request(server()).put('/api/settings/business'))
      .send({ name: "Ama's Kitchen", vendorType: 'CAFE_BAKERY' })
      .expect(204);
    const me = await asOwner(request(server()).get('/api/me/context')).expect(200);
    expect(me.body).toMatchObject({ businessName: "Ama's Kitchen", vendorType: 'CAFE_BAKERY' });
  });

  it('gives every item a count record when portion counts go on', async () => {
    await asOwner(request(server()).put('/api/settings/orders'))
      .send({ requirePaymentBeforePrep: false, countPortions: true, idleLockSeconds: 300 })
      .expect(204);
    expect((await settings()).orders).toEqual({
      requirePaymentBeforePrep: false,
      countPortions: true,
      idleLockSeconds: 300,
    });
    // Jollof already had one; sobolo gets one now.
    const counts = await withTenant(db, vendor.tenantId, (tx) =>
      tx.select().from(stockItems).where(eq(stockItems.kind, 'SELLABLE')),
    );
    expect(counts.map((row) => row.name).sort()).toEqual(['Jollof rice', 'Sobolo']);
  });

  it('refuses Moolre details Moolre doesn’t know, and seals the key it accepts', async () => {
    const refused = await asOwner(request(server()).put('/api/settings/moolre'))
      .send({ ...account, apiUser: 'someone_else' })
      .expect(400);
    expect(refused.body.message).toMatch(/AIN03/);

    const saved = await asOwner(request(server()).put('/api/settings/moolre'))
      .send(account)
      .expect(200);
    expect(saved.body).toEqual({ connected: true, accountEnding: '4567' });

    const shown = await settings();
    expect(shown.moolre).toEqual({
      connected: true,
      apiUser: 'amas_kitchen',
      accountEnding: '4567',
      email: 'ama@example.com',
    });
    expect(JSON.stringify(shown)).not.toContain(account.publicKey);
    const [row] = await withTenant(db, vendor.tenantId, (tx) =>
      tx
        .select({ publicKey: moolreAccounts.publicKey })
        .from(moolreAccounts)
        .where(and(eq(moolreAccounts.tenantId, vendor.tenantId))),
    );
    expect(row?.publicKey).toMatch(/^v1\./);
  });

  it('saves and clears the platforms’ commissions', async () => {
    const path = '/api/settings/commissions';
    await asOwner(request(server()).put(path))
      .send({
        BOLT_FOOD: { rateBps: 1500, flatAmount: null },
        CHOWDECK: { rateBps: null, flatAmount: 200 },
      })
      .expect(204);
    expect((await settings()).commissions).toEqual({
      BOLT_FOOD: { rateBps: 1500, flatAmount: null },
      CHOWDECK: { rateBps: null, flatAmount: 200 },
    });
    await asOwner(request(server()).put(path))
      .send({
        BOLT_FOOD: { rateBps: null, flatAmount: null },
        CHOWDECK: { rateBps: null, flatAmount: 200 },
      })
      .expect(204);
    expect((await settings()).commissions.BOLT_FOOD).toEqual({ rateBps: null, flatAmount: null });
  });
});
