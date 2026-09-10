import { eq, sql } from 'drizzle-orm';
import type pg from 'pg';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, withTenant, type Database } from './client.js';
import { auditEvents, categories, tenants } from './schema/index.js';

const url = process.env.DATABASE_URL_DIRECT;

/** Tables that are deliberately not tenant-scoped: Better Auth logins sit above any one business. */
const NOT_TENANT_SCOPED = new Set(['user', 'session', 'account', 'verification']);

/** Drizzle wraps driver errors; the Postgres message is on the cause. */
async function errorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
    return `${error instanceof Error ? error.message : String(error)} ${cause}`;
  }
  return 'no error';
}

describe.skipIf(!url)('tenant isolation (against Neon)', () => {
  let db: Database;
  let pool: pg.Pool;
  const tenantA = ulid();
  const tenantB = ulid();

  beforeAll(async () => {
    ({ db, pool } = createDatabase(url!, { max: 2 }));
    for (const id of [tenantA, tenantB]) {
      await withTenant(db, id, async (tx) => {
        await tx.insert(tenants).values({
          id,
          slug: `test-${id.toLowerCase()}`,
          name: `Test ${id}`,
          vendorType: 'CHOP_BAR',
        });
        await tx.insert(categories).values({ id: ulid(), tenantId: id, name: `Rice ${id}` });
      });
    }
  });

  afterAll(async () => {
    // Clean up as the owner: the audit log is append-only for app_user.
    for (const id of [tenantA, tenantB]) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(`select set_config('app.tenant_id', $1, true)`, [id]);
        await client.query('delete from audit_events where tenant_id = $1', [id]);
        await client.query('delete from categories where tenant_id = $1', [id]);
        await client.query('delete from tenants where id = $1', [id]);
        await client.query('commit');
      } finally {
        client.release();
      }
    }
    await pool.end();
  });

  it('forces row-level security with a tenant policy on every table', async () => {
    const { rows } = await pool.query<{
      table: string;
      rls: boolean;
      forced: boolean;
      policies: number;
    }>(`
      select c.relname as table, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname
                 and p.policyname = 'tenant_isolation') as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`);

    expect(rows.length).toBeGreaterThan(20);
    const unprotected = rows
      .filter((r) => !NOT_TENANT_SCOPED.has(r.table))
      .filter((r) => !(r.rls && r.forced && r.policies === 1))
      .map((r) => r.table);
    expect(unprotected).toEqual([]);
  });

  it('only shows a tenant its own rows', async () => {
    const rows = await withTenant(db, tenantA, (tx) => tx.select().from(categories));
    expect(rows.map((r) => r.tenantId)).toEqual([tenantA]);
  });

  it('shows nothing when no tenant is set', async () => {
    const count = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role app_user`);
      const result = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from categories`,
      );
      return result.rows[0]?.n;
    });
    expect(count).toBe(0);
  });

  it('refuses to write a row into another tenant', async () => {
    const message = await errorOf(
      withTenant(db, tenantA, (tx) =>
        tx.insert(categories).values({ id: ulid(), tenantId: tenantB, name: 'Sneaky' }),
      ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("can't update another tenant's rows", async () => {
    const updated = await withTenant(db, tenantA, (tx) =>
      tx
        .update(categories)
        .set({ name: 'Hijacked' })
        .where(eq(categories.tenantId, tenantB))
        .returning(),
    );
    expect(updated).toEqual([]);
  });

  it('moves the sync cursor forward on every update', async () => {
    const read = () =>
      withTenant(db, tenantA, (tx) =>
        tx.select({ id: categories.id, syncXid: categories.syncXid }).from(categories),
      );
    const [before] = await read();
    await withTenant(db, tenantA, (tx) =>
      tx.update(categories).set({ name: 'Rice & Stew' }).where(eq(categories.id, before!.id)),
    );
    const [after] = await read();
    expect(BigInt(after!.syncXid)).toBeGreaterThan(BigInt(before!.syncXid));
  });

  it('keeps the audit log append-only', async () => {
    const auditId = ulid();
    await withTenant(db, tenantA, (tx) =>
      tx.insert(auditEvents).values({
        id: auditId,
        tenantId: tenantA,
        action: 'test.event',
        entityType: 'test',
        entityId: auditId,
      }),
    );
    const update = await errorOf(
      withTenant(db, tenantA, (tx) =>
        tx.update(auditEvents).set({ action: 'tampered' }).where(eq(auditEvents.id, auditId)),
      ),
    );
    const remove = await errorOf(
      withTenant(db, tenantA, (tx) => tx.delete(auditEvents).where(eq(auditEvents.id, auditId))),
    );
    expect(update).toMatch(/permission denied/);
    expect(remove).toMatch(/permission denied/);
  });
});
