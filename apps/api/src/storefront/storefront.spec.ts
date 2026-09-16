import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  deliveryZones,
  eq,
  itemModifierGroups,
  modifierGroups,
  modifiers,
  moolreAccounts,
  orders,
  paymentLinks,
  staffMembers,
  tenants,
  withTenant,
  type Database,
} from '@plateraa/db';
import { STORE_DAYS, pesewas, type Pesewas, type StoreHours } from '@plateraa/shared';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import type { MoolreAccount, MoolreApi, PaymentStatus } from '../payments/moolre';
import { PaymentLinks } from '../payments/payment-links.service';
import { sealSecret } from '../payments/secrets';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

/** A pretend Moolre: makes links, and says whatever the test tells it about a payment. */
class FakeMoolre implements MoolreApi {
  readonly links: { reference: string; amount: Pesewas }[] = [];
  status: PaymentStatus | null = null;

  async createLink(_account: MoolreAccount, input: { reference: string; amount: Pesewas }) {
    this.links.push({ reference: input.reference, amount: input.amount });
    return { url: `https://pos.moolre.com/${input.reference}`, reference: `m-${input.reference}` };
  }

  async paymentStatus() {
    return this.status;
  }

  async sendSms() {}
}

/**
 * The online store end to end against Neon, with a pretend Moolre: the owner's settings, the menu
 * customers see, and orders placed, paid and followed without a login.
 */
