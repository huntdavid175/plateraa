import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  eq,
  moolreAccounts,
  orders,
  paymentLinks,
  payments,
  providerEvents,
  withTenant,
  type Database,
} from '@brixx/db';
import { pesewas, type Pesewas } from '@brixx/shared';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { syncClient } from '../test/sync-client';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';
import type { MoolreAccount, MoolreApi, PaymentStatus } from './moolre';
import { PaymentLinks } from './payment-links.service';
import { sealSecret } from './secrets';

/** A pretend Moolre: remembers what it was asked, and answers what the test tells it to. */
class FakeMoolre implements MoolreApi {
  readonly links: { account: MoolreAccount; reference: string; amount: Pesewas }[] = [];
  readonly texts: { phone: string; message: string }[] = [];
  status: PaymentStatus | null = null;

  async createLink(account: MoolreAccount, input: { reference: string; amount: Pesewas }) {
    this.links.push({ account, reference: input.reference, amount: input.amount });
    return { url: `https://pos.moolre.com/${input.reference}`, reference: `m-${input.reference}` };
  }

  async paymentStatus() {
    return this.status;
  }

  async sendSms(input: { phone: string; message: string }) {
    this.texts.push({ phone: input.phone, message: input.message });
  }
}

/**
 * A phone order paid by link, end to end against Neon with a pretend Moolre. The sender is only
 * ever run for this test's own business: the database is shared, and a real customer's link must
 * never be picked up by a test.
 */
