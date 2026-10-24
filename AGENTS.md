# Brixx

An operating system for small informal Ghanaian food vendors. They take orders from walk-ins, calls, Bolt Food and Chowdeck, mostly in cash, and today they track it in a notebook. Brixx gives them one order inbox, one record of money and a clear view of profit:

- an **offline-first Android tablet app** at the counter;
- a NestJS API;
- a web dashboard for owners and managers;
- an online store (the storefront) that customers order and pay from, one link per business.

A solo founder (GitHub `huntdavid175`) builds it with an AI agent. Work started Thu 10 Sep 2026.

**Renamed from Plateraa to Brixx on 23 Oct 2026.** Outside services keep the old name until they're renamed or recreated: the Render API (`plateraa-api.onrender.com`), the Vercel storefront, the R2 bucket `plateraa-photos`, the EAS project slug `plateraa` and the GitHub repo `huntdavid175/plateraa`. The Android package became `com.brixx.pos`, and the saved keys (`brixx.sqlite`, `brixx.device`, `brixx.token`, …) and the PIN token's issuer were renamed with no move-over, so everyone signs in again and the tablet is set up afresh. **What's still to do for the rebrand is in `rebrand.md` (repo root).** Tick items there as they're done, and change the names above once a service is renamed.

## Where things stand

- **`plan.md` (repo root) is the source of truth.** It holds phases and checkboxes. Tick items as they're finished, with a short italic note on what was actually done. Where `plan.md` disagrees with the older design doc (`C:\Users\user\.claude\plans\plan-mode-prompt-you-peaceful-puppy.md`), `plan.md` wins.
- **Milestones:**
  - R1a pilot (1–2 cash-first vendors we set up) on **Thu 8 Oct 2026**;
  - R1b (5–10 vendors setting themselves up) on **Thu 22 Oct 2026**.
- **Done (11 Sep):**
  - Phase 1: monorepo, CI, schema with RLS, shared rules, auth, sync push/pull with 15 commands, OpenAPI client.
  - The §2.0/§2.0b decision changes.
  - The day-1 tablet test.
- **Phase 1 leftovers:** Sentry on the tablet (at its next EAS build), the Render worker, and a Neon branch per PR. Sentry for the API and the Neon `test` branch were done on 12 Sep.
- **Done (11–12 Sep, Phase 2):**
  - §2.1: the offline engine in `apps/mobile/src/offline`, tested in Node.
  - §2.2: the app shell, tablet registration, the PIN switcher, adding staff, the sync banner and the "Needs attention" screen. Tried on the tablet and working.
  - §2.3: taking orders (the counter screen, the orders list, cash, hold, edit and cancel). Tried on the tablet and working.
  - §2.4: the Drawer tab (drops, pay-ins, a blind count at close) and the Stock tab (one-tap sold out, optional portion counts). Tried on the tablet on 13 Sep and working, as are the float prompt at the start of the day, Today's sales and the sync warnings. Owner summaries moved to 3.2.
  - §2.5: payment links through each vendor's own Moolre account, texted by Moolre SMS, and counted only once Moolre's status check confirms them. The tablet sends them and shows each link's status. A real link was paid end to end on live Moolre on 12 Sep. See `apps/api/AGENTS.md`.
  - The rest of Phase 2 (12 Sep): "not synced yet" labels, refund owed, and the restyled screens.
- **Done (13 Sep, tablet):** Dine-in / Pickup / Delivery, dark mode, Remove on each order line, the item sheet for any item with extras, and screens clear of the status bar. All tried on the tablet and working.
- **The online store (13 Sep, plan.md §4.0),** moved up to before the pilot:
  - the data and public API (`apps/api/src/storefront`), online orders on the tablet (numbered W1, W2, …, counted on the nav bar’s Orders button), and the dashboard's Online store page (its own sidebar entry since 14 Sep; it was in Settings);
  - the storefront pages to the user's Figma Make design (`apps/storefront`), live on Vercel at `https://plateraa-storefront-bvos.vercel.app`, with `STOREFRONT_URL` on Render pointing there;
  - photos: one per menu item, plus the store's cover picture and logo, kept in Cloudflare R2 (`apps/api/src/photos`);
  - nine store looks (`STOREFRONT_LOOKS` in `@brixx/shared`): the owner picks the page colour, and the top band, text and buttons follow it, in light and dark, with every look's contrast checked by a test.
  - 15 Sep: the tablet rings a chime and shows a note for each new online order, and notes each payment link texted, paid or failed (`apps/mobile/AGENTS.md`, Alerts).
  - Still open: trying the chime (needs the EAS build of 15 Sep) and Accept on the tablet, and a real order placed from a phone.