describe.skipIf(!hasDatabase())('the online store (against Neon, pretend Moolre)', () => {
  const secretsKey = randomBytes(32).toString('base64url');
  const moolre = new FakeMoolre();
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  let app: NestExpressApplication;
  let db: Database;
  let vendor: Vendor;
  let menu: Awaited<ReturnType<typeof seedMenu>>;
  let slug: string;
  const ids = { protein: ulid(), chicken: ulid(), egg: ulid(), osu: ulid() };

  const server = () => app.getHttpServer();
  const asOwner = (test: request.Test) =>
    test.set('Authorization', `Bearer ${vendor.session}`).set('x-tenant-id', vendor.tenantId);
  const inTenant = <T>(fn: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(db, vendor.tenantId, fn);

  /** A week the store keeps, the same every day. */
  const week = (from: string, to: string, open = true): StoreHours =>
    Object.fromEntries(STORE_DAYS.map((day) => [day, { open, from, to }])) as StoreHours;

  const settings = {
    enabled: true,
    takingOrders: true,
    cashOnPickup: true,
    acceptFirst: false,
    theme: 'green',
    area: 'Osu, Accra',
    phone: '024 111 2222',
    // Open around the clock, so the other tests don't depend on when they run.
    hours: week('00:00', '23:59'),
  };
  const saveSettings = (changes: Partial<typeof settings> = {}) =>
    asOwner(request(server()).put('/api/storefront/settings'))
      .send({ ...settings, ...changes })
      .expect(204);

  const jollofWithChicken = () => ({
    itemId: menu.jollof,
    quantity: 1,
    optionIds: [ids.chicken],
  });
  const order = (changes: Record<string, unknown> = {}) => ({
    orderId: ulid(),
    type: 'PICKUP',
    lines: [jollofWithChicken(), { itemId: menu.sobolo, quantity: 1 }],
    customer: { name: 'Kofi', phone: '024 555 0199' },
    payment: 'ONLINE',
    ...changes,
  });
  const place = (body: object) =>
    request(server()).post(`/api/public/stores/${slug}/orders`).send(body);

  beforeAll(async () => {
    app = await createTestApp(
      { ...testEnv(), SECRETS_KEY: secretsKey, RUN_PAYMENT_LINKS: false },
      { moolre },
    );
    db = app.get<DatabaseHandle>(DATABASE).db;
    vendor = await setUpVendor(server(), 'Efua');
    menu = await seedMenu(app, vendor.tenantId, today);
    await inTenant(async (tx) => {
      const tenantId = vendor.tenantId;
      await tx
        .insert(modifierGroups)
        .values({ id: ids.protein, tenantId, name: 'Protein', minSelect: 1, maxSelect: 2 });
      await tx.insert(modifiers).values([
        {
          id: ids.chicken,
          tenantId,
          groupId: ids.protein,
          name: 'Chicken',
          priceDelta: pesewas(1500),
        },
        { id: ids.egg, tenantId, groupId: ids.protein, name: 'Egg', priceDelta: pesewas(500) },
      ]);
      await tx
        .insert(itemModifierGroups)
        .values({ id: ulid(), tenantId, itemId: menu.jollof, groupId: ids.protein });
      await tx
        .insert(deliveryZones)
        .values({ id: ids.osu, tenantId, name: 'Osu', fee: pesewas(1500) });
      await tx.insert(moolreAccounts).values({
        tenantId,
        apiUser: 'efua',
        publicKey: sealSecret('pk_test', secretsKey),
        accountNumber: '10555123456',
        email: 'efua@test.plateraa.dev',
      });
      const [tenant] = await tx.select({ slug: tenants.slug }).from(tenants);
      slug = tenant!.slug;
    });
  });

  afterAll(async () => {
    await app.get(PaymentLinks).settle();
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('keeps the store link hidden until the owner switches the store on', async () => {
    await request(server()).get(`/api/public/stores/${slug}`).expect(404);
    const res = await asOwner(request(server()).get('/api/storefront/settings')).expect(200);
    expect(res.body).toMatchObject({ enabled: false, theme: 'orange', moolreConnected: true });
  });

  it('closes the store outside the hours it keeps, and refuses an order then', async () => {
    await saveSettings({ hours: week('08:00', '20:00', false) });
    const shut = await request(server()).get(`/api/public/stores/${slug}`).expect(200);
    // The menu still shows; it just can't be ordered from, and there's no opening to promise.
    expect(shut.body).toMatchObject({ open: false, hours: 'Closed every day', opensWords: null });
    expect(shut.body.items.length).toBeGreaterThan(0);

    const refused = await place(order()).expect(409);
    expect(refused.body.message).toContain('closed right now');

    await saveSettings();
    const back = await request(server()).get(`/api/public/stores/${slug}`).expect(200);
    expect(back.body).toMatchObject({ open: true, opensWords: null });
  });

  it('saves the store’s settings, with its number written the usual way', async () => {
    await saveSettings();
    const res = await asOwner(request(server()).get('/api/storefront/settings')).expect(200);
    expect(res.body).toMatchObject({
      enabled: true,
      cashOnPickup: true,
      theme: 'green',
      phone: '+233241112222',
      url: `http://localhost:3001/${slug}`,
      deliveryZones: 1,
    });
    await asOwner(request(server()).put('/api/storefront/settings'))
      .send({ ...settings, phone: '12345' })
      .expect(400);
  });

  it('shows customers the menu, extras and zones, and never a cost price', async () => {
    const res = await request(server()).get(`/api/public/stores/${slug}`).expect(200);
    expect(res.body).toMatchObject({
      slug,
      open: true,
      theme: 'green',
      payOnline: true,
      cashOnPickup: true,
      zones: [{ id: ids.osu, name: 'Osu', fee: 1500 }],
    });
    const jollof = (res.body.items as { id: string }[]).find((item) => item.id === menu.jollof);
    expect(jollof).toMatchObject({
      price: 4500,
      soldOut: false,
      groups: [{ name: 'Protein', minSelect: 1, maxSelect: 2 }],
    });
    expect(JSON.stringify(res.body)).not.toContain('costPrice');
    expect(JSON.stringify(res.body)).not.toContain('2000');
  });

  it('refuses an order that breaks the menu’s rules or the store’s', async () => {
    const withoutProtein = await place(
      order({ lines: [{ itemId: menu.jollof, quantity: 1 }] }),
    ).expect(400);
    expect(withoutProtein.body.message).toContain('Choose the protein for Jollof rice');
    await place(
      order({ lines: [{ ...jollofWithChicken(), optionIds: [ids.chicken, ids.egg, ulid()] }] }),
    ).expect(400);
    await place(order({ type: 'DELIVERY' })).expect(400);
    await place(
      order({ type: 'DELIVERY', payment: 'CASH', delivery: { zoneId: ids.osu, address: 'Osu' } }),
    ).expect(400);
  });

  let token: string;

  it('places an online order at the menu’s prices and sends the customer to Moolre', async () => {
    const body = order();
    const res = await place(body).expect(201);
    expect(res.body).toMatchObject({ number: 'W1', payProblem: null });
    expect(res.body.payUrl).toMatch(/^https:\/\/pos\.moolre\.com\//);
    token = res.body.token;
    // 45.00 + 15.00 chicken, and 10.00 sobolo: the browser sent no prices at all.
    expect(moolre.links.at(-1)?.amount).toBe(7000);

    const [saved] = await inTenant((tx) =>
      tx
        .select({
          source: orders.source,
          arrivalMethod: orders.arrivalMethod,
          status: orders.status,
          deviceId: orders.deviceId,
          total: orders.total,
          createdBy: orders.createdBy,
        })
        .from(orders)
        .where(eq(orders.id, body.orderId)),
    );
    expect(saved).toMatchObject({
      source: 'STOREFRONT',
      arrivalMethod: 'API',
      status: 'CONFIRMED',
      deviceId: null,
      total: 7000,
    });
    const [online] = await inTenant((tx) =>
      tx.select().from(staffMembers).where(eq(staffMembers.id, saved!.createdBy)),
    );
    expect(online).toMatchObject({ displayName: 'Online store', system: true, active: false });

    // A retry after a lost answer records nothing new.
    const again = await place(body).expect(201);
    expect(again.body).toMatchObject({ token, number: 'W1', payUrl: res.body.payUrl });
    expect(moolre.links).toHaveLength(1);
  });

  it('says what people order most here, once there are orders to go by', async () => {
    const store = await request(server()).get(`/api/public/stores/${slug}`).expect(200);
    // Every order placed by the tests above has jollof in it, so it leads.
    expect(store.body.popular[0]).toBe(menu.jollof);
    expect(store.body.popular).toContain(menu.sobolo);
    expect(store.body.popular.length).toBeLessThanOrEqual(8);
  });

  it('shows the order’s progress, and counts the payment once Moolre confirms it', async () => {
    const waiting = await request(server()).get(`/api/public/orders/${token}`).expect(200);
    expect(waiting.body).toMatchObject({
      number: 'W1',
      storeName: "Efua's Chop Bar",
      status: 'CONFIRMED',
      amountPaid: 0,
      linkStatus: 'SENT',
      lines: [
        { name: 'Jollof rice', extras: ['Chicken'], quantity: 1, lineTotal: 6000 },
        { name: 'Sobolo', extras: [], quantity: 1, lineTotal: 1000 },
      ],
    });

    moolre.status = { state: 'PAID', amount: pesewas(7000), transactionId: 'tx-1' };
    const paid = await request(server()).post(`/api/public/orders/${token}/check`).expect(200);
    expect(paid.body).toMatchObject({ status: 'PREPARING', amountPaid: 7000, linkStatus: 'PAID' });
    moolre.status = null;

    await request(server()).get('/api/public/orders/not-a-real-token').expect(404);
  });

  it('cooks a cash-on-pickup order before it’s paid', async () => {
    const res = await place(order({ payment: 'CASH' })).expect(201);
    expect(res.body).toMatchObject({ number: 'W2', payUrl: null });
    const tracked = await request(server()).get(`/api/public/orders/${res.body.token}`).expect(200);
    expect(tracked.body).toMatchObject({
      payOnCollection: true,
      status: 'CONFIRMED',
      linkStatus: null,
    });
    await request(server()).post(`/api/public/orders/${res.body.token}/pay`).expect(400);
  });

  it('holds online orders for Accept when the store asks for it', async () => {
    await saveSettings({ acceptFirst: true });
    const res = await place(order()).expect(201);
    const tracked = await request(server()).get(`/api/public/orders/${res.body.token}`).expect(200);
    expect(tracked.body).toMatchObject({ number: 'W3', status: 'NEW', acceptsFirst: true });
  });

  it('refuses orders while the store isn’t taking them, and keeps the Online store off the team', async () => {
    await saveSettings({ takingOrders: false });
    const store = await request(server()).get(`/api/public/stores/${slug}`).expect(200);
    expect(store.body.open).toBe(false);
    await place(order()).expect(409);

    const team = await asOwner(request(server()).get('/api/staff')).expect(200);
    const names = (team.body.staff as { displayName: string }[]).map(
      (person) => person.displayName,
    );
    expect(names).not.toContain('Online store');
    const [pending] = await inTenant((tx) =>
      tx
        .select({ id: paymentLinks.id })
        .from(paymentLinks)
        .where(eq(paymentLinks.status, 'QUEUED')),
    );
    expect(pending).toBeUndefined();
  });
});
