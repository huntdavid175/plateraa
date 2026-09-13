import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { removeVendors, seedMenu, setUpVendor, type Vendor } from '../test/fixtures';
import { createTestApp, hasDatabase, testEnv } from '../test/test-app';
import type { PhotoStore } from './photo-store';

/** A pretend photo store: remembers what it was given, and what it was told to remove. */
class FakePhotos implements PhotoStore {
  ready = true;
  readonly kept = new Map<string, string>();
  readonly removed: string[] = [];

  async put(key: string, _bytes: Uint8Array, contentType: string) {
    this.kept.set(key, contentType);
  }

  async remove(key: string) {
    this.removed.push(key);
    this.kept.delete(key);
  }

  urlOf(key: string) {
    return `https://photos.test/${key}`;
  }
}

/** The smallest thing that looks like a WebP picture. */
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(24),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24)]);

/** Menu and store photos against Neon, with a pretend photo store. */
describe.skipIf(!hasDatabase())('photos (against Neon, pretend photo store)', () => {
  const photos = new FakePhotos();
  const today = new Date().toISOString().slice(0, 10); // Africa/Accra is UTC
  let app: NestExpressApplication;
  let vendor: Vendor;
  let menu: Awaited<ReturnType<typeof seedMenu>>;

  const server = () => app.getHttpServer();
  const asOwner = (test: request.Test) =>
    test.set('Authorization', `Bearer ${vendor.session}`).set('x-tenant-id', vendor.tenantId);
  const upload = (path: string, bytes: Buffer, type = 'image/webp') =>
    asOwner(request(server()).put(path)).set('Content-Type', type).send(bytes);
  const itemPhoto = () => `/api/menu/items/${menu.jollof}/photo`;
  const menuPhoto = async () => {
    const { body } = await asOwner(request(server()).get('/api/menu')).expect(200);
    return (body as { items: { id: string; photoUrl: string | null }[] }).items.find(
      (item) => item.id === menu.jollof,
    )!.photoUrl;
  };

  beforeAll(async () => {
    app = await createTestApp(testEnv(), { photos });
    vendor = await setUpVendor(server(), 'Adwoa');
    menu = await seedMenu(app, vendor.tenantId, today);
  });

  afterAll(async () => {
    await removeVendors(app, [vendor]);
    await app.close();
  });

  it("keeps an item's photo in the business's own folder and shows it on the menu", async () => {
    const { body } = await upload(itemPhoto(), WEBP).expect(200);
    const key = `${vendor.tenantId}/items/${menu.jollof}/`;
    expect((body as { url: string }).url).toMatch(
      new RegExp(`^https://photos.test/${key}.+\\.webp$`),
    );
    expect(photos.kept.get((body as { url: string }).url.replace('https://photos.test/', ''))).toBe(
      'image/webp',
    );
    expect(await menuPhoto()).toBe((body as { url: string }).url);
  });

  it('removes the old photo when a new one replaces it, and when it is taken off', async () => {
    const first = (await upload(itemPhoto(), WEBP).expect(200)).body as { url: string };
    const second = (await upload(itemPhoto(), JPEG, 'image/jpeg').expect(200)).body as {
      url: string;
    };
    expect(second.url).toMatch(/\.jpg$/);
    const firstKey = first.url.replace('https://photos.test/', '');
    await vi.waitFor(() => expect(photos.removed).toContain(firstKey));

    await asOwner(request(server()).delete(itemPhoto())).expect(204);
    await vi.waitFor(() =>
      expect(photos.removed).toContain(second.url.replace('https://photos.test/', '')),
    );
    expect(await menuPhoto()).toBeNull();
  });

  it('goes by what the file really is, not what it says it is', async () => {
    await upload(itemPhoto(), Buffer.from('<svg onload="alert(1)"></svg>'), 'image/png').expect(
      400,
    );
    await asOwner(request(server()).put(itemPhoto()))
      .set('Content-Type', 'text/plain')
      .send('hello')
      .expect(415);
  });

  it("refuses an item that isn't on this business's menu", async () => {
    await upload('/api/menu/items/01J00000000000000000000000/photo', WEBP).expect(404);
  });

  it('says so when photo storage is not set up', async () => {
    photos.ready = false;
    try {
      await upload(itemPhoto(), WEBP).expect(503);
    } finally {
      photos.ready = true;
    }
  });

  it("keeps the store's cover and logo and shows them on its online page", async () => {
    await asOwner(request(server()).put('/api/storefront/settings'))
      .send({
        enabled: true,
        takingOrders: true,
        cashOnPickup: false,
        acceptFirst: false,
        theme: 'teal',
        area: '',
        phone: '',
        hours: '',
      })
      .expect(204);
    const cover = (await upload('/api/storefront/photos/cover', WEBP).expect(200)).body as {
      url: string;
    };
    const logo = (await upload('/api/storefront/photos/logo', WEBP).expect(200)).body as {
      url: string;
    };
    expect(cover.url).toContain(`/${vendor.tenantId}/store/cover-`);
    await upload('/api/storefront/photos/banner', WEBP).expect(404);

    const settings = (await asOwner(request(server()).get('/api/storefront/settings')).expect(200))
      .body as { coverUrl: string | null; logoUrl: string | null; photosReady: boolean };
    expect(settings).toMatchObject({ coverUrl: cover.url, logoUrl: logo.url, photosReady: true });

    await upload(itemPhoto(), WEBP).expect(200);
    const { body: store } = await request(server())
      .get(`/api/public/stores/${settingsSlug(settings)}`)
      .expect(200);
    expect(store).toMatchObject({ coverUrl: cover.url, logoUrl: logo.url });
    expect(
      (store as { items: { id: string; photoUrl: string | null }[] }).items.find(
        (item) => item.id === menu.jollof,
      )?.photoUrl,
    ).toMatch(/^https:\/\/photos\.test\//);

    await asOwner(request(server()).delete('/api/storefront/photos/logo')).expect(204);
    const after = (await asOwner(request(server()).get('/api/storefront/settings')).expect(200))
      .body as { logoUrl: string | null };
    expect(after.logoUrl).toBeNull();
  });
});

/** The store's link ends in its slug. */
function settingsSlug(settings: object) {
  return (settings as { url: string }).url.split('/').pop()!;
}
