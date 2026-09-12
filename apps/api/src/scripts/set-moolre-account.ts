import {
  createDatabase,
  eq,
  moolreAccounts,
  or,
  tenants,
  withPlatform,
  withTenant,
} from '@plateraa/db';
import { loadEnv } from '../config/env';
import { sealSecret } from '../payments/secrets';
import { scriptTarget } from './target';

/**
 * Saves a vendor's own Moolre account, so their payment links can go out, until the dashboard's
 * onboarding does it (plan.md §3.1). The details are read from the environment (put them in the
 * repo-root .env, run this, then take them out again), never the command line, so the key
 * doesn't end up in shell history:
 *
 *   MOOLRE_VENDOR_USER, MOOLRE_VENDOR_PUBKEY, MOOLRE_VENDOR_ACCOUNT, MOOLRE_VENDOR_EMAIL
 *
 *   pnpm --filter @plateraa/api settings:moolre-account "<business name or slug>"
 */
async function main() {
  const env = loadEnv();
  const target = scriptTarget(env);
  const wanted = target.args[0]?.trim();
  if (!wanted) {
    throw new Error(
      'Say which business: settings:moolre-account "<business name or slug>" [--production]',
    );
  }
  if (!env.SECRETS_KEY) {
    throw new Error(
      "SECRETS_KEY isn't set. Generate one (see .env.example) and add it to .env and to Render.",
    );
  }
  const details = {
    apiUser: process.env.MOOLRE_VENDOR_USER?.trim(),
    publicKey: process.env.MOOLRE_VENDOR_PUBKEY?.trim(),
    accountNumber: process.env.MOOLRE_VENDOR_ACCOUNT?.trim(),
    email: process.env.MOOLRE_VENDOR_EMAIL?.trim(),
  };
  const missing = Object.entries(details)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(
      `Missing from the environment: MOOLRE_VENDOR_USER, MOOLRE_VENDOR_PUBKEY, MOOLRE_VENDOR_ACCOUNT and MOOLRE_VENDOR_EMAIL are all needed (${missing.join(', ')} not set).`,
    );
  }

  console.log(`Working on ${target.label}.`);
  const { db, pool } = createDatabase(target.url, { max: 1 });
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
    const row = {
      apiUser: details.apiUser!,
      publicKey: sealSecret(details.publicKey!, env.SECRETS_KEY),
      accountNumber: details.accountNumber!,
      email: details.email!,
    };
    await withTenant(db, tenant.id, (tx) =>
      tx
        .insert(moolreAccounts)
        .values({ tenantId: tenant.id, ...row })
        .onConflictDoUpdate({ target: moolreAccounts.tenantId, set: row }),
    );
    console.log(
      `Saved the Moolre account ending ${row.accountNumber.slice(-4)} for ${tenant.name}. Payment links can go out now.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
