# API (`@plateraa/api`)

NestJS 11 (not 12: nestjs-zod 5.5 needs `@nestjs/common` ^11), CommonJS, built with `tsc`. Validation with nestjs-zod 5.5 + Zod 4; OpenAPI via @nestjs/swagger 11.

## Layout

- `config/env.ts`: Zod-validated env, loaded from the repo-root `.env` locally. Never print `.env`. An empty `KEY=` counts as unset.
- `instrument.ts`: Sentry, imported first in `main.ts`. It reports unexpected errors from requests (`SentryGlobalFilter` in `app.module.ts`) and from background work (`captureException` in `PaymentLinks` and the sync). Only where `SENTRY_DSN` is set (Render), and with no personal data.
- `app.setup.ts`: CORS, compression (gzip on every response), Better Auth mounted at `/api/auth/*splat`, global `/api` prefix, Swagger UI at `/api/docs` in development.
- `auth/`: Better Auth 1.7 for owner/manager email + password (Argon2id via `@node-rs/argon2`, bearer plugin).
- `identity/`: business signup (creates tenant, location and an OWNER staff member), device registration (opaque token, stored hashed), staff, 6-digit PIN login → 15-minute PIN session (jose HS256, `SESSION_SIGNING_SECRET`), lockout via `pinLockout` from `@plateraa/shared`.
  - Guards in `identity/guards.ts`: `@Authorized(...capabilities)` (works for tablet PIN sessions and dashboard logins; permissions re-read every request), `@CurrentActor()`, `@CurrentDevice()`, `@CurrentUser()`.
- `sync/`: `POST /sync/push` and `GET /sync/pull`, authenticated by the **device token** (not a PIN session), so queued sales upload while the screen is locked.
- `audit/audit.ts`: `audit.record(tx, …)`. Call it inside the same transaction as every money, price, stock and access change.
- `payments/` (plan.md §2.5): payment links into each vendor's own Moolre account.
  - `moolre.ts`: `MoolreApi` (create a link, check a payment's status, send an SMS) and `MoolreHttpClient`, behind the `MOOLRE` token so tests can use a pretend Moolre.
  - `payment-links.service.ts`: `PaymentLinks` makes each QUEUED link (our link id is Moolre's `externalref`), texts it and marks it SENT. It claims a link before working on it, so two servers never text it twice. `verify()` asks Moolre for the status; `confirm()` records the LINK payment once and starts prep. It only runs where `RUN_PAYMENT_LINKS=true` (Render), because the laptop shares the database.
  - `payments.module.ts`: `POST /api/payments/moolre/callback`, public and left out of the OpenAPI document. It stores the callback raw in `provider_events`, answers at once, then checks with Moolre before any money counts.
  - `secrets.ts`: `sealSecret` / `openSecret` (AES-256-GCM under `SECRETS_KEY`) for the vendor's Moolre key in `moolre_accounts`.
- `scripts/`: `seed:test-menu`, `settings:portion-counts` and `settings:moolre-account` stand in for dashboard setup until 3.1. They work on the laptop's development database; add `--production` for the live one (`scripts/target.ts`).

## Database access

- Always `withTenant(db, tenantId, fn)` from `@plateraa/db` for tenant data (switches to `app_user`, so RLS applies). `withPlatform()` only for tenant lookup, auth and CLI work.
- Import drizzle operators (`eq`, `and`, `sql`, …) from `@plateraa/db`, never from `drizzle-orm` directly: two copies of drizzle break the types.

## Sync commands

To add one:

1. Schema in `packages/shared/src/sync-commands.ts`, plus its entry in `COMMAND_CAPABILITY`.
2. Handler in `sync/handlers/<area>.ts`, registered in `sync/handlers/index.ts` (the compiler insists every command type has a handler).
3. Throw `CommandRejected` for business refusals: recorded in `sync_commands` and never retried. Any other error stops the batch so the device retries.
4. Each command runs in its own `withTenant` transaction and is idempotent by command id.

Pull runs in one REPEATABLE READ snapshot with an xid8 cursor (`changedSince`, `nextSyncCursor` from `@plateraa/db`). It never returns aggregates, cost prices or PIN hashes.

Current commands (16): `order.create` (no discount), `order.update_items`, `order.set_status` (refuses `AWAITING_PAYMENT` moves), `order.hold`, `order.resume`, `order.cancel` (a paid order becomes "refund owed"), `payment.record_cash`, `payment.record_platform` (a payment that clears an awaiting-payment order moves it to PREPARING), `payment.request_link` (queues a link for what's owed; one open link per order; refused until the business has a Moolre account), `shift.open`, `shift.cash_movement` (DROP / PAY_IN only), `shift.close` (expected = float + cash − payouts − drops + pay-ins; refunds are outside the drawer), `item.set_sold_out`, `stock.prep_count`, `stock.raw_count`, `customer.upsert`.

## After changing routes or DTOs

`pnpm --filter @plateraa/api openapi` (writes `packages/api-client/openapi.json`), then `pnpm --filter @plateraa/api-client generate` (writes `src/schema.ts`). Commit both; never hand-edit them.

## Tests

Vitest with SWC (esbuild can't emit the decorator metadata Nest needs). Files are `src/**/*.spec.ts`, run one file at a time with 30 s timeouts because integration specs make real round trips to Neon. Helpers in `src/test/` (`test-app.ts`, `fixtures.ts`, `sync-client.ts`). The Neon specs (`identity`, `sync`, `sync-money`, `payment-links`) use `describe.skipIf(!hasDatabase())`, so they skip in CI; run them locally before pushing API changes. `createTestApp(env, { moolre })` swaps in a pretend Moolre. Tests call `PaymentLinks.send()` / `verify()` for their own business only, never `work()`: the database is shared, and a real customer's link must never be picked up by a test.