describe.skipIf(!hasDatabase())('payment links (against Neon, pretend Moolre)', () => {
  const secretsKey = randomBytes(32).toString('base64url');
  const moolre = new FakeMoolre();
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  let app: NestExpressApplication;
  let db: Database;
  let links: PaymentLinks;
  let vendor: Vendor;
  let menu: Awaited<ReturnType<typeof seedMenu>>;
  let sync: ReturnType<typeof syncClient>;

  const phoneOrder = (displayNumber: string) =>
    sync.command('order.create', {
      orderId: ulid(),
      displayNumber,
      businessDate: today,
      source: 'PHONE',
      type: 'PICKUP',
      customer: { phone: '024 123 4567' },
      lines: [{ lineId: ulid(), itemId: menu.jollof, quantity: 1, unitPrice: 4500 }],
    });

  const askForLink = (orderId: string, linkId = ulid()) =>
    sync.command('payment.request_link', { linkId, orderId, phone: '024 123 4567' });

  const inTenant = <T>(fn: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(db, vendor.tenantId, fn);

  const callback = (linkId: string) =>
    request(app.getHttpServer())
      .post('/api/payments/moolre/callback')
      .send({
        status: 1,
        code: 'P01',
        message: 'Transaction Successful',
        data: { externalref: linkId, amount: '45', transactionid: '31772290' },
      })
      .expect(200, { received: true });

  beforeAll(async () => {
    app = await createTestApp(
      { ...testEnv(), SECRETS_KEY: secretsKey, RUN_PAYMENT_LINKS: false },
      { moolre },
    );
    db = app.get<DatabaseHandle>(DATABASE).db;
    links = app.get(PaymentLinks);
    vendor = await setUpVendor(app.getHttpServer(), 'Adwoa');
    menu = await seedMenu(app, vendor.tenantId, today);
    sync = syncClient(app.getHttpServer(), vendor);
  });

  afterAll(async () => {
    await links.settle();
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it("won't send a link before the business connects its Moolre account", async () => {
    const order = phoneOrder('A6');
    expect(await sync.pushOne(order)).toMatchObject({ status: 'APPLIED' });
    expect(await sync.pushOne(askForLink(order.payload.orderId))).toMatchObject({
      status: 'REJECTED',
      error: { code: 'MOOLRE_NOT_CONNECTED' },
    });
  });

  let orderId: string;
  const linkId = ulid();

  it('texts a link for what is owed, made in the vendor’s own account', async () => {
    await inTenant((tx) =>
      tx.insert(moolreAccounts).values({
        tenantId: vendor.tenantId,
        apiUser: 'adwoa',
        publicKey: sealSecret('pk_test_adwoa', secretsKey),
        accountNumber: '100000100002',
        email: 'adwoa@example.com',
      }),
    );
    const order = phoneOrder('A7');
    orderId = order.payload.orderId;
    await sync.pushOne(order);
    expect(await sync.pushOne(askForLink(orderId, linkId))).toMatchObject({
      status: 'APPLIED',
      result: { amount: 4500, status: 'QUEUED' },
    });
    // One open link per order, so nobody pays twice.
    expect(await sync.pushOne(askForLink(orderId))).toMatchObject({
      status: 'REJECTED',
      error: { code: 'LINK_ALREADY_OPEN' },
    });

    await links.send(vendor.tenantId, linkId);
    await links.send(vendor.tenantId, linkId); // a second round leaves a sent link alone
    expect(moolre.links).toEqual([
      {
        account: {
          apiUser: 'adwoa',
          publicKey: 'pk_test_adwoa',
          accountNumber: '100000100002',
          email: 'adwoa@example.com',
        },
        reference: linkId,
        amount: 4500,
      },
    ]);
    expect(moolre.texts).toEqual([
      {
        phone: '+233241234567',
        message: `Adwoa's Chop Bar: pay GHS 45.00 for order A7: https://pos.moolre.com/${linkId}`,
      },
    ]);
    const [link] = await inTenant((tx) =>
      tx.select().from(paymentLinks).where(eq(paymentLinks.id, linkId)),
    );
    expect(link).toMatchObject({
      status: 'SENT',
      url: `https://pos.moolre.com/${linkId}`,
      providerReference: `m-${linkId}`,
    });
    expect(link!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('counts the money only once Moolre confirms it, once, and sends the order to the kitchen', async () => {
    // A callback proves nothing by itself: Moolre doesn't know of a payment yet.
    moolre.status = null;
    await callback(linkId);
    await links.settle();
    expect(
      await inTenant((tx) => tx.select().from(payments).where(eq(payments.orderId, orderId))),
    ).toEqual([]);

    moolre.status = { state: 'PAID', amount: pesewas(4500), transactionId: '31772290' };
    await callback(linkId);
    await callback(linkId); // Moolre may send the same callback twice
    await links.settle();

    const paid = await inTenant((tx) =>
      tx.select().from(payments).where(eq(payments.orderId, orderId)),
    );
    expect(paid).toMatchObject([{ method: 'LINK', status: 'CONFIRMED', amount: 4500 }]);
    const [order] = await inTenant((tx) =>
      tx
        .select({ status: orders.status, amountPaid: orders.amountPaid })
        .from(orders)
        .where(eq(orders.id, orderId)),
    );
    expect(order).toEqual({ status: 'PREPARING', amountPaid: 4500 });
    const [link] = await inTenant((tx) =>
      tx.select().from(paymentLinks).where(eq(paymentLinks.id, linkId)),
    );
    expect(link).toMatchObject({ status: 'PAID', paymentId: paid[0]!.id });

    const events = await inTenant((tx) =>
      tx
        .select({ outcome: providerEvents.outcome })
        .from(providerEvents)
        .where(eq(providerEvents.reference, linkId)),
    );
    expect(events.map((event) => event.outcome).sort()).toEqual(['PAID', 'PAID', 'PENDING']);
  });

  it('tells the tablet on its next pull', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sync/pull')
      .set('x-device-token', vendor.deviceToken)
      .expect(200);
    expect(res.body.changes.paymentLinks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: linkId, status: 'PAID' })]),
    );
  });

  it('lets an unpaid link expire, so a new one can be sent', async () => {
    const order = phoneOrder('A8');
    const expiring = ulid();
    await sync.pushOne(order);
    await sync.pushOne(askForLink(order.payload.orderId, expiring));
    await links.send(vendor.tenantId, expiring);
    await inTenant((tx) =>
      tx
        .update(paymentLinks)
        .set({ expiresAt: new Date(Date.now() - 11 * 60_000) })
        .where(eq(paymentLinks.id, expiring)),
    );

    moolre.status = { state: 'PENDING', amount: null, transactionId: null };
    expect(await links.verify(vendor.tenantId, expiring)).toBe('EXPIRED');
    expect(await sync.pushOne(askForLink(order.payload.orderId))).toMatchObject({
      status: 'APPLIED',
    });
  });

  describe('an order whose link ran out, and was never paid', () => {
    /** A phone order with one link, which ran out `minutesAgo`. */
    const ranOut = async (displayNumber: string, minutesAgo: number) => {
      const order = phoneOrder(displayNumber);
      const link = ulid();
      await sync.pushOne(order);
      await sync.pushOne(askForLink(order.payload.orderId, link));
      await links.send(vendor.tenantId, link);
      await inTenant((tx) =>
        tx
          .update(paymentLinks)
          .set({ status: 'EXPIRED', expiresAt: new Date(Date.now() - minutesAgo * 60_000) })
          .where(eq(paymentLinks.id, link)),
      );
      return order.payload.orderId;
    };
    const orderNow = async (id: string) =>
      (
        await inTenant((tx) =>
          tx
            .select({ status: orders.status, reason: orders.cancelReason })
            .from(orders)
            .where(eq(orders.id, id)),
        )
      )[0]!;
    const day = async () =>
      (
        await request(app.getHttpServer())
          .get('/api/reports/day')
          .set('Authorization', `Bearer ${vendor.session}`)
          .set('x-tenant-id', vendor.tenantId)
          .expect(200)
      ).body as { orders: number; sales: number; awaiting: { orders: number; amount: number } };

    let stale: string;
    let recent: string;
    let held: string;

    it('isn’t a sale while it waits for payment', async () => {
      const before = await day();
      stale = await ranOut('C1', 3 * 60);
      recent = await ranOut('C2', 60);
      const after = await day();
      expect(after.orders).toBe(before.orders);
      expect(after.sales).toBe(before.sales);
      expect(after.awaiting.orders).toBe(before.awaiting.orders + 2);
      expect(after.awaiting.amount).toBe(before.awaiting.amount + 2 * 4500);
    });

    it('closes 2 hours after the link ran out, not before, and never one with no link', async () => {
      const order = phoneOrder('C3'); // held at the counter, to be paid in cash
      held = order.payload.orderId;
      await sync.pushOne(order);

      expect(await links.closeUnpaid({ onlyTenant: vendor.tenantId })).toBe(1);
      expect(await orderNow(stale)).toEqual({
        status: 'CANCELLED',
        reason: 'Not paid: the payment link ran out',
      });
      expect((await orderNow(recent)).status).toBe('CONFIRMED');
      expect((await orderNow(held)).status).toBe('CONFIRMED');
      // A second round finds nothing new.
      expect(await links.closeUnpaid({ onlyTenant: vendor.tenantId })).toBe(0);
    });

    it('closes the rest once their 2 hours are up, unless a new link is out', async () => {
      await sync.pushOne(askForLink(recent)); // a new link, still queued
      const later = Date.now() + 2 * 60 * 60_000;
      expect(await links.closeUnpaid({ now: later, onlyTenant: vendor.tenantId })).toBe(0);
      expect((await orderNow(recent)).status).toBe('CONFIRMED');
    });

    it('tells the tablet, and leaves a trail with no staff name on it', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/pull')
        .set('x-device-token', vendor.deviceToken)
        .expect(200);
      expect(res.body.changes.orders).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: stale, status: 'CANCELLED' })]),
      );
      const story = await request(app.getHttpServer())
        .get(`/api/orders/${stale}`)
        .set('Authorization', `Bearer ${vendor.session}`)
        .set('x-tenant-id', vendor.tenantId)
        .expect(200);
      expect(story.body.history.at(-1)).toMatchObject({ to: 'CANCELLED', by: null });
    });
  });
});
