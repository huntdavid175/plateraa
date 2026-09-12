import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  and,
  eq,
  isNull,
  itemChannelPrices,
  priceHistory,
  withTenant,
  type Database,
} from '@plateraa/db';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { removeVendors, setUpVendor, type Vendor } from '../test/fixtures';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';

/** Menu setup from the dashboard: items with sizes, extras and platform prices. */
describe.skipIf(!hasDatabase())('menu setup (against Neon)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let vendor: Vendor;
  const ids = {
    rice: ulid(),
    jollof: ulid(),
    regular: ulid(),
    large: ulid(),
    protein: ulid(),
    chicken: ulid(),
    egg: ulid(),
    fish: ulid(),
  };

  const asOwner = (req: request.Test) =>
    req.set('Authorization', `Bearer ${vendor.session}`).set('x-tenant-id', vendor.tenantId);
  const server = () => app.getHttpServer();

  const jollof = {
    categoryId: ids.rice,
    name: 'Jollof rice',
    price: 4500,
    costPrice: 2000,
    prepMinutes: 8,
    station: 'KITCHEN',
    variants: [
      { id: ids.regular, name: 'Regular', price: 4500, channelPrices: { BOLT_FOOD: 5000 } },
      { id: ids.large, name: 'Large', price: 6000 },
    ],
    groups: [
      {
        id: ids.protein,
        name: 'Protein',
        required: false,
        maxSelect: 2,
        options: [
          { id: ids.chicken, name: 'Chicken', priceDelta: 1500 },
          { id: ids.egg, name: 'Egg', priceDelta: 500 },
        ],
      },
    ],
    channelPrices: {},
  };

  const menu = async () => (await asOwner(request(server()).get('/api/menu')).expect(200)).body;

  beforeAll(async () => {
    app = await createTestApp(testEnv());
    db = app.get<DatabaseHandle>(DATABASE).db;
    vendor = await setUpVendor(server(), 'Akua');
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it('adds a category and an item with sizes, extras and a Bolt price', async () => {
    await asOwner(request(server()).post('/api/menu/categories'))
      .send({ id: ids.rice, name: 'Rice' })
      .expect(201);
    await asOwner(request(server()).put(`/api/menu/items/${ids.jollof}`))
      .send(jollof)
      .expect(200);

    const body = await menu();
    expect(body.categories).toEqual([{ id: ids.rice, name: 'Rice', position: 0 }]);
    expect(body.items).toEqual([
      expect.objectContaining({
        id: ids.jollof,
        name: 'Jollof rice',
        price: 4500,
        costPrice: 2000,
        soldOutToday: false,
        variants: [
          expect.objectContaining({
            id: ids.regular,
            price: 4500,
            channelPrices: { BOLT_FOOD: 5000, CHOWDECK: null },
          }),
          expect.objectContaining({ id: ids.large, price: 6000 }),
        ],
        groups: [
          expect.objectContaining({
            id: ids.protein,
            required: false,
            maxSelect: 2,
            options: [
              { id: ids.chicken, name: 'Chicken', priceDelta: 1500 },
              { id: ids.egg, name: 'Egg', priceDelta: 500 },
            ],
            sharedWith: [],
          }),
        ],
      }),
    ]);
  });

  it('sends the platform prices to the tablets', async () => {
    const pull = await request(server())
      .get('/api/sync/pull')
      .set('x-device-token', vendor.deviceToken)
      .expect(200);
    expect(pull.body.changes.itemChannelPrices).toEqual([
      expect.objectContaining({
        itemId: ids.jollof,
        variantId: ids.regular,
        source: 'BOLT_FOOD',
        price: 5000,
      }),
    ]);
  });

  it('changes a price, keeping the old one in price history', async () => {
    await asOwner(request(server()).put(`/api/menu/items/${ids.jollof}`))
      .send({
        ...jollof,
        variants: [jollof.variants[0], { id: ids.large, name: 'Large', price: 6500 }],
        groups: [
          {
            ...jollof.groups[0],
            options: [
              { id: ids.chicken, name: 'Chicken', priceDelta: 1500 },
              { id: ids.fish, name: 'Fish', priceDelta: 2000 },
            ],
          },
        ],
      })
      .expect(200);

    const item = (await menu()).items[0];
    expect(item.variants[1]).toMatchObject({ id: ids.large, price: 6500 });
    expect(item.groups[0].options.map((o: { name: string }) => o.name)).toEqual([
      'Chicken',
      'Fish',
    ]);

    const history = await withTenant(db, vendor.tenantId, (tx) =>
      tx
        .select({ price: priceHistory.price, validTo: priceHistory.validTo })
        .from(priceHistory)
        .where(and(eq(priceHistory.itemId, ids.jollof), eq(priceHistory.variantId, ids.large))),
    );
    expect(history).toHaveLength(2);
    expect(history.find((row) => row.price === 6000)?.validTo).not.toBeNull();
    expect(history.find((row) => row.price === 6500)?.validTo).toBeNull();
  });

  it('drops a size and its platform price when the size is removed', async () => {
    await asOwner(request(server()).put(`/api/menu/items/${ids.jollof}`))
      .send({ ...jollof, variants: [jollof.variants[1]] })
      .expect(200);
    const item = (await menu()).items[0];
    expect(item.variants.map((v: { id: string }) => v.id)).toEqual([ids.large]);
    expect(item.price).toBe(6000);
    const channel = await withTenant(db, vendor.tenantId, (tx) =>
      tx
        .select()
        .from(itemChannelPrices)
        .where(and(eq(itemChannelPrices.itemId, ids.jollof), isNull(itemChannelPrices.deletedAt))),
    );
    // Removed, not deleted, so the removal reaches the tablets.
    expect(channel).toEqual([]);
  });

  it('marks an item sold out for today, and back', async () => {
    const path = `/api/menu/items/${ids.jollof}/sold-out`;
    await asOwner(request(server()).put(path)).send({ soldOut: true }).expect(200);
    expect((await menu()).items[0].soldOutToday).toBe(true);
    await asOwner(request(server()).put(path)).send({ soldOut: false }).expect(200);
    expect((await menu()).items[0].soldOutToday).toBe(false);
  });

  it('keeps a category with items in it, and removes an item', async () => {
    await asOwner(request(server()).delete(`/api/menu/categories/${ids.rice}`)).expect(400);
    await asOwner(request(server()).delete(`/api/menu/items/${ids.jollof}`)).expect(204);
    expect((await menu()).items).toEqual([]);
    await asOwner(request(server()).put(`/api/menu/items/${ids.jollof}`))
      .send(jollof)
      .expect(400);
    await asOwner(request(server()).delete(`/api/menu/categories/${ids.rice}`)).expect(204);
  });
});
