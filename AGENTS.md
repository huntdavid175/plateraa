# Plateraa

An operating system for small informal Ghanaian food vendors. They take orders from walk-ins, calls, Bolt Food and Chowdeck, mostly in cash, and today they track it in a notebook. Plateraa gives them one order inbox, one record of money and a clear view of profit:

- an **offline-first Android tablet app** at the counter;
- a NestJS API;
- a web dashboard for owners and managers;
- later, a storefront.

A solo founder (GitHub `huntdavid175`) builds it with an AI agent. Work started Thu 10 Sep 2026.

## Where things stand

- **`plan.md` (repo root) is the source of truth.** It holds phases and checkboxes. Tick items as they're finished, with a short italic note on what was actually done. Where `plan.md` disagrees with the older design doc (`C:\Users\user\.claude\plans\plan-mode-prompt-you-peaceful-puppy.md`), `plan.md` wins.
- **Milestones:**
  - R1a pilot (1–2 cash-first vendors we set up) on **Thu 8 Oct 2026**;
  - R1b (5–10 vendors setting themselves up) on **Thu 22 Oct 2026**.
- **Done (11 Sep):**
  - Phase 1: monorepo, CI, schema with RLS, shared rules, auth, sync push/pull with 15 commands, OpenAPI client.
  - The §2.0/§2.0b decision changes.
  - The day-1 tablet test.
- **Phase 1 leftovers:** Sentry, the Render worker, and a Neon branch per PR.
- **Done (11 Sep, Phase 2):**
  - §2.1: the offline engine in `apps/mobile/src/offline`, tested in Node.
  - §2.2: the app shell, tablet registration, the PIN switcher, adding staff, the sync banner and the "Needs attention" screen. Tried on the tablet and working.
  - §2.3: taking orders (the counter screen, the orders list, cash, hold, edit and cancel). Tried on the tablet and working.
  - §2.4: the Drawer tab (drops, pay-ins, a blind count at close) and the Stock tab (one-tap sold out, optional portion counts). Not tried on the tablet yet. Owner summaries moved to 3.2.
  - §2.5, server side: payment links through each vendor's own Moolre account, texted by Moolre SMS, and counted only once Moolre's status check confirms them. See `apps/api/AGENTS.md`.
