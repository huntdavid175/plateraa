import {
  createDatabase,
  eq,
  or,
  tenantSettings,
  tenants,
  withPlatform,
  withTenant,
} from '@plateraa/db';
import { loadEnv } from '../config/env';

/**
 * Switches morning portion counts on or off for a business, until the dashboard's settings page
 * exists (plan.md §3.1).
 *
 *   pnpm --filter @plateraa/api settings:portion-counts "<business name or slug>" on
 */
async function main() {
  const wanted = process.argv[2]?.trim();
  const choice = process.argv[3]?.trim().toLowerCase();
  if (!wanted || (choice !== 'on' && choice !== 'off')) {
    throw new Error(
      'Say which business, then on or off: settings:portion-counts "<business name or slug>" on',
    );
  }

  const env = loadEnv();
  const { db, pool } = createDatabase(env.DATABASE_URL, { max: 1 });
  try {
    const matches = await withPlatform(db, (tx) =>
      tx
        .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
        .from(tenants)
        .where(or(eq(tenants.slug, wanted), eq(tenants.name, wanted))),
    );
    if (!matches.length) throw new Error(`No business is called "${wanted}"`);
    if (matches.length > 1) {
      throw new Error(
        `${matches.length} businesses are called "${wanted}". Use one of these slugs: ${matches.map((m) => m.slug).join(', ')}`,
      );
    }
    const tenant = matches[0]!;
    await withTenant(db, tenant.id, (tx) =>
      tx
        .update(tenantSettings)
        .set({ countPortions: choice === 'on' })
        .where(eq(tenantSettings.tenantId, tenant.id)),
    );
    console.log(
      `Portion counts are ${choice} for ${tenant.name}. The tablet picks this up on its next sync.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
