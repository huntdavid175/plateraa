import { gzipSync } from 'node:zlib';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  categories,
  itemChannelPrices,
  itemModifierGroups,
  itemVariants,
  items,
  modifierGroups,
  modifiers,
  withTenant,
  type Database,
} from '@plateraa/db';
import { pesewas } from '@plateraa/shared';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { removeVendors, setUpVendor, type Vendor } from '../test/fixtures';
import { syncClient } from '../test/sync-client';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

const ORDERS = 25;

/**
 * A chop bar's menu, straight into the database: 6 categories, 40 items (15 with three sizes),
 * two extras groups shared by 20 items, and Bolt Food and Chowdeck prices on 10. Returns the
 * 25 items without sizes, to sell.
 */
async function chopBarMenu(db: Database, tenantId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const categoryIds = Array.from({ length: 6 }, () => ulid());
    await tx
      .insert(categories)
      .values(
        categoryIds.map((id, i) => ({ id, tenantId, name: `Category ${i + 1}`, position: i })),
      );

    const groups = [
      { id: ulid(), name: 'Protein', options: ['Chicken', 'Fish', 'Egg', 'Wele'] },
      { id: ulid(), name: 'Extras', options: ['Shito', 'Salad', 'Plantain', 'Gari'] },
    ];
    await tx.insert(modifierGroups).values(
      groups.map((group, i) => ({
        id: group.id,
        tenantId,
        name: group.name,
        minSelect: 0,
        maxSelect: 2,
        position: i,
      })),
    );
    await tx.insert(modifiers).values(
      groups.flatMap((group) =>
        group.options.map((name, i) => ({
          id: ulid(),
          tenantId,
          groupId: group.id,
          name,
          priceDelta: pesewas(500 * (i + 1)),
          position: i,
        })),
      ),
    );

    const menu = Array.from({ length: 40 }, (_, i) => ({
      id: ulid(),
      tenantId,
      categoryId: categoryIds[i % categoryIds.length]!,
      name: `Menu item ${i + 1} with a longer name`,
      description: i % 3 === 0 ? 'Served with pepper sauce and a little salad on the side' : null,
      price: pesewas(2000 + i * 250),
      costPrice: pesewas(1000 + i * 100),
      prepMinutes: 10,
      station: i % 5 === 0 ? ('DRINKS' as const) : ('KITCHEN' as const),
      position: i,
    }));
    await tx.insert(items).values(menu);
    await tx.insert(itemVariants).values(
      menu.slice(25).flatMap((item) =>
        ['Regular', 'Large', 'Family'].map((name, i) => ({
          id: ulid(),
          tenantId,
          itemId: item.id,
          name,
          price: pesewas(item.price + i * 1500),
          position: i,
        })),
      ),
    );
    await tx.insert(itemModifierGroups).values(
      menu.slice(0, 20).flatMap((item) =>
        groups.map((group, i) => ({
          id: ulid(),
          tenantId,
          itemId: item.id,
          groupId: group.id,
          position: i,
        })),
      ),
    );
    await tx.insert(itemChannelPrices).values(
      menu.slice(0, 10).flatMap((item) =>
        (['BOLT_FOOD', 'CHOWDECK'] as const).map((source) => ({
          id: ulid(),
          tenantId,
          itemId: item.id,
          source,
          price: pesewas(item.price + 500),
        })),
      ),
    );
    return menu.slice(0, 25).map((item) => ({ id: item.id, price: item.price }));
  });
}

/** A pull's size: its JSON, and gzipped as the server sends it. */
function sizeOf(body: unknown) {
  const json = JSON.stringify(body);
  return { json: Buffer.byteLength(json), wire: gzipSync(json).length };
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * How much data a sync uses (plan.md Phase 4): a first full sync must fit in 500 KB and an idle
 * one in 5 KB, gzipped as they go over the wire. A chop bar's menu and a morning of orders.
 */
describe.skipIf(!hasDatabase())('how much data a sync uses (against Neon)', () => {
  let app: NestExpressApplication;
  let vendor: Vendor;
  let sync: ReturnType<typeof syncClient>;
  let menu: { id: string; price: number }[];
  let cursor: string;
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  const shiftId = ulid();

  const pull = async (from?: string) =>
    (
      await request(app.getHttpServer())
        .get('/api/sync/pull')
        .query(from ? { cursor: from } : {})
        .set('x-device-token', vendor.deviceToken)
        .set('Accept-Encoding', 'gzip')
        .expect(200)
    ).body as { cursor: string; changes: Record<string, unknown[]> };

  const sale = (n: number) => {
    const orderId = ulid();
    const lines = [menu[n % menu.length]!, menu[(n * 7 + 3) % menu.length]!].map((item) => ({
      lineId: ulid(),
      itemId: item.id,
      quantity: 1,
      unitPrice: item.price,
    }));
    const total = lines.reduce((sum, line) => sum + line.unitPrice, 0);
    return [
      sync.command('order.create', {
        orderId,
        displayNumber: `A${n + 1}`,
        businessDate: today,
        source: 'POS',
        type: 'WALK_IN',
        lines,
      }),
      sync.command('payment.record_cash', { paymentId: ulid(), orderId, shiftId, amount: total }),
    ];
  };

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    vendor = await setUpVendor(app.getHttpServer(), 'Yaa');
    menu = await chopBarMenu(app.get<DatabaseHandle>(DATABASE).db, vendor.tenantId);
    sync = syncClient(app.getHttpServer(), vendor);

    // A morning's walk-ins, uploaded 50 at a time as a tablet does.
    const commands = [
      sync.command('shift.open', { shiftId, float: 5000 }),
      ...Array.from({ length: ORDERS }, (_, n) => sale(n)).flat(),
    ];
    for (let i = 0; i < commands.length; i += 50) {
      const results = await sync.push(...commands.slice(i, i + 50));
      expect(results.every((result) => result.status === 'APPLIED')).toBe(true);
    }
  }, 5 * 60_000);

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it(`fits a first full sync (40 menu items, ${ORDERS} orders) in 500 KB`, async () => {
    const first = await pull();
    const size = sizeOf(first);
    console.info(`First full sync: ${kb(size.wire)} on the wire (${kb(size.json)} of JSON)`);
    expect(first.changes.items).toHaveLength(40);
    expect(first.changes.orders).toHaveLength(ORDERS);
    expect(size.wire).toBeLessThan(500 * 1024);
    cursor = first.cursor;
  });

  it('keeps an idle sync under 5 KB', async () => {
    const idle = await pull(cursor);
    const size = sizeOf(idle);
    console.info(
      `Idle sync: ${size.wire} bytes on the wire (${size.json} of JSON); every 30 s, about ${kb(size.wire * 120)} an hour before HTTP headers`,
    );
    expect(Object.values(idle.changes).every((rows) => rows.length === 0)).toBe(true);
    expect(size.wire).toBeLessThan(5 * 1024);
    cursor = idle.cursor;
  });

  it('sends only what changed after one more sale', async () => {
    const results = await sync.push(...sale(ORDERS));
    expect(results.every((result) => result.status === 'APPLIED')).toBe(true);
    const after = await pull(cursor);
    const size = sizeOf(after);
    console.info(`After one sale: ${kb(size.wire)} on the wire (${kb(size.json)} of JSON)`);
    expect(after.changes.orders).toHaveLength(1);
    expect(after.changes.items).toHaveLength(0);
    expect(size.wire).toBeLessThan(5 * 1024);
  });
});