- **Next:** §2.5 on the tablet ("Send payment link", and each link's status on the order), then the Moolre sandbox test once the keys arrive. See `apps/mobile/AGENTS.md`.
- Founder tasks (Moolre, lawyer, printers, domain, Play Console) are Phase 0 in `plan.md`.

## Working with the user

- **Write in plain language.** Say **"tablet"**, not "phone", for the counter device: the vendor's own budget Android tablet, 8–10" landscape, often Wi-Fi only.
- **Settled decisions.** Don't re-argue them. Build them as decided:
  - Non-cash money goes only through Moolre, into **each vendor's own Moolre account**. It never passes through us. Direct MoMo can't be recorded; only cash and "paid via platform" are entered by hand. How we take our 2% ("the split") is decided later.
  - **Payment links are in the pilot** (§2.5), if Moolre API access arrives by Thu 24 Sep.
    - **Phone orders** are typed in exactly like walk-ins. The caller's number is required, and a link sent to that number is the only way they're paid.
    - **Walk-ins** pay cash or by payment link. The customer's number is needed for a link.
  - 6-digit PINs for everyone. The offline PIN check is not tied to the Android Keystore.
  - **The tablet can't refund, pay out or discount.** Managers do those on the dashboard:
    - anyone on the tablet can cancel a paid order, which then shows "refund owed";
    - refunds are paid from outside the drawer, full or partial;
    - all drawer payouts are recorded on the dashboard.
  - Out of the pilot, as future features:
    - approvals;
    - digital receipts (printed receipts only).
  - **Pay before prep** is on by default, as a per-vendor setting. The payment that clears an order moves it to Preparing automatically.
  - There are no WhatsApp or Instagram order sources; those customers use the storefront.
  - Menu setup, expenses and purchases are entered on the dashboard.
- **Confirm before destructive or outward-facing actions.**
- **Never print `.env`.** It sits in the repo root and is gitignored; the key names are in `.env.example`.
- **Commits:** short imperative subjects, committed to `main` and pushed once lint, format, typecheck and tests are green.

## Stack (pinned exact versions)

| Area      | Versions                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Toolchain | Node 24, pnpm 10.34.5, Turborepo 2.10.12, TypeScript 6.0.3 (not 7: typescript-eslint), ESLint 10, Prettier 3.9 |
| API       | NestJS 11.2, nestjs-zod 5.5 + Zod 4.6, Better Auth 1.7.4, jose 6, @node-rs/argon2                              |
| Data      | drizzle-orm 0.45.2 on Neon Postgres 18.6 (Frankfurt)                                                           |
| Tablet    | Expo SDK 57 (RN 0.86.3, React 19.2.3), op-sqlite 18.2.1                                                        |
| Web       | Vite 8 + React 19 (dashboard), Next 16.3 (storefront), Tailwind 4                                              |

## Layout

```
apps/api            NestJS API                        → apps/api/AGENTS.md
apps/mobile         Expo tablet app + Kotlin modules  → apps/mobile/AGENTS.md
apps/dashboard      Vite React (scaffold only)
apps/storefront     Next.js (scaffold only)
packages/db         Drizzle schema, migrations, RLS   → packages/db/AGENTS.md
packages/shared     money, pricing, order rules, capabilities, sync command schemas
packages/api-client generated OpenAPI types + createApiClient()
packages/ui         web components (empty so far)
```

`packages/shared/src`:

- `money.ts`: `Pesewas`, `add`, `sub`, `mul`, `bpsOf`, `splitFees`, `formatCedis`, `parseCedis`.
- `pricing.ts`: `priceOrder`.
- `order-state.ts`: `canTransition`, `nextStatus`, `canEditItems`.
- `order-payment.ts`: `amountDue`, `isAwaitingPayment`, `paymentStartsPrep`, `refundOwed`.
- `capabilities.ts`: role → capabilities (STAFF / MANAGER / OWNER).
- `sync-commands.ts`: Zod command schemas plus `COMMAND_CAPABILITY`.
- `pin.ts`, `phone.ts`, `enums.ts`, `menu-templates.ts`.

## Commands

On this Windows machine, `pnpm` works in PowerShell. **In Git Bash the global `pnpm` is broken**, so use `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm <args>` instead. Don't try to repair the user's pnpm install.

- **Setup:** `pnpm install`.
- **What CI runs** (GitHub Actions, in this order): `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` · `pnpm build`.
  - Prettier checks Markdown too.
  - Line endings are LF everywhere (`.gitattributes`).
- **Database tests are local-only.** Tests that need the database run against Neon using the root `.env`, and **skip themselves when there's no database, including in CI**. So run `pnpm test` locally before pushing any change to the API or the database.
- **Migrations:** `pnpm --filter @plateraa/db db:generate`, then `db:migrate`.
- **Deployed API:** `https://plateraa-api.onrender.com` (Render, Frankfurt, free plan), deployed automatically from `main`. The free plan has no pre-deploy step, so **run `db:migrate` from the laptop before pushing code that needs a new migration**. Render and the laptop use the same Neon database for now.
- **Payment links** only run where `RUN_PAYMENT_LINKS=true`: on Render, never on the laptop, which shares the database. They also need `SECRETS_KEY`, `MOOLRE_BASE_URL`, `MOOLRE_SMS_VASKEY` and `MOOLRE_SMS_SENDER_ID` (see `.env.example`). A vendor's own Moolre account is saved with `pnpm --filter @plateraa/api settings:moolre-account "<business>"`.
- **API client**, regenerated after API changes: `pnpm --filter @plateraa/api openapi`, then `pnpm --filter @plateraa/api-client generate`.
- **Tablet:** `pnpm --filter @plateraa/mobile start`. Native changes need a new EAS build (see `apps/mobile/AGENTS.md`). EAS CLI: `npx eas-cli@latest …` (the package is `eas-cli`, not `eas`).
- **Running the API:** `pnpm --filter @plateraa/api dev`. Swagger is at `http://localhost:3000/api/docs`.

## Key rules (don't break these)

- **Money:**
  - The server is the source of truth for money; the tablet never settles it.
  - Money is integer pesewas (`BIGINT` / `Pesewas`). No floats, and no `toFixed` maths.
- **Tenant isolation:** every tenant query goes through `withTenant()`, and RLS is on every tenant table.
- **Revenue visibility:** staff never receive aggregate revenue unless granted. This is enforced on the server, and aggregates are never stored on the device.
- **Audit:** money, price, stock and access changes are audited in the same transaction.
- **Speed:** if a change makes order entry slower, it's the wrong change.