- **Phase 3.1–3.2, the dashboard** (12 Sep), built slice by slice to the user's Figma Make design. See `apps/dashboard/AGENTS.md`.
  - **Being rebuilt from 9 Oct** (user decision) with shadcn/ui and Arc (uiarc.dev) in a new look, one screen per commit; Today is now called Home. See `apps/dashboard/AGENTS.md`, Design.
  - Pages:
    - sign-in, sign-up and the 7-step onboarding;
    - Today;
    - Orders;
    - refunds, payouts and discounts;
    - Menu and the item editor, with a photo per item ("Mark sold out" on each card; Bolt Food and Chowdeck prices hidden since 13 Sep, kept on the server);
    - Staff and tablets;
    - Online store (its own page since 14 Sep);
    - Settings, including a live Moolre check, delivery zones and the Setup guide (moved out of the sidebar on 14 Sep);
    - Expenses and Stock;
    - Reports.
  - 13 Sep: delivery zones (in Settings), Today for any past day, "Pick days" on Reports, and finished days' figures kept in `daily_reports` (not pg-boss: see `apps/api/AGENTS.md`). Then the Customers pages (new capability `customers.manage`), and no more scrollbars that shift the page. Switches that save the moment they're tapped use `saveInPlace`, so they never flick back to the old value while saving (see `apps/dashboard/AGENTS.md`).
  - 13 Sep: every figure on Today and Reports opens the orders or expenses behind it (drawer closes don't yet).
  - Still open in `plan.md`:
    - raw counts on the tablet (the `stock.raw_count` command exists; no tablet screen yet);
    - deploying the dashboard, and adding its address to `TRUSTED_ORIGINS` on Render (not yet: user decision, 13 Sep);
    - 3.3 receipts (later, once the printer arrives: user decision, 13 Sep).
- **Next toward R1a** (`plan.md` Phase 4): the admin CLI v0 (list and suspend businesses, revoke a tablet, reset a PIN, export the audit log), a performance check on a 2–3 GB budget tablet, the APK size, the R1a definition of done, and moving Render to the `production` branch before installing at the first vendors.
- Founder tasks (Moolre, lawyer, printers, domain, Play Console) are Phase 0 in `plan.md`.

## Working with the user

- **Write in plain language.** Say **"tablet"**, not "phone", for the counter device: the vendor's own budget Android tablet, 8–10" landscape, often Wi-Fi only.
- **Settled decisions.** Don't re-argue them. Build them as decided:
  - Non-cash money goes only through Moolre, into **each vendor's own Moolre account**. It never passes through us. Direct MoMo can't be recorded; only cash and "paid via platform" are entered by hand. How we take our 2% ("the split") is decided later.
  - **Payment links are in the pilot** (§2.5), if Moolre API access arrives by Thu 24 Sep.
  - **Every order is Dine-in, Pickup or Delivery** (13 Sep), typed in at the counter, a phone call's too. Any order pays cash or by payment link; a link needs the customer's number, and so does a delivery. Dine-in shows only where the owner switches it on in the dashboard.
  - **The storefront comes before the pilot** (13 Sep; plan.md §4.0): customers pay online through the vendor's own Moolre account, or cash on pickup where the vendor switches it on; the owner or a manager chooses whether paid online orders go straight to the kitchen or wait for Accept; item photos from the start; the pages follow the user's Figma Make design. The paid plan stays in R2.
  - **Bolt Food and Chowdeck aren't typed in by hand** (13 Sep). Their orders come once their APIs are connected. Until then the tablet doesn't offer them, and the dashboard hides their prices and commissions (kept on the server).
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
| API       | NestJS 11.2, nestjs-zod 5.5 + Zod 4.6, Better Auth 1.7.4, jose 6, @node-rs/argon2, aws4fetch 1.0 (R2 photos)   |
| Data      | drizzle-orm 0.45.2 on Neon Postgres 18.6 (Frankfurt)                                                           |
| Tablet    | Expo SDK 57 (RN 0.86.3, React 19.2.3), op-sqlite 18.2.1                                                        |
| Web       | Vite 8 + React 19, React Router 7, TanStack Query 5 (dashboard), Next 16.3 (storefront), Tailwind 4            |

## Layout

```
apps/api            NestJS API                        → apps/api/AGENTS.md
apps/mobile         Expo tablet app + Kotlin modules  → apps/mobile/AGENTS.md
apps/dashboard      Vite React dashboard              → apps/dashboard/AGENTS.md
apps/storefront     Next.js online store              → apps/storefront/AGENTS.md
apps/landing        Next.js landing page (Brixx's own site) → apps/landing/AGENTS.md
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
- `storefront.ts`: `STOREFRONT_THEMES` and `STOREFRONT_LOOKS`, each store look's light and dark colours. In light mode every look now stands on white and shows its colour in the top band and the buttons (16 Sep); dark mode keeps the look's own dark shade. `storefront.test.ts` checks every look's contrast.
- `store-hours.ts`: the week the online store keeps — `StoreHours` (a day each, with `open`, `from`, `to`), `isOpenAt`, `nextOpening`, `opensWords` ("Opens tomorrow at 8:00 am") and `hoursWords` ("Mon–Fri 8:00 am – 8:00 pm · Sun closed"), all in the store's own timezone. A closing time earlier than the opening one runs past midnight.
- `pin.ts`, `phone.ts`, `enums.ts`, `menu-templates.ts`.

## Commands

On this Windows machine, `pnpm` works in PowerShell. **In Git Bash the global `pnpm` is broken**, so use `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm <args>` instead. Don't try to repair the user's pnpm install.

- **Setup:** `pnpm install`.
- **What CI runs** (GitHub Actions, in this order): `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` · `pnpm build`.
  - Prettier checks Markdown too.
  - Line endings are LF everywhere (`.gitattributes`).
- **Database tests are local-only.** Tests that need the database run against the Neon `test` branch (`TEST_DATABASE_URL` / `TEST_DATABASE_URL_DIRECT` in the root `.env`, brought up to the latest migration before each run), and **skip themselves when it isn't set, including in CI**. So run `pnpm test` locally before pushing any change to the API or the database.
- **Migrations:** `pnpm --filter @brixx/db db:generate`, then `db:migrate`.
- **Deployed API:** `https://plateraa-api.onrender.com` (Render, Frankfurt, free plan, service `srv-dahug3rm8hqs73deg150`). Its build command is `corepack pnpm install --frozen-lockfile --prod=false && corepack pnpm --filter "@brixx/api..." build` and its start command `corepack pnpm --filter @brixx/api start` (24 Oct: `corepack enable` started failing on Render with a read-only file system, and the old commands still named `@plateraa/api`, so every build from the rename until then failed). It deploys from `main` **only after CI passes** (auto-deploy trigger "checks pass"), so a failed CI run means no deploy. To check: `gh run list` (GitHub CLI; re-run a run that failed at startup with `gh run rerun <id>`), and Render's deploys through its API with `RENDER_API_KEY` from `.env` (`GET https://api.render.com/v1/services/<service>/deploys`, and `GET /v1/logs?ownerId=…&resource=<service>` for the logs). On the free plan a new instance is sometimes stopped before it opens its port. Render then waits out a 15-minute port scan, and on 13 Sep it marked that deploy live while running the previous build. So after a deploy that sat at `update_in_progress`, check its startup log lists the new modules (`InstanceLoader`). If it doesn't, redeploy the commit with the build cache cleared (`POST /v1/services/<service>/deploys` with `{"clearCache":"clear"}`). The free plan has no pre-deploy step, so **before pushing code that needs a new migration, run `pnpm --filter @brixx/db db:migrate`** (the `dev` branch, which Render also uses for now). Once the `production` branch is in use, run `db:migrate:production` too.
- **Deployed storefront:** `https://plateraa-storefront-bvos.vercel.app` (Vercel, set up by the user on 13 Sep through Vercel's GitHub link). Vercel builds every push to `main` itself, **without waiting for CI**, and each build shows as a GitHub deployment (`gh api repos/huntdavid175/plateraa/deployments`, then `…/deployments/<id>/statuses`). So a storefront change can be live before Render has deployed the API change it needs: keep them compatible, or push the API first. `STOREFRONT_URL` on Render is this address; it makes the dashboard's store link and QR code.
- **The landing page** (`apps/landing`, 15 Oct): Brixx's own website, with Home, Features, Who it's for (which took over About on 15 Oct; `/about` redirects there), Pricing, Contact, Privacy and Terms, built to `apps/landing/DESIGN.md`. `pnpm --filter @brixx/landing dev` on http://localhost:3002; not deployed yet. Its positioning lives in `.agents/product-marketing.md`, which the marketing skills in `.claude/skills` read.
- **The dashboard isn't deployed** (user decision, 13 Sep): it runs on the laptop against the Render API (`pnpm --filter @brixx/dashboard dev`).
- **Three Neon branches** (Frankfurt). `test` is only for the automated tests. `dev` is used by Render, the tablet, the test business and the laptop during development. `production` is untouched and kept for the pilot: before R1a it gets every migration, Render moves to it, and the pilot vendors are set up there. On the laptop, `DATABASE_URL` / `DATABASE_URL_DIRECT` are `dev`. `PRODUCTION_DATABASE_URL` / `PRODUCTION_DATABASE_URL_DIRECT` are `production` (empty until we set it up), used only by `db:migrate:production` and by setup scripts run with `--production`. Tests refuse to run on `dev` (Render's payment-link sender works there and picked up a test's link once) or on `production`.
- **Errors** from the deployed API go to Sentry (EU region; `SENTRY_DSN` on Render only). The tablet joins at its next EAS build.
- **Payment links** only run where `RUN_PAYMENT_LINKS=true`: on Render, never on the laptop, which shares the database. They also need `SECRETS_KEY`, `MOOLRE_BASE_URL`, `MOOLRE_SMS_VASKEY` and `MOOLRE_SMS_SENDER_ID` (see `.env.example`). A vendor's own Moolre account is saved with `pnpm --filter @brixx/api settings:moolre-account "<business>"`.
- **Photos** (menu items, the store's cover and logo) are kept in Cloudflare R2, bucket `plateraa-photos`, through the API. They need the `R2_*` settings (see `.env.example`) in `.env` and on Render; without them, uploads are refused and everything else works. `pnpm --filter @brixx/api photos:check` tests the keys without printing them. See `apps/api/AGENTS.md`.
- **Logo and icons:** the source is `public/images/brixx-logo.png` (the user's Brixx logo, 23 Oct: the orange B mark with "brixx" beside it, on a transparent background). `pnpm brand:assets` (`scripts/brand-assets.mjs`, with `sharp`) rebuilds every icon from it: the tablet's app icon, Android adaptive icon and splash, the dashboard's favicons and logo, and the store's and landing page's. It rebuilds rather than scales: a clean orange rounded square (the logo's measured orange, `#FE5701`) with the B lifted out and set in white. The whole logo, trimmed, is `wordmark.png` for the places the name is spelled out (the landing page's header and footer, the dashboard's sign-in pages). The B alone in orange (`apps/landing/assets/mark.png`) stands on black in the landing page's share picture (`app/opengraph-image.tsx`). `public/images/brixx-logo-glow.png` (the B glowing on black) is kept for reference but not used: its glow is stored as see-through pixels. Run the script again whenever the logo changes; the tablet then needs a new EAS build.
- **API client**, regenerated after API changes: `pnpm --filter @brixx/api openapi`, then `pnpm --filter @brixx/api-client generate`.
- **Tablet:** `pnpm --filter @brixx/mobile start`. Native changes need a new EAS build (see `apps/mobile/AGENTS.md`). EAS CLI: `npx eas-cli@latest …` (the package is `eas-cli`, not `eas`).
- **Running the API:** `pnpm --filter @brixx/api dev`. Swagger is at `http://localhost:3000/api/docs`.

## Key rules (don't break these)

- **Money:**
  - The server is the source of truth for money; the tablet never settles it.
  - Money is integer pesewas (`BIGINT` / `Pesewas`). No floats, and no `toFixed` maths.
- **Tenant isolation:** every tenant query goes through `withTenant()`, and RLS is on every tenant table.
- **Revenue visibility:** staff never receive aggregate revenue unless granted. This is enforced on the server, and aggregates are never stored on the device.
- **Audit:** money, price, stock and access changes are audited in the same transaction.
- **Speed:** if a change makes order entry slower, it's the wrong change.
