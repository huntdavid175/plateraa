# Database (`@plateraa/db`)

Neon Postgres 18.6 (AWS eu-central-1), drizzle-orm 0.45.2 with `casing: 'snake_case'`. Two databases: the live one (Render's, which the tablet uses) and a `dev` branch for the laptop and its tests. No branch per PR yet.

## Layout

- `src/schema/*.ts`: the tables, re-exported from `src/schema/index.ts`. Shared column helpers are in `columns.ts`. `approvals.ts` is unused (approvals are a future feature; the table stays).
- `src/client.ts`: `createDatabase`, `withTenant(db, tenantId, fn)`, `withPlatform(db, fn)`.
- `src/sync.ts`: `changedSince`, `nextSyncCursor` for the xid8 sync cursor.
- `src/index.ts` also re-exports the drizzle operators, so apps never import `drizzle-orm` directly.
- `migrations/`: `0000`–`0007`, all applied to both databases.

## Tenant isolation (don't break it)

- Every tenant table has `tenant_id`, `ENABLE` + `FORCE ROW LEVEL SECURITY` and a `tenant_isolation` policy on `current_setting('app.tenant_id', true)`. With no tenant set, queries return zero rows.
- `withTenant()` runs `set_config('role', 'app_user', true)` and `set_config('app.tenant_id', …, true)` in the transaction. `app_user` is `NOLOGIN NOBYPASSRLS`; `neondb_owner` acts as the owner for now.
- Syncable tables carry `sync_xid xid8`, set to `pg_current_xact_id()` by trigger, with a `(tenant_id, sync_xid)` index.
- **Any migration that adds tables must end with `SELECT secure_tenant_tables();`**, which applies RLS, FORCE, the policy and the sync trigger. The catalogue test in `src/rls.test.ts` fails if a table is left unprotected.

## Migrations

- `pnpm --filter @plateraa/db db:generate`, review the SQL, then `pnpm --filter @plateraa/db db:migrate`. Both read `DATABASE_URL_DIRECT` (unpooled) from the repo-root `.env`, which on the laptop is the `dev` branch.
- Before pushing code that needs the migration: `pnpm --filter @plateraa/db db:migrate:production` migrates the live database (`PRODUCTION_DATABASE_URL_DIRECT`, via `scripts/migrate-production.mjs`), and prints which host it's migrating.
- drizzle-kit asks interactively when it suspects a rename, and an agent shell can't answer. Split it into two generates (drop, then add) or write the SQL by hand.
- Changing a Postgres enum means recreating it in SQL (see `0005_tablet_decisions.sql`).

## Tests

`src/rls.test.ts` (7 tests) runs against Neon and skips itself when `DATABASE_URL_DIRECT` isn't set, as in CI. It refuses to run if `DATABASE_URL_DIRECT` is the live database. Run it locally after any schema change.
