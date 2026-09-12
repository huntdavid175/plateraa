# Plateraa: Build Plan

Tick items as they're done (`- [ ]` → `- [x]`). Start date: Thu 10 Sep 2026.
Full design detail: `C:\Users\user\.claude\plans\plan-mode-prompt-you-peaceful-puppy.md`

## Milestones

- [ ] **R1a Pilot-1 live**: Thu 8 Oct 2026 (1–2 friendly, mostly-cash vendors; we set them up)
- [ ] **R1b Pilot-2 live**: Thu 22 Oct 2026 (5–10 vendors who set themselves up)
- [ ] **R1.5 More Moolre payments**: weeks 6–8 (MoMo prompt, instant confirmations; vendor's own Moolre account only). Payment links ship earlier, in the pilot (§2.5)
- [ ] **R2 Storefront + paid plan**
- [ ] **R3 Marketing**
- [ ] **R4 Bolt Food API**

---

## Phase 0: Founder actions (non-code, start now)

- [ ] Open a Moolre business account
- [ ] Get Moolre's answers **in writing**:
  - [ ] **Needed by Thu 24 Sep for pilot payment links (§2.5):** can our API access create payment links on a vendor's own merchant account? Does Moolre text the link to the customer? How long does a link stay valid?
  - [ ] What a vendor needs to open a merchant account (Ghana Card only, or business registration too?) and how long approval takes. Every vendor needs one to join
  - [ ] Refunds and reversals
  - [ ] Webhook signing / IP allowlist
  - _For the split (later): per-vendor wallets and who legally holds the funds, KYC per wallet, internal-transfer fees, how we'd collect our 2% on a vendor's own account_
- [ ] Moolre API access (sandbox + live keys) by Thu 24 Sep
- [ ] Each R1a vendor opens their own Moolre merchant account (their KYC, their money)
- [ ] Engage a Ghanaian fintech + data-protection lawyer (Act 987, AML, Act 843, marketing consent basis)
- [ ] Register with the Data Protection Commission (after the lawyer's advice)
- [ ] Apply as a Bolt Food POS integrator
- [ ] Create a Play Console **organisation** account (needs a D-U-N-S number)
- [ ] Buy 1–2 local 58mm Bluetooth thermal printers
- [ ] Survey pilot vendors: tablet (or whether they need one), Android version, printer, internet (Wi-Fi / hotspot / SIM)
- [ ] Pick 2–3 recommended budget tablets (8–10", sold in Accra, Android 10+ ideally) and buy one for testing
- [ ] Pick the 1–2 mostly-cash vendors for R1a
- [ ] Buy `plateraa.com` (for the API, dashboard and storefront addresses, and login emails)
- [x] Expo account connected to EAS (10 Sep)

---

## Phase 1: Foundations & risk spikes (Week 1: Thu 10 – Wed 16 Sep)

### 1.1 Scaffold

- [x] pnpm + Turborepo monorepo: `apps/{api,mobile,dashboard,storefront}`, `packages/{shared,db,ui}`
- [ ] Pin versions: Node 24 LTS · Expo SDK 57 (RN 0.86) · NestJS 11 · nestjs-zod 5.5 + Zod 4 · drizzle-orm 0.45.2 · better-auth 1.6.x · pg-boss 12.30.x · Next.js 16.3.x · op-sqlite 18.2.x
  - _Pinned so far: Node 24, TypeScript 6.0.3 (not 7: typescript-eslint supports <6.1), pnpm 10.34.5, Expo 57.0.21 / RN 0.86.3 / React 19.2.3, NestJS 11.2.3, Zod 4.6.1, drizzle-orm 0.45.2, Next 16.3.4, Vite 8.2.2, Tailwind 4.3.3, better-auth 1.7.4 (1.7 became `latest` on 10 Sep; the plan said 1.6.x), nestjs-zod 5.5.0, jose 6.2.12, @node-rs/argon2 2.2.1. The rest are pinned as they're added._
- [x] Shared tsconfig, ESLint, Prettier
- [x] GitHub Actions CI: typecheck, lint, test (_green on github.com/huntdavid175/plateraa_)
- [ ] Neon project (AWS eu-central-1) + DB roles `app_owner` / `app_user`; a Neon branch per PR in CI
  - _Project created (Postgres 18.6, eu-central-1); pooled and direct strings verified. `app_user` role created (NOLOGIN; `withTenant()` switches to it). `neondb_owner` acts as `app_owner` for now._
  - [ ] _Before production: a dedicated LOGIN role for the API runtime, and Neon branch per PR in CI (needs a Neon API key in GitHub secrets)._
  - [x] _Before R1a: a separate database branch for development and tests. Today the laptop, its tests and Render all use the same one._
    - _12 Sep: it turns out the Neon database in use all along is the `dev` branch, and the `production` branch is untouched. So development and tests stay on `dev`, and `production` is kept clean for the pilot. On the laptop, `PRODUCTION_DATABASE_URL` / `PRODUCTION_DATABASE_URL_DIRECT` are for `production` (empty until it's set up). They're used only by `db:migrate:production`, which prints the host it migrates, and by setup scripts run with `--production`. The automated tests got a third branch, `test` (`TEST_DATABASE_URL(_DIRECT)`, brought up to the latest migration before each run), and refuse `dev` and `production`. Once Render's payment-link sender was switched on, it worked on `dev` and picked up a test's queued link._
  - [ ] _Before R1a: move Render to the `production` branch. Fill in `PRODUCTION_DATABASE_URL(_DIRECT)`, run `db:migrate:production`, point Render's `DATABASE_URL`s at `production`, then register the pilot tablets and set up the vendors there (setup scripts with `--production`, Moolre accounts included). The tablet's test business stays on `dev`._
- [ ] Render services: API + worker (Frankfurt)
  - [x] API (_11 Sep: https://plateraa-api.onrender.com, Frankfurt, deploys itself from `main`. Checked: health answers, the database is reachable, the API docs page is off._)
  - [ ] _Before R1a: move to the Starter plan. Free sleeps after 15 minutes without traffic and takes about a minute to wake, and has no pre-deploy step, so migrations are run from the laptop for now. On Starter, set the pre-deploy command to `pnpm --filter @plateraa/db db:migrate`._
  - [ ] Worker (_when background jobs arrive: daily rollups, re-checking payment links_)
- [ ] Sentry set up for api, mobile, dashboard and storefront
  - _12 Sep: the API is wired up (`instrument.ts`, `SentryGlobalFilter`, and `captureException` for payment-link and sync failures). It reports errors only, with no personal data, to Sentry's EU region, and goes live once `SENTRY_DSN` is set on Render. The tablet needs `@sentry/react-native` and a new EAS build. The dashboard and storefront get it when they're built._

### 1.2 Day-1 spike (on a real budget Android tablet, 8–10" landscape)

_11 Sep: everything for the spike is built, and the first development build finished on EAS (`e086f12`, [build](https://expo.dev/accounts/huntdavid175/projects/plateraa/builds/11796467-7d45-4fdc-9274-4ef4203a304a), internal APK): op-sqlite 18.2.1; `plateraa-crypto` (PBKDF2, same format as the server's PIN check); `escpos-bt` (paired printers, connect, write); a landscape test screen that runs all three. The other boxes get ticked once it runs on a real tablet._

- [x] Expo 57 development build via EAS (not Expo Go: op-sqlite and our native modules need it); Android package `com.plateraa.pos` (permanent once on Google Play; chosen 10 Sep)
- [x] op-sqlite read/write working (_11 Sep, on the tablet: 2,000 inserts in one transaction in 535 ms, all 2,000 read back with the right total_)
- [x] Native PBKDF2 for the offline PIN check (_the Keystore HMAC parts were for approval codes, now a future feature_) (_11 Sep: against a verifier in the server's format, the right PIN is accepted in 295 ms and a wrong one refused in 230 ms_)
- [x] `escpos-bt` Kotlin module stub: `listBonded`, `connect`, `write`, `disconnect` (_11 Sep: with Bluetooth off it gives our clear "switched off" error; with it on, it lists the tablet's paired devices_)
  - [ ] Print the test receipt on a real 58mm printer (_waiting for a printer_)
  - [ ] _Phase 2 printer setup: the list shows every paired device (headphones too). Show likely printers first (Bluetooth class "imaging"), the rest under "Other devices", because cheap printers often report no class at all. If Bluetooth is off, offer a button to turn it on._
- [x] Write down the results; adjust the plan if anything fails (_nothing failed; no plan change_)

### 1.3 Database (`packages/db`)

- [x] Drizzle schema for every pilot table (tenants, locations, tenant_settings, staff_members, devices, catalog, price_history, customers, orders, order_items, order_events, payments, refunds, platform_receivables, shifts, cash_movements, stock_items, stock_movements, expenses, receipts, approval_requests, audit_events, sync_commands)
  - _31 tables, migrated to Neon. Combos left out until needed (cheap to add later)._
- [x] RLS `ENABLE` + `FORCE` + tenant policy on every tenant table (fails closed)
  - _Applied by `secure_tenant_tables()`; re-run it at the end of any migration that adds tables._
- [x] `sync_xid xid8` triggers + `deleted_at` on syncable tables
- [x] `withTenant()` (runs `SET LOCAL ROLE app_user` + `set_config(..., true)` inside a transaction)
- [x] `withPlatform()` for pre-tenant lookups (device token, "my businesses")
  - _Runs on the owner connection, which has BYPASSRLS on Neon. Becomes `SECURITY DEFINER` functions when the API gets its own runtime role._
- [x] RLS catalogue test: fails if any table is missing RLS/FORCE (_7 isolation tests pass against Neon; skipped in CI until it gets a Neon branch_)
- [x] Seed starter menu templates: chop bar, fast food, café/bakery, juice, cloud kitchen
  - _In `packages/shared` (`MENU_TEMPLATES`), since onboarding applies them per vendor; food truck and "start from scratch" added. Names only; owners set prices in the grid._

### 1.4 Shared (`packages/shared`)

- [x] `Pesewas` branded integer type + money helpers (`roundHalfUp`, bps)
- [x] `priceOrder()` pure function (client = provisional, server = authoritative)
- [x] Order state machine
- [x] Capabilities map (role → capabilities, per-staff override)
- [x] Ghana phone normalisation (`+233…`, the customer key)
- [x] Zod schemas for sync commands (_18 command types, max 50 per push; business rules enforced at the edge_)
- [x] Unit + fast-check tests (_60 passing in `packages/shared`_)

### 1.5 Auth & identity (`apps/api`)

- [x] Better Auth mounted in NestJS, password hash switched to Argon2id
  - _Better Auth 1.7.4 at `/api/auth/*`, bearer plugin for the tablet. Argon2id at OWASP's minimum (19 MiB, 2 passes)._
- [x] Signup → creates tenant + default location + OWNER staff member (`POST /api/onboarding/business`, `GET /api/me/businesses`)
- [x] `POST /devices/register` (device token stored hashed); `GET /api/devices/current/staff` roster with offline PIN checks
- [x] Staff with 6-digit PINs; obvious PINs refused (`POST /api/staff`, `PUT /api/staff/:id/pin`)
- [x] `POST /sessions/pin`: server-side Argon2id check, attempt counter, lockout → 15-minute access token
  - _Lockout rule shared with the tablet (`pinLockout`): 30 s from the 5th wrong PIN, doubling; disabled at the 10th._
- [x] `@RequireCap()` guard (_as `@Authorized(...caps)`: works for tablet PIN sessions and dashboard logins; permissions re-read every request_)
  - _8 API tests pass against Neon, covering the whole journey. The built API runs as plain Node._
- [ ] Follow-up: every request does 2–3 short transactions to Frankfurt. Measure from Ghana, then cache device lookups or merge the queries if it feels slow.

### 1.6 Sync & core API

- [x] `POST /sync/push`: batches of ≤50, one transaction per command, idempotent via `sync_commands`
  - _Authenticated by the tablet (device token), not a PIN session, so queued sales upload while the screen is locked. Each command's own staff member is permission-checked (`COMMAND_CAPABILITY`). Business refusals are recorded and never retried; server errors stop the batch for a retry._
- [x] `GET /sync/pull`: xid8 cursor, filtered by what the device may hold, never includes aggregates (_one REPEATABLE READ snapshot; no cost prices, no PIN hashes_)
  - [x] gzip the response (_`compression` on every response_)
- [x] Command handlers: orders, cash payments, paid-via-platform, cash refunds, shifts, cash movements, stock, sold-out, customers, receipt links
  - [x] Orders: create (re-priced with `priceOrder`), edit items, status, hold/resume, cancel (a paid order is left as a refund owed); prep counts go down with each sale and sell out at zero
  - [x] Payments (cash with change, no overpaying; platform with commission as a receivable), drawer open/drop/pay-in/close with expected vs counted, prep and raw counts, sold-out, customers by phone (_tablet refunds, payouts, discounts and receipt links removed on 11 Sep, §2.0_)
  - [ ] ~~Offline approval codes~~ (_approvals removed from the pilot on 10 Sep; see Later releases_)
- [x] Price check against `price_history` (_mismatches and unapproved discounts keep the sale but add `review_reasons` for the owner_)
- [x] `audit.record()` in the same transaction as the change (_payments, refunds, drawer movements and close, raw counts, sold-out, flagged orders_)
- [x] OpenAPI generation → typed client
  - _`packages/api-client` (rather than `packages/shared`, to keep generated code separate): `pnpm --filter @plateraa/api openapi` writes `openapi.json`, `pnpm --filter @plateraa/api-client generate` types it with openapi-typescript, and `createApiClient()` adds the device, bearer and business headers. Swagger UI at `/api/docs` in development._
  - [ ] CI check that `openapi.json` and `schema.ts` are regenerated whenever the API changes

---

## Phase 2: Tablet app core (Week 2: Thu 17 – Wed 23 Sep)

_The counter device is the vendor's own budget Android tablet, 8–10" landscape, often Wi-Fi or hotspot only (decided 10 Sep)._

### 2.0 Changes from the 10 Sep tablet decisions (code not updated yet; do these first when coding resumes)

- [x] The tablet can't refund, pay out or discount: remove `refund.create_cash`, `PAYOUT` cash movements and order `discount` from the tablet's sync commands (the server refuses them)
- [x] Anyone on the tablet can cancel a paid order (drop the "refund first" rule in `order.cancel`); the order shows "refund owed" until a manager records the refund on the dashboard
- [x] Refunds are recorded only by a manager on the dashboard: money always paid back from outside the drawer (`shift_id` null, drawer untouched), full or partial up to what was paid, reason required
  - _Tablet side done: no refund command, and the drawer's expected cash no longer counts refunds. The dashboard's "record refund" is in 3.1._
- [x] Payouts are recorded only by a manager on the dashboard, against the tablet's open drawer (Phase 3); drops and pay-ins stay on the tablet (_tablet side done; the dashboard part is in 3.1_)
- [x] Discounts are applied only by a manager on the dashboard (Phase 3) (_tablet orders refuse a discount; editing items keeps one a manager applied; the dashboard part is in 3.1_)
- [x] Digital receipts are out of the pilot: remove `receipt.create_link`; printed receipts only
- [x] Remove the approval-code handler and the approval checks in refund/payout/discount code
- [x] Say "tablet" / "device", not "phone", in API messages
- [x] Expo `app.json`: landscape orientation, Android package `com.plateraa.pos` (_the tablet layout itself is 2.3_)

### 2.0b Changes from the 10 Sep order-channel decisions (code not updated yet)

- [x] Remove `WHATSAPP` and `INSTAGRAM` from `ORDER_SOURCES` (shared enum, DB enum migration, regenerated API client). Vendors put the storefront link on their WhatsApp and Instagram, so those customers order on the storefront. Sources left: `POS`, `PHONE`, `STOREFRONT`, `BOLT_FOOD`, `CHOWDECK`, `OTHER`
- [x] Pay before prep (_server done: setting, migration 0005, `AWAITING_PAYMENT` refusal, shared helpers for the tablet; the dashboard switch is in 3.1 and the tablet's awaiting-payment list in 2.3_): per-vendor setting `require_payment_before_prep`, **on by default**. While it's on, an order can't go to Preparing until fully paid (cash, paid via platform or payment link); an unpaid order waits as "awaiting payment" and stays off the prep queue. Pay on delivery only works with the setting off
- [x] The payment that clears an awaiting-payment order moves it to Preparing automatically (no extra tap). Walk-ins pay as they order, so they go straight through
- _Phone orders in the pilot are paid by payment link (§2.5, decided 10 Sep). Clarified 11 Sep: a phone order is typed in exactly like a walk-in, the caller's number is required, and a link sent to that number is the only way it's paid. Walk-ins can pay cash or by link (§2.3)._

### 2.1 Offline engine

_11 Sep: the engine is in `apps/mobile/src/offline`, with tests against a fake server. It hasn't run on the tablet yet: that needs the app shell and device registration (2.2) and a new EAS build._

- [x] Device SQLite schema + migrations (_mirrors what pull sends, never cost prices, plus the outbox; migrations are frozen SQL, and a test checks the columns match_)
- [x] `SqlDriver` interface (op-sqlite on the device, Node's built-in SQLite in tests) (_Node's rather than better-sqlite3: no native build on Windows, CI or EAS_)
- [x] Outbox + sync engine (push on change, pull every 30 s in the foreground, backoff)
  - _A change shows on the tablet at once. The first time an unconfirmed change touches a row, the server's version of it is kept aside; when the server refuses the change, that version comes back and the changes still waiting are applied again, so nothing half-done is left behind. Batches of ≤50 in order; a "try again" stops the batch; a batch the server can't read is split so one bad command can't block the rest; backoff 2 s → 60 s._
  - _Server change: pulls after the first now send every changed order, so an old order that finishes still reaches the tablet (before, it stayed open there for good). The trading-day rule moved to `packages/shared` (`businessDateOf`)._
- [x] Tablet cleanup: drop outbox entries once the server has confirmed them, and delete finished orders older than yesterday (with their items and payments) once the server has them. Never delete anything still waiting to upload or in "Needs attention"
  - _Runs after each pull. An entry goes once the server has taken it and the pull has brought its result back. An order with a change the server hasn't confirmed is never deleted. Refusals stay until dismissed, then 2 days. Closed drawer shifts older than 36 h go too (the server stops sending them then)._
- [x] Connectivity banner + "provisional" labels on offline totals (_11 Sep: the banner is built (`src/ui/SyncBanner.tsx`: offline, signed out, uploading, refused), and its offline notice worked on the tablet. 12 Sep: the provisional labels. An order the server hasn't confirmed says "Not synced yet" in the list and on the order, and its total says "Worked out on this tablet. The server checks it once it's uploaded." The drawer's close says the same until uploaded. Not tried on the tablet yet._)
- [ ] "Needs attention" list for rejected commands (_11 Sep: built (`app/attention.tsx`: what was refused, why, who, when; "Seen" clears it). Not yet seen on the tablet with a real refusal: nothing can cause one until 2.3 adds orders and payments._)

### 2.2 Devices and PINs

_11 Sep: built in the new app shell (Expo Router, `apps/mobile/app/`), with tests for the PIN lockout, and tried on the tablet with the new EAS build ([build](https://expo.dev/accounts/huntdavid175/projects/plateraa/builds/406855bd-bc58-47aa-a983-f90ff10f778e)). Setup, unlocking, the 30 s wait after 5 wrong PINs, adding staff, the idle lock, the offline banner and Tablet check all worked._

- [x] Device registration (Owner/Manager signs in with email once)
  - _Sign in → pick the business → name the tablet → the menu and staff list download → the owner sets their own PIN if they have none. The tablet keeps only its device token (encrypted in secure storage) and signs the email login out. Registering again wipes the tablet's data first._
- [x] 6-digit PIN switcher: local PBKDF2 check, lockout (5 → 30 s doubling, 10 → disabled), auto-lock after 3 idle minutes
  - _Tap your name, type your PIN. The wrong-PIN count is kept in the tablet's database, so restarting the app doesn't reset it, and it starts again when a manager sets a new PIN. The idle lock uses the business's own setting (3 minutes by default). Someone switched off on the dashboard is locked out at the next sync._
- [x] Add staff at the counter (≤60 s)
  - _Owners and managers, online only. Name, role and PIN, confirmed with their own PIN; only the owner can add managers. The new person appears on the lock screen straight after. Works on the tablet; not timed yet._

### 2.3 Taking orders

_11 Sep: built (`apps/mobile/src/counter`; the counter screen is `app/index.tsx`), with tests for the order logic, and tried on the tablet with the test menu. Walk-in cash with change, the kitchen lanes and timers, a required choice (Fufu's soup), a phone order waiting for its link, a Bolt order, hold, edit, cancel with refund owed, and a sale taken offline all worked._

- _Payment links can already be chosen, but they don't go out until §2.5 (Moolre); until then those orders wait under "Awaiting payment"._
- _Server change: Bolt and Chowdeck orders no longer need a customer's number (the platforms keep it); phone orders need the caller's._
- _Test menu for a business, until the dashboard's menu setup (3.1): `pnpm --filter @plateraa/api seed:test-menu "<business name>"`._
- _Gap: Bolt and Chowdeck prices that differ from the menu aren't on the tablet yet (the dashboard sets them in 3.1), so such an order is kept but flagged for review._

- [x] Landscape tablet layout (8" minimum): order entry and prep queue side by side (_menu tiles, the order being typed in, and the orders list_)
  - _11 Sep, user decision: the counter follows the user's own Figma Make design (`apps/mobile/assets/design`): calm and spacious, two panes, one brand colour (#E8701A), DM Sans with DM Mono for money. Tabs across the top (Counter, Orders, Kitchen) replace the third column; a "Now cooking" strip under the menu shows the kitchen at a glance. Walk-ins: Charge opens a payment sheet (cash with keypad and change, or payment link); remote orders (phone, Bolt, Chowdeck) have their own panel. Drawer and Stock tabs come with 2.4._
  - _11 Sep, after a UX review: the strip under the menu shows Cooking and Ready orders; tapping one shows it with its next step (Ready, Handed over, Out for delivery, Delivered), so a one-tablet counter needn't leave the till. After a sale, a big card shows the order number and the change to give until the next tap (the small toast is left for holds, edits and problems). Not tried on the tablet yet._
- [x] Counter mode: big text tiles, modifier sheet only when required, optional customer phone, then pay by cash (tendered → change) or payment link (the customer's number is needed for a link) (≤15 s for cash) (_not timed yet_)
- [x] Phone order entry (typed in like a walk-in, caller's number required, paid only by a payment link sent to that number) and hand-typed Bolt/Chowdeck orders: source, pickup/delivery, address + zone → fee (_delivery with zones not tried yet: the test business has no zones_)
- [x] Inbox sorted by urgency; unpaid orders sit in an "awaiting payment" list and don't reach the prep queue while pay-before-prep is on
- [x] Prep queue: readable from 2 m, amber/red timers, tap to advance, optional Kitchen/Drinks split (_amber at the prep time, red at half as long again; "from 2 m" not measured yet_)
- [x] Hold / resume / edit before prep / cancel with a reason (anyone can cancel a paid order; it then shows "refund owed" until a manager records the refund)
- [x] Payments: walk-ins by cash or payment link; phone orders by payment link only; Bolt/Chowdeck as paid via platform (links: §2.5) (_cash and "paid on Bolt/Chowdeck" work; links can be chosen, and go out once §2.5 is done_)

### 2.4 Cash & stock

- [x] Open shift with float (_11 Sep: built with 2.3, because cash needs an open drawer, and worked on the tablet. Later that day it moved to the start of the day: once someone who runs the drawer unlocks and none is open, the counter asks for the float. "Not now" holds for the trading day, and the first cash sale then asks instead. The move isn't tried on the tablet yet._)
- [x] Drops and pay-ins (payouts are recorded by a manager on the dashboard) (_11 Sep: the Drawer tab's "Take cash out" and "Put cash in", with an optional reason; payouts from the dashboard show in the same list. Not tried on the tablet yet._)
- [x] Close shift: expected vs counted vs variance, own shift only (_11 Sep: a blind count. Staff enter the cash counted, and only then see what the tablet expected and the difference ("Short by GH₵ 5.00"). The figures show only to the person who closed, or to someone allowed to see revenue, because expected cash includes the shift's cash sales. Anyone who runs the drawer can close it, so a drawer left open can still be closed. Not tried on the tablet yet._)
- [x] One-tap sold-out toggle (_11 Sep: the Stock tab lists the menu, each item with one button showing "On sale" or "Sold out"; a tap flips it, and it lasts the trading day. Not tried on the tablet yet._)
- [x] Morning prep counts that count down on each sale → auto sold-out at 0
  - _11 Sep, user decision: optional. For cooked food it's hard to know how many portions were made, so the owner switches counts on or off in the dashboard's settings (off by default). When off, items sell until someone taps "sold out"._
  - _11 Sep: built. `tenant_settings.count_portions` (migration 0006) syncs to the tablet. When it's on, the Stock tab's "Add portions" adds to today's count for items that have a count record, sales count down, and the item sells out by itself at 0. Only the seed script makes count records so far; the dashboard makes them in 3.1. Until then, `pnpm --filter @plateraa/api settings:portion-counts "<business>" on` switches counts on. Not tried on the tablet yet._
- [ ] Owner summaries held in memory only, cleared when the PIN session ends
  - _11 Sep: moved to go with the day summary in 3.2. The design says the owner's summary needs a connection, so the tablet will fetch it from the same reporting the dashboard uses rather than add up sales itself._

### 2.5 Payment links (pilot; added 10 Sep)

_Money goes straight into each vendor's own Moolre merchant account and never passes through us (decided 10 Sep: vendors without their own Moolre account aren't onboarded). No wallets and no split, so the wallet and legal gates don't block this; still worth a quick confirmation from the lawyer. How we take our 2% is decided later (Later releases: the split)._

_11 Sep: the server side is built from Moolre's docs (docs.moolre.com; their `/ai/*.md` pages are readable as plain text), tested end to end against Neon with a pretend Moolre. How it runs: the tablet's `payment.request_link` command saves a `payment_links` row (QUEUED); the API makes the link in the vendor's own Moolre account (`/embed/link`, our link id as `externalref`, a callback URL, 60-minute expiry), texts it from **our** Moolre SMS account (`/open/sms/send`, one plain SMS: "Ama's Kitchen: pay GHS 45.00 for order A15: <link>"), and marks it SENT. A callback is stored raw in `provider_events`, then Moolre's status check (`/open/transact/status`, `txstatus` 1 = paid) must confirm it before the LINK payment is recorded, once, and the order moves to Preparing. Open links are re-checked every 3 minutes, and expire 10 minutes after Moolre's own expiry. Only the deployed API runs this (`RUN_PAYMENT_LINKS=true`), because the laptop shares the database. Render needs `SECRETS_KEY`, `MOOLRE_BASE_URL`, `MOOLRE_SMS_VASKEY`, `MOOLRE_SMS_SENDER_ID` and `RUN_PAYMENT_LINKS=true`; a vendor's account is saved with `pnpm --filter @plateraa/api settings:moolre-account "<business>"` until onboarding (3.1)._

- [x] Moolre sandbox spike: create a link, pay it, receive the webhook, confirm via Payment Status, check the `TP14` first-payer OTP step (_moved up from Phase 5_)
  - _12 Sep: done on live Moolre instead of the sandbox (see below). A real phone order from the tablet was texted its link, paid, confirmed and moved to Preparing without a tap. Moolre asked the payer for a one-time code on **every** payment, not only the first; that's Moolre's step on their page, and nothing for us to handle._
  - _Waiting for the keys. To confirm in the sandbox (`https://sandbox.moolre.com`): the SMS recipient format (we send "0241234567"), that a link payment's status is found by our `externalref`, the callback's exact fields, and our sender name's approval._
  - _12 Sep: the first link from the tablet failed with "Moolre didn't accept this business's account details". A read-only check showed why: keys made at app.moolre.com are live keys. The sandbox answers "user not found" (AIN03), while live accepts them ("transaction not found", SS07). Plateraa's SMS key works on both. So testing goes through the live API (`MOOLRE_BASE_URL=https://api.moolre.com`) with a small real payment into the test vendor's own account. Failure notes now carry Moolre's code, and say whether the link or the text failed._
- [x] `PaymentProvider` interface + Moolre adapter (create link, check status); each vendor's Moolre account details stored per tenant, secrets encrypted (_11 Sep: `MoolreApi` / `MoolreHttpClient` in `apps/api/src/payments/moolre.ts`; `moolre_accounts`, the key sealed with AES-256-GCM under `SECRETS_KEY`, never sent to a device_)
- [x] New payment method for link payments, PENDING → CONFIRMED; only confirmed money counts as money in (_11 Sep: method `LINK`, recorded only once Moolre's status check says paid; the link itself goes QUEUED → SENT → PAID, or FAILED / EXPIRED with the reason in words_)
- [x] Tablet: "Send payment link" on an unpaid order → server creates a link for what's still owed → sent to the customer's number. It's the only way a phone order is paid, and the alternative to cash for a walk-in (_11 Sep: a phone order, or a walk-in choosing "Payment link", sends its link as the order is saved. The order shows the link's state in words, and "Send a new payment link" once one fails or expires. Not tried on the tablet yet: real links need the Moolre keys and Render's settings._)
  - _Sending needs the internet. An order taken offline is still saved, and its link goes out once the tablet reconnects (11 Sep)._
  - _How the link reaches the caller: settled 11 Sep. Moolre has its own SMS service, so links are texted from one Plateraa SMS account (a VAS key and an approved sender name, max 11 characters). Server side done; the tablet's button and the link's status on the order are next._
- [x] Webhook receiver → store the raw payload → confirm with Moolre's status check (webhooks aren't signed) → record the payment → order moves to Preparing (§2.0b). A job re-checks pending links every few minutes in case a webhook is missed (_11 Sep: `POST /api/payments/moolre/callback`. A callback from an address Moolre doesn't publish is logged, not refused, since the status check is the real safeguard. The re-check runs inside the API every minute, not in a separate worker._)
- [x] The tablet sees the payment on its next pull (≤30 s); push (SSE/FCM) stays in R1.5 (_11 Sep: links sync as `paymentLinks`; the payment and the order's new status come with them_)
- [x] If the caller doesn't pay or the link expires, the order stays in "awaiting payment" and staff can send a new link (_11 Sep: a link expires 10 minutes after Moolre's own expiry (60 minutes); the order then offers "Send a new payment link"_)
- [x] Money that arrives on a cancelled order shows as "refund owed"; a manager records the refund on the dashboard and the vendor sends the MoMo back by hand (Moolre has no refund endpoint) (_12 Sep: a link paid after the order was cancelled is still recorded, so it shows as refund owed. `refundOwed` now also counts anything paid over what's due, e.g. cash taken and then the old link paid too. The order warns about that before cash is taken while a link is open. Recording the refund is dashboard work, 3.1._)
- _Deadline: Moolre API access by Thu 24 Sep. 11 Sep, user decision: phone orders are in the pilot regardless, and the API keys are on their way, so the old fallback (R1a without links, call orders waiting for cash) is dropped._

---

## Phase 3: Dashboard, reporting, receipts (Week 3: Thu 24 – Wed 30 Sep)

### 3.1 Dashboard

- [ ] App shell (Vite, TanStack Query/Table, shadcn themed hard)
- [ ] Onboarding that works in a phone browser: business → vendor type → starter template → price grid → staff & PINs → connect their own Moolre account (required; we check it works) → install-app QR (≤20 min)
- [ ] Menu CRUD: categories, items, variants, modifier groups, add-ons, prep time, station, cost price
- [ ] Delivery zones + fees
- [ ] Channel commissions (rate or flat; blank = shown as "Gross")
- [ ] Staff management + revenue visibility settings (per role, per person)
- [ ] Setting: count portions each morning (prep counts), off by default (_11 Sep user decision; the tablet side is done, §2.4_). Switching it on gives every menu item a daily count record, and new items get one too.
- [ ] Order setting: pay before prep (on by default; the owner can switch it off)
- [ ] Manager tools: record drawer payouts against the tablet's open shift (booked as expenses); apply discounts to unpaid orders; a "refunds owed" list and recording refunds given back by hand (outside the drawer, full or partial, reason required)
- [ ] Expenses + purchases entry (purchase = expense + stock item + qty)
- [ ] Stock items: low-stock thresholds, raw-item counts

### 3.2 Reporting

- [ ] Day summary: money in / not yet collected / money out / what's left / profit
- [ ] Sales by channel, by item, by payment method
- [ ] Expenses report, simple P&L (money in − purchases − expenses)
- [ ] Staff activity, shift variances
- [ ] pg-boss rollup job for past days
- [ ] Every figure taps through to the rows behind it

### 3.3 Receipts & printing

- [ ] ESC/POS receipt printing end to end (58mm, 32 columns): the only receipt in the pilot, so it has to be solid
- [ ] ~~Digital receipt page and WhatsApp share~~ (_moved to Later releases on 10 Sep_)

---

## Phase 4: Hardening → R1a live (Week 4: Thu 1 – Thu 8 Oct)

- [ ] Offline torture script: airplane mode mid-order, kill the app mid-sync, replay a batch twice, 200 queued commands
- [ ] Measure sync payloads (idle ≤5 KB, first full sync ≤500 KB) and APK size
- [ ] Performance check on a 2–3 GB budget tablet
- [ ] Device heartbeat + alerts (outbox age, sync failures, 5xx, job failures)
- [ ] Admin CLI v0: list/suspend tenants, revoke a device, reset a PIN, export the audit log
- [ ] All items in the **R1a definition of done** below are green
- [ ] Install at 1–2 vendors; on site for their first day

---

## Phase 5: R1b (Weeks 5–6: Fri 9 – Thu 22 Oct)

- [ ] Triage + fix pilot feedback
- [ ] Harden printing across the surveyed printer models
- [ ] Polish self-serve onboarding + measure time to first order
- [ ] Play closed-testing track set up
- [ ] Onboard 5–10 vendors
- [ ] Moolre spike for R1.5: MoMo prompt on a vendor's own account (_links moved to the pilot, §2.5; wallets and transfers wait for the split_)

---

## Phase 6: R1.5 More Moolre payments (Weeks 6–8)

_Vendor's own Moolre account only (decided 10 Sep): customer money never passes through us, so this no longer waits on the wallet and legal gates. Those now gate only the split (Later releases)._

- [ ] MoMo prompt from the tablet (including the `TP14` first-payer OTP step)
- [ ] SSE + FCM for payment confirmations
- [ ] Fee snapshots per payment (Moolre's fee / net, rates in bps)
- [ ] Fee-bearer setting (vendor absorbs Moolre's fee, or a visible customer service fee)
- [ ] Daily reconciliation against Moolre → `recon_exceptions`
- [ ] Super-admin console v1
- [ ] Photo-menu import

---

## Later releases (plan in detail when we get there)

- [ ] **R2**: Storefront PWA + paid plan (prepaid 30-day MoMo passes). The storefront is the one link vendors put on WhatsApp and Instagram; customers pay online before the order goes to the kitchen
- [ ] **R3**: Marketing: segments, composer, templates, promo codes, attribution, opt-outs, spend caps
- [ ] **R4**: Bolt Food API adapter (after integrator approval)
- [ ] **Future: the split.** How Plateraa takes its 2% on Moolre payments. Until it's decided, customer money goes only into each vendor's own Moolre account (10 Sep). Gated on Moolre's written answers + the legal opinion. Work parked here from the old R1.5: settlement accounts (WALLET / DIRECT / POOLED, effective-dated), double-entry ledger, commission sweep, payout jobs, refunds via Transfer (vendor bears the 1% + 2%), KYC on payout MoMo numbers
- [ ] **Future: approvals.** Owner/manager approves refunds, payouts and big discounts requested at the counter (push to the owner's phone, offline codes). Removed from the pilot on 10 Sep 2026; the `approval_requests` table stays.
- [ ] **Future: digital receipts.** Receipt page, QR code on the tablet screen, WhatsApp share. Removed from the pilot on 10 Sep 2026; printed receipts only until then.

---

## R1a definition of done

- [ ] Simulated full day on a 2–3 GB budget tablet: ≥100 orders, ≥1 hour in airplane mode
- [ ] Zero lost or duplicated orders after sync
- [ ] Median walk-in cash order ≤15 s (timed)
- [x] A phone order paid by link (a real small payment on live Moolre) reaches Preparing without a tap (_12 Sep, on the test business_)
- [ ] Shift variance matches the physical cash count
- [ ] Day summary matches a hand tally
- [ ] Device SQLite contains no aggregate revenue data
- [ ] RLS isolation tests green (tenant B can't read tenant A)
- [ ] Staff token gets 403 on every `/reports/*` route
- [ ] Replaying a sync batch gives the same state
- [ ] Refunds, payouts and discounts can't be done from the tablet (the server refuses them)
- [ ] Sentry + heartbeat alerts fire

---

## Key rules (don't break these)

- Server is the source of truth for money; the tablet never settles money.
- Money is integer pesewas (`BIGINT` / `Pesewas`). No floats, ever.
- Every tenant query goes through `withTenant()`; RLS on everything.
- Staff never receive aggregate revenue unless granted, enforced server-side and absent from device storage.
- Money, price, stock and access changes are audited in the same transaction.
- Non-cash payments go through Moolre only; direct MoMo isn't recorded.
- Customer money goes into the vendor's own Moolre account and never passes through us (until the split is decided).
- If a change makes order entry slower, it's the wrong change.
