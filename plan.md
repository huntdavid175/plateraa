# Plateraa: Build Plan

Tick items as they're done (`- [ ]` → `- [x]`). Start date: Thu 10 Sep 2026.
Full design detail: `C:\Users\user\.claude\plans\plan-mode-prompt-you-peaceful-puppy.md`

## Milestones

- [ ] **R1a Pilot-1 live**: Thu 8 Oct 2026 (1–2 friendly, mostly-cash vendors; we set them up)
- [ ] **R1b Pilot-2 live**: Thu 22 Oct 2026 (5–10 vendors who set themselves up)
- [ ] **R1.5 Moolre payments**: weeks 6–8 (only once Moolre + the lawyer clear it)
- [ ] **R2 Storefront + paid plan**
- [ ] **R3 Marketing**
- [ ] **R4 Bolt Food API**

---

## Phase 0: Founder actions (non-code, start now)

- [ ] Open a Moolre business account
- [ ] Get Moolre's answers **in writing**:
  - [ ] Per-vendor wallets under our platform profile, and who legally holds the funds
  - [ ] KYC requirements per wallet
  - [ ] Internal-transfer fees and limits
  - [ ] Refunds and reversals
  - [ ] Webhook signing / IP allowlist
  - [ ] How we'd collect our 2% in DIRECT mode (vendor's own merchant account)
