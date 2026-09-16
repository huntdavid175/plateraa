# Database (`@plateraa/db`)

Neon Postgres 18.6 (AWS eu-central-1), drizzle-orm 0.45.2 with `casing: 'snake_case'`. Three Neon branches: `test` (the automated tests only), `dev` (Render, the tablet and the laptop during development) and `production` (untouched, kept for the pilot; Render moves to it before R1a). No branch per PR yet.

## Layout

- `src/schema/*.ts`: the tables, re-exported from `src/schema/index.ts`. Shared column helpers are in `columns.ts`. `approvals.ts` is unused (approvals are a future feature; the table stays).
- `src/client.ts`: `createDatabase`, `withTenant(db, tenantId, fn)`, `withPlatform(db, fn)`.
- `src/sync.ts`: `changedSince`, `nextSyncCursor` for the xid8 sync cursor, and `anythingChangedSince` — one EXISTS probe per table, so a pull with nothing to send answers from the `(tenant_id, sync_xid)` indexes instead of reading every table (16 Sep; see `apps/api/AGENTS.md`).
- `src/index.ts` also re-exports the drizzle operators, so apps never import `drizzle-orm` directly.
- `0012_storefront` (13 Sep): the online store's settings on `tenant_settings`, `staff_members.system` (the hidden "Online store" member, one per business), and `orders.pay_on_collection` / `orders.track_token`.
- `0013_store_photos` (13 Sep): `tenant_settings.storefront_cover_key` / `storefront_logo_key`, the photo storage names of the store's cover picture and logo (item photos use `items.photo_key`, there from the start).
- `migrations/`: `0000`–`0013`, all applied to `dev`. `production` gets them all with `db:migrate:production` when it's set up for the pilot.
- `0011_dine_in` (13 Sep): order types are `DINE_IN` / `PICKUP` / `DELIVERY` (walk-ins became pickups), and `tenant_settings.offers_dine_in`, on for chop bars, fast food places and cafés (`DINE_IN_VENDOR_TYPES` in `@plateraa/shared`).
- `daily_reports` (0009) keeps finished days' report figures. It's server only: no `sync_xid`, never pulled. `expenses` has a `sync_xid` although it never syncs, so the kept reports can tell a day's money out has changed.

## Tenant isolation (don't break it)

- Every tenant table has `tenant_id`, `ENABLE` + `FORCE ROW LEVEL SECURITY` and a `tenant_isolation` policy on `current_setting('app.tenant_id', true)`. With no tenant set, queries return zero rows.
- `withTenant()` runs `set_config('role', 'app_user', true)` and `set_config('app.tenant_id', …, true)` in the transaction. `app_user` is `NOLOGIN NOBYPASSRLS`; `neondb_owner` acts as the owner for now.
- Syncable tables carry `sync_xid xid8`, set to `pg_current_xact_id()` by trigger, with a `(tenant_id, sync_xid)` index.
- **Any migration that adds tables must end with `SELECT secure_tenant_tables();`**, which applies RLS, FORCE, the policy and the sync trigger. The catalogue test in `src/rls.test.ts` fails if a table is left unprotected.

## Migrations

- `pnpm --filter @plateraa/db db:generate`, review the SQL, then `pnpm --filter @plateraa/db db:migrate`. Both read `DATABASE_URL_DIRECT` (unpooled) from the repo-root `.env`, which on the laptop is the `dev` branch.
- Once Render uses the `production` branch, also run `pnpm --filter @plateraa/db db:migrate:production` before pushing code that needs the migration. It migrates `PRODUCTION_DATABASE_URL_DIRECT` (via `scripts/migrate-production.mjs`) and prints which host it's migrating.
- drizzle-kit asks interactively when it suspects a rename, and an agent shell can't answer. Split it into two generates (drop, then add) or write the SQL by hand.
- Changing a Postgres enum means recreating it in SQL (see `0005_tablet_decisions.sql`).

## Tests

`src/rls.test.ts` (7 tests) runs against the `test` branch (`TEST_DATABASE_URL_DIRECT`) and skips itself when that isn't set, as in CI. `src/testing/global-setup.ts` brings the branch up to the latest migration first (`migrateDatabase` in `src/migrate.ts`). `testDatabaseUrl` refuses a test database that is really `dev` or `production`. Run it locally after any schema change.
