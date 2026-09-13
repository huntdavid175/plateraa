# API (`@plateraa/api`)

NestJS 11 (not 12: nestjs-zod 5.5 needs `@nestjs/common` ^11), CommonJS, built with `tsc`. Validation with nestjs-zod 5.5 + Zod 4; OpenAPI via @nestjs/swagger 11.

## Layout

- `config/env.ts`: Zod-validated env, loaded from the repo-root `.env` locally. Never print `.env`. An empty `KEY=` counts as unset.
- `instrument.ts`: Sentry, imported first in `main.ts`. It reports unexpected errors from requests (`SentryGlobalFilter` in `app.module.ts`) and from background work (`captureException` in `PaymentLinks` and the sync). Only where `SENTRY_DSN` is set (Render), and with no personal data.
- `app.setup.ts`: CORS, compression (gzip on every response), Better Auth mounted at `/api/auth/*splat`, global `/api` prefix, Swagger UI at `/api/docs` in development.
- `auth/`: Better Auth 1.7 for owner/manager email + password (Argon2id via `@node-rs/argon2`, bearer plugin).
- `identity/`: business signup (creates tenant, location and an OWNER staff member), device registration (opaque token, stored hashed), staff, 6-digit PIN login → 15-minute PIN session (jose HS256, `SESSION_SIGNING_SECRET`), lockout via `pinLockout` from `@plateraa/shared`.
  - `staff.ts` and `devices.ts` also serve the dashboard's Staff page:
    - `GET /api/staff` returns the team, never PINs;
    - `PUT /api/staff/:id` changes a name, role or switched on/off, and `seesRevenue` (owner only). Ranks apply;
    - `PUT /api/staff/revenue-visibility` sets who sees sales totals by role (owner only);
    - `GET /api/devices` lists the tablets, and `POST /api/devices/:id/sign-out` signs one out (`devices.manage`).
    - `Directories.deviceByToken` stamps `devices.last_seen_at`, at most once a minute.
  - `me.ts`: `GET /api/me/context`, the dashboard's "who am I". It returns the person's name, role and permissions, and the business in `x-tenant-id`.
  - Guards in `identity/guards.ts`: `@Authorized(...capabilities)` (works for tablet PIN sessions and dashboard logins; permissions re-read every request), `@CurrentActor()`, `@CurrentDevice()`, `@CurrentUser()`.
- `sync/`: `POST /sync/push` and `GET /sync/pull`, authenticated by the **device token** (not a PIN session), so queued sales upload while the screen is locked.
  - **Tablet health** (`tablet-health.ts`): both routes read `x-outbox-pending` and `x-outbox-oldest`, what the tablet has waiting to upload. `TabletHealth` keeps them on `devices` (`pending_changes`, `oldest_pending_at`), counts uploads since the last finished sync (`pushes_since_sync`) and stamps `last_synced_at` on each pull. Recording it never fails a sync.
  - A tablet that keeps uploading without finishing a sync while changes wait (`STUCK_PUSHES`, 10) is online but stuck: it's reported to Sentry, at most once an hour per tablet.
  - `tabletAlerts()` turns a tablet's state into what the owner is told: out of touch for 15 minutes with its drawer open, changes waiting over 10 minutes, stuck, or changes refused in the last day. `GET /api/devices` returns them as `alerts`.
  - `sync-size.spec.ts` measures a first full sync, an idle sync and one after a sale (gzip on the wire) against the plan's limits.