- [ ] Engage a Ghanaian fintech + data-protection lawyer (Act 987, AML, Act 843, marketing consent basis)
- [ ] Register with the Data Protection Commission (after the lawyer's advice)
- [ ] Apply as a Bolt Food POS integrator
- [ ] Create a Play Console **organisation** account (needs a D-U-N-S number)
- [ ] Buy 1–2 local 58mm Bluetooth thermal printers
- [ ] Survey pilot vendors: phone models, Android versions, printers
- [ ] Pick the 1–2 mostly-cash vendors for R1a

---

## Phase 1: Foundations & risk spikes (Week 1: Thu 10 – Wed 16 Sep)

### 1.1 Scaffold

- [x] pnpm + Turborepo monorepo: `apps/{api,mobile,dashboard,storefront}`, `packages/{shared,db,ui}`
- [ ] Pin versions: Node 24 LTS · Expo SDK 57 (RN 0.86) · NestJS 11 · nestjs-zod 5.5 + Zod 4 · drizzle-orm 0.45.2 · better-auth 1.6.x · pg-boss 12.30.x · Next.js 16.3.x · op-sqlite 18.2.x
  - _Pinned so far: Node 24, TypeScript 6.0.3 (not 7: typescript-eslint supports <6.1), pnpm 10.34.5, Expo 57.0.21 / RN 0.86.3 / React 19.2.3, NestJS 11.2.3, Zod 4.6.1, drizzle-orm 0.45.2, Next 16.3.4, Vite 8.2.2, Tailwind 4.3.3. The rest are pinned as they're added._
- [x] Shared tsconfig, ESLint, Prettier
- [x] GitHub Actions CI: typecheck, lint, test (_green on github.com/huntdavid175/plateraa_)
- [ ] Neon project (AWS eu-central-1) + DB roles `app_owner` / `app_user`; a Neon branch per PR in CI
  - _Project created (Postgres 18.6, eu-central-1); pooled and direct strings verified. `app_user` role created (NOLOGIN; `withTenant()` switches to it). `neondb_owner` acts as `app_owner` for now._
  - [ ] _Before production: a dedicated LOGIN role for the API runtime, and Neon branch per PR in CI (needs a Neon API key in GitHub secrets)._
- [ ] Render services: API + worker (Frankfurt)
- [ ] Sentry set up for api, mobile, dashboard and storefront

### 1.2 Day-1 spike (on a real cheap Android, API 24–28)

- [ ] Expo 57 dev build via EAS
- [ ] op-sqlite read/write working
- [ ] `secure-hmac` Kotlin module: `importKey`, `hmac`, `deleteKey`, `securityLevel`, `pbkdf2`
- [ ] `escpos-bt` Kotlin module stub: `listBonded`, `connect`, `write`, `disconnect`
- [ ] Write down the results; adjust the plan if anything fails

### 1.3 Database (`packages/db`)

- [x] Drizzle schema for every pilot table (tenants, locations, tenant_settings, staff_members, devices, catalog, price_history, customers, orders, order_items, order_events, payments, refunds, platform_receivables, shifts, cash_movements, stock_items, stock_movements, expenses, receipts, approval_requests, audit_events, sync_commands)
  - _31 tables, migrated to Neon. Combos left out until needed (cheap to add later)._
- [x] RLS `ENABLE` + `FORCE` + tenant policy on every tenant table (fails closed)
  - _Applied by `secure_tenant_tables()`; re-run it at the end of any migration that adds tables._
- [x] `sync_xid xid8` triggers + `deleted_at` on syncable tables
- [x] `withTenant()` (runs `SET LOCAL ROLE app_user` + `set_config(..., true)` inside a transaction)
- [ ] `withPlatform()`: `SECURITY DEFINER` lookups for device tokens and receipt tokens (_with Phase 1.5_)
- [x] RLS catalogue test: fails if any table is missing RLS/FORCE (_7 isolation tests pass against Neon; skipped in CI until it gets a Neon branch_)
- [x] Seed starter menu templates: chop bar, fast food, café/bakery, juice, cloud kitchen
  - _In `packages/shared` (`MENU_TEMPLATES`), since onboarding applies them per vendor; food truck and "start from scratch" added. Names only; owners set prices in the grid._

### 1.4 Shared (`packages/shared`)

- [x] `Pesewas` branded integer type + money helpers (`roundHalfUp`, bps)
- [x] `priceOrder()` pure function (client = provisional, server = authoritative)
- [x] Order state machine
- [x] Capabilities map (role → capabilities, per-staff override)
- [x] Ghana phone normalisation (`+233…`, the customer key)
- [ ] Zod schemas for sync commands
- [ ] Unit + fast-check tests (_28 passing for the modules above; sync command schemas still to come_)

### 1.5 Auth & identity (`apps/api`)

- [ ] Better Auth mounted in NestJS, password hash switched to Argon2id
- [ ] Signup → creates tenant + default location + OWNER staff member
- [ ] `POST /devices/register` (device token stored hashed)
- [ ] Staff with 6-digit PINs; obvious PINs refused
- [ ] `POST /sessions/pin`: server-side Argon2id check, attempt counter, lockout → 15-minute access token
- [ ] `@RequireCap()` guard

### 1.6 Sync & core API

- [ ] `POST /sync/push`: batches of ≤50, one transaction per command, idempotent via `sync_commands`
- [ ] `GET /sync/pull`: xid8 cursor, filtered by what the device may hold, gzipped, never includes aggregates
- [ ] Command handlers: orders, cash payments, paid-via-platform, cash refunds, shifts, cash movements, stock, sold-out, customers, receipt links
- [ ] Price check against `price_history` (flag `price_mismatch`)
- [ ] `audit.record()` in the same transaction as the change
- [ ] OpenAPI generation → typed client

---

## Phase 2: Mobile core (Week 2: Thu 17 – Wed 23 Sep)

### 2.1 Offline engine

- [ ] Device SQLite schema + migrations
- [ ] `SqlDriver` interface (op-sqlite on the device, better-sqlite3 in tests)
- [ ] Outbox + sync engine (push on change, pull every 30 s in the foreground, backoff)
- [ ] Connectivity banner + "provisional" labels on offline totals
- [ ] "Needs attention" list for rejected commands

### 2.2 Devices, PINs, approvals

- [ ] Device registration (Owner/Manager signs in with email once)
- [ ] 6-digit PIN switcher: local PBKDF2 check, lockout (5 → 30 s doubling, 10 → disabled), auto-lock after 3 idle minutes
- [ ] Add staff at the counter (≤60 s)
- [ ] `approval_requests` API
- [ ] On-site manager PIN approval
- [ ] FCM push to the owner's phone + Approve/Deny screen (owner device logs in online-only)
- [ ] Offline approval code: the owner app shows a 2-minute code, the counter phone checks it with a Keystore key, each code works once
- [ ] Server re-checks approval codes on sync; reused/expired codes rejected

### 2.3 Taking orders

- [ ] Counter mode: big text tiles, modifier sheet only when required, optional phone ("Send receipt on WhatsApp?"), cash tendered → change (≤15 s)
- [ ] Remote order entry: source, pickup/delivery, address + zone → fee
- [ ] Inbox sorted by urgency, unpaid orders flagged hard
- [ ] Prep queue: readable from 2 m, amber/red timers, tap to advance, optional Kitchen/Drinks split
- [ ] Hold / resume / edit before prep / cancel with reason (cancelling a paid order = refund = needs approval)
- [ ] Payments: cash, paid via platform

### 2.4 Cash & stock

- [ ] Open shift with float
- [ ] Drops; payouts (auto-creates the expense; approval above GH₵50)
- [ ] Close shift: expected vs counted vs variance, own shift only
- [ ] One-tap sold-out toggle
- [ ] Morning prep counts that count down on each sale → auto sold-out at 0
- [ ] Owner summaries held in memory only, cleared when the PIN session ends

---

## Phase 3: Dashboard, reporting, receipts (Week 3: Thu 24 – Wed 30 Sep)

### 3.1 Dashboard

- [ ] App shell (Vite, TanStack Query/Table, shadcn themed hard)
- [ ] Onboarding that works in a phone browser: business → vendor type → starter template → price grid → staff & PINs → install-app QR (≤20 min)
- [ ] Menu CRUD: categories, items, variants, modifier groups, add-ons, prep time, station, cost price
- [ ] Delivery zones + fees
- [ ] Channel commissions (rate or flat; blank = shown as "Gross")
- [ ] Staff management + revenue visibility settings (per role, per person)
- [ ] Approval thresholds (defaults: refunds always, payouts > GH₵50, discounts > 10%)
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

- [ ] `GET /public/receipts/:token` + storefront `/r/[token]` page
- [ ] WhatsApp share (`wa.me` link) from the phone
- [ ] ESC/POS receipt printing end to end (58mm, 32 columns)

---

## Phase 4: Hardening → R1a live (Week 4: Thu 1 – Thu 8 Oct)

- [ ] Offline torture script: airplane mode mid-order, kill the app mid-sync, replay a batch twice, 200 queued commands
- [ ] Measure sync payloads (idle ≤5 KB, first full sync ≤500 KB) and APK size
- [ ] Performance check on a 2 GB device
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
- [ ] (If Moolre has replied) `PaymentProvider` sandbox spike: wallet creation, MoMo prompt + `TP14` OTP step, payment link, webhook → status check, internal transfer

---

## Phase 6: R1.5 Moolre payments (Weeks 6–8, gated)

**Gate (both required):**

- [ ] Moolre's written confirmation that per-vendor wallets are allowed
- [ ] Legal opinion received

**Build:**

- [ ] `settlement_accounts` with effective dates (WALLET / DIRECT / POOLED)
- [ ] Double-entry ledger + fast-check invariants
- [ ] Fee snapshots per payment (provider / platform / net, rates in bps)
- [ ] Fee-bearer setting (vendor absorbs, or a visible customer service fee)
- [ ] MoMo prompt + payment links from the phone
- [ ] Webhook receiver → store raw payload → confirm via Payment Status
- [ ] SSE + FCM for payment confirmations
- [ ] Commission sweep job (internal transfer, idempotent)
- [ ] Payout jobs
- [ ] Refunds via Transfer (vendor bears the 1% + 2%)
- [ ] Daily reconciliation → `recon_exceptions`
- [ ] KYC: Ghana Card + name check on the payout MoMo number
- [ ] Super-admin console v1
- [ ] Photo-menu import

---

## Later releases (plan in detail when we get there)

- [ ] **R2**: Storefront PWA + paid plan (prepaid 30-day MoMo passes)
- [ ] **R3**: Marketing: segments, composer, templates, promo codes, attribution, opt-outs, spend caps
- [ ] **R4**: Bolt Food API adapter (after integrator approval)

---

## R1a definition of done

- [ ] Simulated full day on a 2–3 GB Android: ≥100 orders, ≥1 hour in airplane mode
- [ ] Zero lost or duplicated orders after sync
- [ ] Median walk-in cash order ≤15 s (timed)
- [ ] Shift variance matches the physical cash count
- [ ] Day summary matches a hand tally
- [ ] Device SQLite contains no aggregate revenue data
- [ ] RLS isolation tests green (tenant B can't read tenant A)
- [ ] Staff token gets 403 on every `/reports/*` route
- [ ] Replaying a sync batch gives the same state
- [ ] Approval rules enforced, including expired and reused codes
- [ ] Sentry + heartbeat alerts fire

---

## Key rules (don't break these)

- Server is the source of truth for money; the phone never settles money.
- Money is integer pesewas (`BIGINT` / `Pesewas`). No floats, ever.
- Every tenant query goes through `withTenant()`; RLS on everything.
- Staff never receive aggregate revenue unless granted, enforced server-side and absent from device storage.
- Money, price, stock and access changes are audited in the same transaction.
- Non-cash payments go through Moolre only; direct MoMo isn't recorded.
- If a change makes order entry slower, it's the wrong change.
