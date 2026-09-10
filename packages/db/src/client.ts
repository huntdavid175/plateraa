import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransactionConfig } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export function createDatabase(connectionString: string, options: { max?: number } = {}) {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
  const db: Database = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, pool };
}

const TENANT_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * The only way application code touches tenant data. Inside one transaction it drops to the
 * `app_user` role (row-level security always applies, whoever the connection logged in as) and
 * sets `app.tenant_id` for this transaction only, which is safe behind Neon's pooler.
 */
export async function withTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
  config?: PgTransactionConfig,
): Promise<T> {
  if (!TENANT_ID.test(tenantId)) throw new Error(`Invalid tenant id: ${tenantId}`);
  return db.transaction(async (tx) => {
    // One round trip: set_config('role', …, true) is SET LOCAL ROLE.
    await tx.execute(
      sql`select set_config('role', 'app_user', true), set_config('app.tenant_id', ${tenantId}, true)`,
    );
    return fn(tx);
  }, config);
}

/**
 * For the few lookups that happen before the tenant is known: a device token, a receipt token,
 * "which businesses does this login belong to". Runs as the connection's own role, which on Neon
 * bypasses row-level security, so keep every use narrow. When the API gets its own runtime role
 * without BYPASSRLS, these become SECURITY DEFINER functions.
 */
export function withPlatform<T>(db: Database, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