- `audit/audit.ts`: `audit.record(tx, …)`. Call it inside the same transaction as every money, price, stock and access change.
- `payments/` (plan.md §2.5): payment links into each vendor's own Moolre account.
  - `moolre.ts`: `MoolreApi` (create a link, check a payment's status, send an SMS) and `MoolreHttpClient`, behind the `MOOLRE` token so tests can use a pretend Moolre.
  - `payment-links.service.ts`: `PaymentLinks` makes each QUEUED link (our link id is Moolre's `externalref`), texts it and marks it SENT. It claims a link before working on it, so two servers never text it twice. `verify()` asks Moolre for the status; `confirm()` records the LINK payment once and starts prep. It only runs where `RUN_PAYMENT_LINKS=true` (Render), because the laptop shares the database.
  - `payments.module.ts`: `POST /api/payments/moolre/callback`, public and left out of the OpenAPI document. It stores the callback raw in `provider_events`, answers at once, then checks with Moolre before any money counts.
  - `secrets.ts`: `sealSecret` / `openSecret` (AES-256-GCM under `SECRETS_KEY`) for the vendor's Moolre key in `moolre_accounts`.
- `orders/` (dashboard reads):
  - `GET /api/orders?date=&limit=`: a day's orders, newest first, with their items and how they were paid. Or a range (`from`, `to`, up to 92 days), and filters the dashboard's figures link to: `source`, `paid` (PAID, UNPAID, REFUND_OWED, CANCELLED, as the dashboard's badges), `method` (`CASH,LINK`), `item` (by the name sold) and `staffId`. All filtered in SQL (`filtersOf`);
  - `GET /api/orders/refunds-owed`: orders from any day where the customer is owed money back. Needs `refunds.record`.
  - `GET /api/orders/:orderId`: one order in full: lines with extras, payments, refunds, payment links, the status history with who did what, and `customerId`.
- `customers/`: `GET /api/customers?search=` (most recent first; a name or part of a number), `GET /api/customers/:id` (with their latest 50 orders, from `OrdersService.forCustomer`) and `PUT /api/customers/:id` (name and notes, `customers.manage`, audited; the number never changes). `spent` is null without `reports.revenue.view`.
- `reports/`: `GET /api/reports/day?date=`, the day summary (plan.md §3.2). Needs `reports.revenue.view`.
  - Figures hang off the orders' trading day. `figures.ts` holds `DayFigures` (one day's figures, with their definitions) and `workOutDays()`, which works out any set of days in about ten grouped queries.
  - `daily.ts`: `DailyReports.days(tx, tenantId, from, to)` is how both reports get their days.
    - Finished days come from `daily_reports` while nothing on them has changed. Each row's `as_of` is the sync cursor when it was worked out, and any order, payment, refund, order line or expense on that day with a `sync_xid` at or after it means the day is worked out again and kept anew (`lastChangeByDay`, over the sync indexes).
    - Today is always live. Missing days are filled in on read. `RUN_DAILY_REPORTS=true` also gets the last 62 days ready every hour.
    - **When `DayFigures` changes shape or meaning, bump `REPORT_VERSION`,** and every kept day is worked out again.
  - `period.ts`: `GET /api/reports/period?from=&to=` (up to 92 days). It adds up the days' figures into totals and a profit-and-loss, day by day, by source, by method, best sellers, expenses by kind and staff activity; drawer closes with their variances are read as they are.
  - `business-day.ts` has `businessToday()` (today in the business's timezone) and `dueSql`.
- `menu/`: menu setup (`catalog.manage`).
  - `GET /api/menu` returns the whole menu. `PUT /api/menu/items/:itemId` creates or replaces an item, sent with the whole item: sizes, extras groups with their options, and Bolt Food and Chowdeck prices. Also: remove an item, sold out for today, and categories.
  - `POST /api/menu/starter` saves onboarding's starter menu in one transaction, only when the menu is empty.
  - **Removals are soft deletes,** so they sync to the tablets. Platform prices (`item_channel_prices`) sync as well (migration 0008), so they're updated or soft-deleted, never replaced.
  - **Price changes:** every one ends the old `price_history` row and starts a new one (`newPrice`), so the offline price check in `sync/handlers/orders.ts` still matches.
  - **Cost prices** are returned and saved only with `reports.revenue.view`.
  - `zones.ts`: delivery zones (`catalog.manage`). `GET /api/delivery-zones`, `PUT /api/delivery-zones/:zoneId` (create or change; the dashboard makes the id; names are unique, ignoring case) and `DELETE` (a soft delete, so it syncs). All audited.
- `expenses/`: money out and key ingredients.
  - `GET/POST /api/expenses` and `DELETE /api/expenses/:id` (`expenses.manage`). A purchase adds to an ingredient's stock with a PURCHASE movement, and removing it takes that back off. Drawer payouts can't be removed.
  - `/api/stock` (`catalog.manage`) covers raw ingredients: add, edit, stop tracking, and a count (`/count`), which records the difference as a COUNT_ADJUST.
- `settings/`: the owner's settings (`settings.manage`, owner only).
  - `GET /api/settings` returns them all.
  - `PUT /api/settings/business`, `/orders` and `/commissions` save them. `/orders` covers pay before prep, portion counts, dine-in (`offersDineIn`, synced to the tablet and in `/api/me/context`; a new business of a `DINE_IN_VENDOR_TYPES` type starts with it on) and the idle lock; switching counts on adds missing count records. Commissions stay for Bolt Food and Chowdeck's APIs, though the dashboard hides them since 13 Sep.
  - `PUT /api/settings/moolre` saves the vendor's Moolre account. It first asks Moolre about a made-up payment, so wrong details are refused (AIN codes) without charging anyone. The key is sealed with `SECRETS_KEY`, and only the last 4 digits of the account are returned. It uses `MOOLRE`, exported by `PaymentsModule`.
- `storefront/`: the online store (plan.md §4.0).
  - `settings.ts`: `GET`/`PUT /api/storefront/settings` (`storefront.manage`: the owner and managers): on, taking orders now, cash on pickup, accept first, the colour (`STOREFRONT_THEMES` in `@plateraa/shared`), area, phone and hours. The store's link is `STOREFRONT_URL/<slug>`.
  - `public-store.ts`, public and unauthenticated, under `/api/public`: `GET stores/:slug` (the menu with extras, sold out today, zones, what's offered; never cost prices), `POST stores/:slug/orders`, `GET orders/:token`, `POST orders/:token/pay` and `POST orders/:token/check`. The server checks every line against today's menu and sets every price itself (`checkedLines`, then `priceLines` from `sync/handlers/orders.ts`). The browser's `orderId` makes a retry record nothing new.
  - Online orders: source `STOREFRONT`, arrival `API`, no tablet, numbered `W1`, `W2`, … per day (under an advisory lock), `NEW` when the store accepts first, otherwise `CONFIRMED`. They're recorded under the business's hidden "Online store" staff member (`online-staff.ts`, `staff_members.system`), which is never active and is left off the Staff page. Cash on pickup sets `pay_on_collection`, which skips pay before prep. `track_token` is the customer's key; the sync pull leaves it out.
  - Paying online: `PaymentLinks.openForCustomer` makes the Moolre link at once, and the customer is sent straight to it (no text). The link is saved `QUEUED` with `checkedAt` set, so the background sender leaves it alone meanwhile. If Moolre can't be reached, it stays queued and is texted later.
  - Limits (`rate-limit.ts`, in memory, per instance): 60 order attempts per store per 10 minutes, and 6 orders placed per phone number.
- `manager/`: what only a manager or the owner does, on the dashboard. The tablet can't do any of it.
  - `POST /api/orders/:orderId/refunds` (`refunds.record`): money handed back by hand, outside the drawer, full or partial up to what's owed. It lowers the order's `amountPaid`.
  - `PUT /api/orders/:orderId/discount` (`discounts.apply`): percent, amount or none, on an order that isn't fully paid. It's re-priced with `priceOrder`, can't go below what's paid, and starts prep if it clears what's owed.
  - `GET /api/drawers` and `POST /api/drawers/:shiftId/payouts` (`payouts.record`): the open drawers, and cash paid out of one, which is booked as a `CASH_DRAWER` expense for today.
  - Expected cash shows only with `reports.revenue.view`. It uses `expectedCash()` from `sync/handlers/shifts.ts`.
  - The dashboard sends the refund or payout id, so a repeat records it only once.
- `scripts/`: `seed:test-menu`, `settings:portion-counts` and `settings:moolre-account` stand in for dashboard setup until 3.1. They work on the `dev` branch (which Render also uses for now); `--production` targets the `production` branch, for setting up the pilot's vendors (`scripts/target.ts`).

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

For a top-level field that may be null, use `nullableText()` or `nullableFlag()` from `openapi.ts`, not `z.string().nullable()` or `z.boolean().nullable()`. This applies to requests and responses alike. Swagger mistakes the plain form for an array, so the clients would expect a list.

## Tests

Vitest with SWC (esbuild can't emit the decorator metadata Nest needs). Files are `src/**/*.spec.ts`, run one file at a time with 60 s timeouts because integration specs make real round trips to Neon. Helpers in `src/test/` (`test-app.ts`, `fixtures.ts`, `sync-client.ts`). The Neon specs (`identity`, `sync`, `sync-money`, `payment-links`) run on the `test` branch through `testEnv()` (`TEST_DATABASE_URL`), which `src/test/global-setup.ts` brings up to the latest migration first. They use `describe.skipIf(!hasDatabase())`, so they skip when it isn't set, as in CI. They refuse to run on `dev` (Render's payment-link sender works there) or `production`. Run them locally before pushing API changes. `createTestApp(env, { moolre })` swaps in a pretend Moolre. Tests call `PaymentLinks.send()` / `verify()` for their own business only, never `work()`: the database is shared, and a real customer's link must never be picked up by a test.
