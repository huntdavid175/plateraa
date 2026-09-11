import type { NestExpressApplication } from '@nestjs/platform-express';
import { categories, items, stockItems, withTenant } from '@plateraa/db';
import { pesewas } from '@plateraa/shared';
import request from 'supertest';
import { ulid } from 'ulid';
import { loadEnv } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';

type Server = ReturnType<NestExpressApplication['getHttpServer']>;

export interface Vendor {
  userId: string;
  /** The owner's Better Auth session token. */
  session: string;
  tenantId: string;
  ownerStaffId: string;
  deviceToken: string;
  deviceId: string;
}

export const OWNER_PIN = '482913';

/** Signs up an owner, creates their business, sets their PIN and registers a tablet. */
export async function setUpVendor(server: Server, name = 'Ama'): Promise<Vendor> {
  const signUp = await request(server)
    .post('/api/auth/sign-up/email')
    .set('Origin', loadEnv().BETTER_AUTH_URL)
    .send({
      email: `owner-${ulid().toLowerCase()}@test.plateraa.dev`,
      password: 'correct-horse-battery-staple',
      name,
    })
    .expect(200);
  const session = signUp.headers['set-auth-token'] as string;

  const business = await request(server)
    .post('/api/onboarding/business')
    .set('Authorization', `Bearer ${session}`)
    .send({ name: `${name}'s Chop Bar`, vendorType: 'CHOP_BAR' })
    .expect(201);
  const { tenantId, staffId } = business.body as { tenantId: string; staffId: string };

  await request(server)
    .put(`/api/staff/${staffId}/pin`)
    .set('Authorization', `Bearer ${session}`)
    .set('x-tenant-id', tenantId)
    .send({ pin: OWNER_PIN })
    .expect(204);

  const device = await request(server)
    .post('/api/devices/register')
    .set('Authorization', `Bearer ${session}`)
    .send({ tenantId, name: 'Counter tablet' })
    .expect(201);

  return {
    userId: signUp.body.user.id,
    session,
    tenantId,
    ownerStaffId: staffId,
    deviceToken: device.body.deviceToken,
    deviceId: device.body.device.id,
  };
}

/** A two-item menu; three portions of jollof prepped for `businessDate`. */
export async function seedMenu(
  app: NestExpressApplication,
  tenantId: string,
  businessDate: string,
) {
  const { db } = app.get<DatabaseHandle>(DATABASE);
  const ids = { rice: ulid(), jollof: ulid(), sobolo: ulid(), jollofStock: ulid() };
  await withTenant(db, tenantId, async (tx) => {
    await tx.insert(categories).values({ id: ids.rice, tenantId, name: 'Rice' });
    await tx.insert(items).values([
      {
        id: ids.jollof,
        tenantId,
        categoryId: ids.rice,
        name: 'Jollof rice',
        price: pesewas(4500),
        costPrice: pesewas(2000),
      },
      { id: ids.sobolo, tenantId, name: 'Sobolo', price: pesewas(1000), station: 'DRINKS' },
    ]);
    await tx.insert(stockItems).values({
      id: ids.jollofStock,
      tenantId,
      kind: 'SELLABLE',
      itemId: ids.jollof,
      name: 'Jollof rice',
      unit: 'portion',
      onHand: 3,
      onHandDate: businessDate,
    });
  });
  return ids;
}

/** Child tables first, so foreign keys never block a delete. */
const TENANT_TABLES = [
  'audit_events',
  'sync_commands',
  'provider_events',
  'payment_links',
  'moolre_accounts',
  'stock_movements',
  'expenses',
  'refunds',
  'platform_receivables',
  'payments',
  'cash_movements',
  'shifts',
  'approval_requests',
  'receipts',
  'order_events',
  'order_items',
  'orders',
  'customers',
  'stock_items',
  'price_history',
  'item_channel_prices',
  'item_modifier_groups',
  'modifiers',
  'modifier_groups',
  'item_variants',
  'items',
  'categories',
  'devices',
  'staff_members',
  'delivery_zones',
  'channel_commissions',
  'tenant_settings',
  'locations',
];

/** Deletes everything the test vendors created, via the owner connection (bypasses RLS). */
export async function removeVendors(app: NestExpressApplication, vendors: Vendor[]) {
  const { pool } = app.get<DatabaseHandle>(DATABASE);
  const tenantIds = vendors.map((v) => v.tenantId);
  for (const table of TENANT_TABLES) {
    await pool.query(`delete from ${table} where tenant_id = any($1)`, [tenantIds]);
  }
  await pool.query('delete from tenants where id = any($1)', [tenantIds]);
  await pool.query('delete from "user" where id = any($1)', [vendors.map((v) => v.userId)]);
}
