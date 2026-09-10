import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  approvalRequests,
  channelCommissions,
  customers,
  eq,
  expenses,
  items,
  platformReceivables,
  stockItems,
  withTenant,
  type Database,
} from '@plateraa/db';
import { pesewas, type ApprovalAction } from '@plateraa/shared';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { syncClient } from '../test/sync-client';
import { createTestApp, hasDatabase } from '../test/test-app';

/**
 * Money, the cash drawer and stock, pushed the way a phone would, in one story. The drawer:
 * GH₵50 float, +GH₵90 cash, −GH₵90 refunded, −GH₵20 payout, so GH₵30 expected at close.
 */
describe.skipIf(!hasDatabase())('sync: money, drawer and stock (against Neon)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let vendor: Vendor;
  let menu: Awaited<ReturnType<typeof seedMenu>>;
  let sync: ReturnType<typeof syncClient>;
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  const shiftId = ulid();

  const line = (itemId: string, quantity: number, unitPrice: number) => ({
    lineId: ulid(),
    itemId,
    quantity,
    unitPrice,
  });

  const order = (lines: ReturnType<typeof line>[], extra: Record<string, unknown> = {}) =>
    sync.command('order.create', {
      orderId: ulid(),
      displayNumber: '010',
      businessDate: today,
      source: 'POS',
      type: 'WALK_IN',
      lines,
      ...extra,
    });

  const inTenant = <T>(fn: Parameters<typeof withTenant<T>>[2]) =>
    withTenant(db, vendor.tenantId, fn);

  async function approve(action: ApprovalAction, amount: number, orderId?: string) {
    const id = ulid();
    await inTenant((tx) =>
      tx.insert(approvalRequests).values({
        id,
        tenantId: vendor.tenantId,
        action,
        amount: pesewas(amount),
        orderId: orderId ?? null,
        requestedBy: vendor.ownerStaffId,
        status: 'APPROVED',
        method: 'ON_SITE_PIN',
        decidedBy: vendor.ownerStaffId,
        decidedAt: new Date(),
        expiresAt: new Date(Date.now() + 120_000),
      }),
    );
    return id;
  }

  beforeAll(async () => {
    app = await createTestApp(loadEnv());
    db = app.get<DatabaseHandle>(DATABASE).db;
    vendor = await setUpVendor(app.getHttpServer(), 'Esi');
    menu = await seedMenu(app, vendor.tenantId, today);
    sync = syncClient(app.getHttpServer(), vendor);
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  let paidOrder: ReturnType<typeof order>;
  const refund = (approvalId: string, amount: number) =>
    sync.command('refund.create_cash', {
      refundId: ulid(),
      orderId: paidOrder.payload.orderId,
      shiftId,
      amount,
      reason: 'Food was cold',
      approvalId,
    });

  it('opens a drawer and takes cash, showing the change', async () => {
    expect(await sync.pushOne(sync.command('shift.open', { shiftId, float: 5000 }))).toMatchObject({
      status: 'APPLIED',
    });
    paidOrder = order([line(menu.jollof, 2, 4500)]);
    const [created, paid] = await sync.push(
      paidOrder,
      sync.command('payment.record_cash', {
        paymentId: ulid(),
        orderId: paidOrder.payload.orderId,
        shiftId,
        amount: 9000,
        tendered: 10_000,
      }),
    );
    expect(created).toMatchObject({ status: 'APPLIED' });
    expect(paid).toMatchObject({
      status: 'APPLIED',
      result: { amountPaid: 9000, outstanding: 0, change: 1000 },
    });
  });

  it('allows only one open drawer per phone', async () => {
    const second = await sync.pushOne(sync.command('shift.open', { shiftId: ulid(), float: 0 }));
    expect(second).toMatchObject({ status: 'REJECTED', error: { code: 'SHIFT_ALREADY_OPEN' } });
  });

  it('refuses to take more than is owed', async () => {
    const extra = await sync.pushOne(
      sync.command('payment.record_cash', {
        paymentId: ulid(),
        orderId: paidOrder.payload.orderId,
        shiftId,
        amount: 100,
      }),
    );
    expect(extra).toMatchObject({ status: 'REJECTED', error: { code: 'OVERPAYMENT' } });
  });

  it('refunds only with an approval, and each approval works once', async () => {
    expect(await sync.pushOne(refund(ulid(), 4500))).toMatchObject({
      status: 'REJECTED',
      error: { code: 'APPROVAL_REQUIRED' },
    });
    const approvalId = await approve('REFUND', 4500, paidOrder.payload.orderId);
    expect(await sync.pushOne(refund(approvalId, 4500))).toMatchObject({
      status: 'APPLIED',
      result: { amountPaid: 4500 },
    });
    expect(await sync.pushOne(refund(approvalId, 4500))).toMatchObject({
      status: 'REJECTED',
      error: { code: 'APPROVAL_ALREADY_USED' },
    });
  });

  it('cancels a paid order only once all of it is refunded', async () => {
    const cancel = () =>
      sync.command('order.cancel', { orderId: paidOrder.payload.orderId, reason: 'Changed mind' });
    expect(await sync.pushOne(cancel())).toMatchObject({
      status: 'REJECTED',
      error: { code: 'REFUND_FIRST' },
    });
    const approvalId = await approve('REFUND', 4500, paidOrder.payload.orderId);
    expect(await sync.pushOne(refund(approvalId, 4500))).toMatchObject({ status: 'APPLIED' });
    expect(await sync.pushOne(cancel())).toMatchObject({ status: 'APPLIED' });
  });

  it('needs an approval for a big payout, and books every payout as an expense', async () => {
    const payout = (amount: number) =>
      sync.command('shift.cash_movement', {
        movementId: ulid(),
        shiftId,
        type: 'PAYOUT',
        amount,
        category: 'GAS',
        note: 'Gas refill',
      });
    expect(await sync.pushOne(payout(6000))).toMatchObject({
      status: 'REJECTED',
      error: { code: 'APPROVAL_REQUIRED' },
    });

    const small = await sync.pushOne(payout(2000));
    expect(small).toMatchObject({ status: 'APPLIED' });
    const [expense] = await inTenant((tx) =>
      tx
        .select()
        .from(expenses)
        .where(eq(expenses.id, small.result!.expenseId as string)),
    );
    expect(expense).toMatchObject({
      amount: 2000,
      category: 'GAS',
      method: 'CASH_DRAWER',
      spentOn: today,
    });
  });

  it('closes the drawer with expected, counted and the difference', async () => {
    const closed = await sync.pushOne(sync.command('shift.close', { shiftId, counted: 2500 }));
    expect(closed).toMatchObject({
      status: 'APPLIED',
      result: { expected: 3000, counted: 2500, variance: -500 },
    });
  });

  it('records a platform payment as money the platform owes, less commission', async () => {
    await inTenant((tx) =>
      tx
        .insert(channelCommissions)
        .values({ id: ulid(), tenantId: vendor.tenantId, source: 'BOLT_FOOD', rateBps: 2000 }),
    );
    const boltOrder = order([line(menu.sobolo, 3, 1000)], {
      source: 'BOLT_FOOD',
      type: 'PICKUP',
      customer: { phone: '0244000111' },
    });
    const [, paid] = await sync.push(
      boltOrder,
      sync.command('payment.record_platform', {
        paymentId: ulid(),
        orderId: boltOrder.payload.orderId,
        amount: 3000,
      }),
    );
    expect(paid).toMatchObject({ status: 'APPLIED', result: { commissionEstimate: 600 } });
    const [receivable] = await inTenant((tx) =>
      tx
        .select()
        .from(platformReceivables)
        .where(eq(platformReceivables.orderId, boltOrder.payload.orderId)),
    );
    expect(receivable).toMatchObject({ source: 'BOLT_FOOD', gross: 3000, commissionEstimate: 600 });
  });

  it('adds prep to today and records the difference on a raw count', async () => {
    // 3 prepped; 2 sold, then put back when that order was cancelled.
    const prep = await sync.pushOne(
      sync.command('stock.prep_count', {
        movementId: ulid(),
        stockItemId: menu.jollofStock,
        quantity: 10,
        businessDate: today,
      }),
    );
    expect(prep).toMatchObject({ status: 'APPLIED', result: { onHand: 13 } });

    const riceBags = ulid();
    await inTenant((tx) =>
      tx.insert(stockItems).values({
        id: riceBags,
        tenantId: vendor.tenantId,
        kind: 'RAW',
        name: 'Rice (50 kg bag)',
        unit: 'bag',
        onHand: 5,
      }),
    );
    const counted = await sync.pushOne(
      sync.command('stock.raw_count', {
        movementId: ulid(),
        stockItemId: riceBags,
        counted: 3,
        businessDate: today,
      }),
    );
    expect(counted).toMatchObject({ status: 'APPLIED', result: { onHand: 3, difference: -2 } });
  });

  it('marks an item sold out and back again', async () => {
    const soldOut = async (value: boolean) => {
      await sync.pushOne(
        sync.command('item.set_sold_out', {
          itemId: menu.sobolo,
          soldOut: value,
          businessDate: today,
        }),
      );
      const [item] = await inTenant((tx) =>
        tx.select().from(items).where(eq(items.id, menu.sobolo)),
      );
      return item!.soldOutOn;
    };
    expect(await soldOut(true)).toBe(today);
    expect(await soldOut(false)).toBeNull();
  });

  it('keeps one customer per phone number', async () => {
    const first = await sync.pushOne(
      sync.command('customer.upsert', {
        customerId: ulid(),
        phone: '024 555 1234',
        name: 'Akosua',
      }),
    );
    const again = await sync.pushOne(
      sync.command('customer.upsert', {
        customerId: ulid(),
        phone: '+233245551234',
        name: 'Akosua M.',
      }),
    );
    expect(again.result!.customerId).toBe(first.result!.customerId);
    const [customer] = await inTenant((tx) =>
      tx
        .select()
        .from(customers)
        .where(eq(customers.id, first.result!.customerId as string)),
    );
    expect(customer).toMatchObject({ phone: '+233245551234', name: 'Akosua M.' });
  });

  it('creates a receipt link to share', async () => {
    const receipt = await sync.pushOne(
      sync.command('receipt.create_link', {
        receiptId: ulid(),
        orderId: paidOrder.payload.orderId,
      }),
    );
    expect(receipt).toMatchObject({ status: 'APPLIED' });
    expect(String(receipt.result!.token).length).toBeGreaterThanOrEqual(40);
  });

  it('gzips pull responses', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sync/pull')
      .set('x-device-token', vendor.deviceToken)
      .set('Accept-Encoding', 'gzip')
      .expect(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });
});
