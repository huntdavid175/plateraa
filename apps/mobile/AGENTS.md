# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Tablet app (`@plateraa/mobile`)

The counter app. It runs on the vendor's own budget Android tablet (8–10", **landscape**, often Wi-Fi only, no SIM). Say "tablet", not "phone". Order entry and the prep queue sit side by side.

## Running it

- Expo SDK 57 (RN 0.86.3, React 19.2.3), New Architecture. It runs as an **EAS development build, not Expo Go**, because op-sqlite and our own Kotlin modules need native code.
- JS/TS changes: `pnpm --filter @plateraa/mobile start` (PowerShell; see the root AGENTS.md for Git Bash), then open Plateraa on the tablet on the same Wi-Fi (or `npx expo start --tunnel`). Reloads over Metro, no rebuild.
- **Native changes need a new build**: anything in `modules/`, new native dependencies, or `app.json` plugins/permissions. From `apps/mobile`: `npx eas-cli@latest build --profile development --platform android --non-interactive --no-wait`, then `npx eas-cli@latest build:view <id>` until FINISHED. The user installs the APK from the build page.
- EAS project `@huntdavid175/plateraa`; profiles in `eas.json` (development / preview = internal APK, production = AAB). Android package `com.plateraa.pos` (permanent once on Google Play). Keystore is managed by EAS.
- `pnpm --filter @plateraa/mobile typecheck`; `npx expo-doctor` from `apps/mobile` should stay 21/21.

## Native modules (local Expo modules, Kotlin, autolinked from `modules/`)

- `modules/plateraa-crypto`: `verifyPinAsync(verifier, pin): Promise<boolean>`. Checks a verifier in the server's format `pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>` with PBKDF2-HMAC-SHA256 and a constant-time compare. Offline PIN checks use this; it is deliberately not tied to the Keystore (user decision).
- `modules/escpos-bt`: `listBondedAsync()`, `connectAsync(address)` (Bluetooth Classic SPP), `writeAsync(base64)`, `disconnectAsync()`, `isConnected()`. Errors: `BLUETOOTH_UNAVAILABLE` (off or none), `BLUETOOTH_PERMISSION` (ask for `BLUETOOTH_CONNECT` at runtime on API 31+ first), `PRINTER_NOT_CONNECTED`.
- `src/printing/escpos.ts`: `Receipt` builder for 58mm printers (32 columns, ASCII only, so the cedi is written "GHS"), ending with `.finish().toBase64()`.

## Current state (11 Sep 2026)

- The real app is in place (Expo Router, `app/`), built on 11 Sep for plan.md §2.2. It runs on the tablet from EAS build `406855bd` (the first with Expo Router, `expo-secure-store` and `expo-crypto`): setup, PINs and lockout, adding staff, the idle lock and the offline banner all worked.
- The day-1 test screen (plan.md §1.2) is now `app/diagnostics.tsx`, "Tablet check", reachable from the lock screen. It passed on a real tablet: 2,000 SQLite inserts in 535 ms; right PIN accepted in 295 ms, wrong refused in 230 ms; Bluetooth lists paired devices. Printing a real receipt waits for a printer.
- §2.3, taking orders, is built (see below) and worked on the tablet on 11 Sep. It needs a menu: `pnpm --filter @plateraa/api seed:test-menu "<business name or slug>"` adds a test one.
- Next: §2.4, cash and stock (drops and pay-ins, closing the drawer, sold-out, prep counts).

## Counter (`src/counter`, plan.md §2.3)

- `actions.ts`: everything the counter does, as sync commands: `placeOrder`, `payCash`, `openDrawer`, `markPaidOnPlatform`, `advance` (one tap to the next status), `setOnHold`, `cancelOrder` and `updateItems`. Screens call these rather than `engine.record` directly.
- **Dine-in, Pickup or Delivery** (user decision, 13 Sep): every order is typed in at the counter as one of these, a phone call's too, and pays cash or by payment link. A link needs the customer's number, and so does a delivery (`checkout.ts`). Dine-in shows only where the owner switched it on (`settings.offers_dine_in`, `useOffersDineIn`); the pane then starts on Dine-in, otherwise on Pickup. There's no Phone, Bolt Food or Chowdeck entry any more: those platforms' orders come through their APIs later. `kindLabel` words an order as "Dine-in", or "Bolt · Pickup" for one from elsewhere; `markPaidOnPlatform` stays for platform orders already on a tablet.
  - **Online orders** (plan.md §4.0) arrive at the next sync, marked "Online · Pickup" or "Online · Delivery", with numbers W1, W2, …. One paid in cash when it's collected (`pay_on_collection`, local migration v7) goes to the kitchen lane before it's paid. When the store accepts first, they arrive as `NEW`, "Accept" is their first step, and the top bar shows "N online orders to accept".
  - Local migration v6 adds `offers_dine_in`, turns walk-ins into pickups (in `orders` and queued `order.create` commands), as migration 0011 did on the server, and forgets the pull cursor.
- `ticket.ts` is the order being typed in. `menu.ts` loads the menu (`needsChoice`: a size or any extras group, required or not, opens the item sheet; 13 Sep). `queue.ts` loads the orders list. `lanes.ts` sorts orders into lanes, honouring pay before prep, and gives the amber/red timers. `numbers.ts` gives order numbers (the tablet's letter plus a daily count: A1, A2, …). `hooks.ts` has `useCounter`, `useMenu`, `useQueue` and `usePayBeforePrep`.
- Screens (11 Sep redesign, following the user's Figma Make file in `assets/design/`): `app/index.tsx` holds the tabs (`TopBar`: Counter, Orders, Kitchen) and the order being typed in. Counter is `MenuPane` (chips, tiles, and a strip of Cooking and Ready orders) beside `OrderPane` (walk-in or delivery) or `RemoteOrderPanel` (phone, Bolt, Chowdeck). Tapping an order in the strip opens `QuickOrderSheet`, with its next step, so a one-tablet counter needn't leave the till. `OptionsSheet` slides in for sizes and extras; `PaymentSheet` takes cash (keypad, change) or a payment link. After a sale, `SaleDone` shows the order number and the change until the next tap; the small toast is for holds, edits and problems. `OrdersScreen` is the list and detail; `KitchenScreen` is sized to read from 2 m.
- The drawer opens at the start of the day: `DrawerSheet` asks for the float once someone who runs the drawer unlocks and none is open (`drawer.ts`). "Not now" holds for the trading day, and then `PaymentSheet` asks at the first cash sale. `amounts.ts` and `Keypad.tsx` are the cash keypad; `AmountSheet` is the one sheet for every cash amount.
- `DrawerScreen` (the Drawer tab, for anyone with `shift.operate`): open the drawer, take cash out or put it in (`moveCash`), and close it with a blind count (`closeDrawer`). `loadDrawer` reads the open drawer and the last close. A close's figures show only to whoever closed, or to someone who can see revenue (`seesDrawerResult`).
- `StockScreen` (the Stock tab, for anyone with `stock.count`): one tap per item marks it sold out for today or back on sale (`setSoldOut`).
- Payment links (plan.md §2.5): `requestLink` queues one (command `payment.request_link`, local table `payment_links`, which syncs back with the link's state). A phone order sends its link as it's saved; a walk-in does when "Payment link" is chosen. One open link per order; `QueueOrder.link` is the latest, and `linkWords` says where it stands. The server makes and texts the link (`apps/api/AGENTS.md`).
- Prep counts are optional (user decision, 11 Sep): the owner switches them on in the dashboard's settings (`count_portions`, off by default; `useCountPortions`). When on, the Stock tab's "Add portions" (`PortionsSheet`, `addPortions`) adds to today's count for items with a count record (`MenuItem.stockItemId`).
- **Bolt Food and Chowdeck prices** (12 Sep) come from the dashboard. They're in the local table `item_channel_prices` (local migration v5, which also forgets the pull cursor, so an updated tablet pulls everything once).
  - The ticket keeps menu prices.
  - `forSource()` in `ticket.ts` re-prices it for the chosen source, and it's used for every draft, for edits to a platform order, and for what `RemoteOrderPanel` shows.
  - `PLATFORM_PRICES_SQL` / `platformPricesOf()` in `menu.ts` load the prices.
- `checkout.ts` checks an order before it's saved (who must give a number, delivery details); `views.ts` sorts the Orders screen by urgency.
- **Today's sales** (`app/today.tsx`, from the More menu): the owner's day summary at the counter. The person types their PIN again; `daySummaryAtCounter` in `src/tablet/api.ts` opens a 15-minute server session (`POST /api/sessions/pin`, shared with Add staff) and fetches `GET /api/reports/day`. The server decides who may see it (`reports.revenue.view`, per role and per person; the tablet's own `resolveCapabilities` only knows roles). The figures stay in the screen's state only: never in SQLite, and cleared on lock, backgrounding, "Done" or when the session expires.

## Look (`src/ui`)

- Follow the user's design, not a new one: calm and spacious, white and warm grey (`#F6F5F3`, `#ECEAE7`), one brand colour (`#E8701A`) only for the main action and the selected tab, status colours only with a word. DM Sans for words and DM Mono for money (`font` in `theme.ts`, loaded in `app/_layout.tsx`). Money shows as `cedis()`: "GH₵ 35.00".
- Building blocks: `Button` (56 dp, or 44 for secondary rows), `Field` / `PhoneField` (+233), and in `controls.tsx` `Segmented`, `Chip`, `OptionTile`, `Badge` and `Stepper`; `Overlay` / `CloseButton` in `Sheet.tsx`. Touch targets stay at least 44 dp; secondary text uses `muted` (`faint` fails contrast, so it's for placeholders only).
- **Dark mode** (user request, 13 Sep): More → Dark mode / Light mode, remembered on the tablet (`src/ui/appearance.ts`, in `expo-secure-store`, read before the first frame). `theme.ts` has a light and a warm dark palette with the same roles (`Palette`), matching the dashboard's dark mode.
  - Build styles with `themedStyles(() => ({ … }))` and colour tables with `themed(() => ({ … }))`: both are made once per scheme. Read `colors` only while drawing or inside those, never into a plain module-level constant, which would keep the look the app started with. No hard-coded colours: add a role to both palettes.
  - Switching draws the screens afresh (`<Screens key={scheme}>` in `app/_layout.tsx`), so an order half typed in is cleared; the tablet stays unlocked and keeps syncing.
- Every screen uses this look. The lock screen (and `PinPad`), setup, add staff, "Needs attention", the sync banner and Tablet check were brought in line on 12 Sep, and the old colour names and `radius` are gone from `theme.ts`.
- The Figma design's WhatsApp/Instagram sources, "Save as unpaid" and receipts are left out on purpose: see the settled decisions in the root AGENTS.md.
- The design file is `assets/design/Design Plateraa POS Screen.make`. The UI guideline skill used for the redesign is `.claude/skills/airbnb-ui` (installed as-is, so Prettier skips it).

## App (`app/`, `src/tablet`, `src/ui`)

- `app/_layout.tsx` picks the screens from the tablet's state with `Stack.Protected`: `register` (not set up yet), then `lock` (the PIN switcher), then `index` (the main counter screen), plus `attention`, `add-staff` and `diagnostics`. Expo Router moves between them by itself when the state changes; don't navigate by hand for that.
- **Edge to edge** (13 Sep): Android draws the app under the tablet's status bar (time, battery, Wi-Fi) and navigation bar. `app/_layout.tsx` pads every screen by the safe-area insets (`react-native-safe-area-context`). A full-screen `Modal` (`Overlay` in `Sheet.tsx`, `SaleDone`, the More menu) is `statusBarTranslucent` and `navigationBarTranslucent`, so its dimming covers the bars, and pads its own content with `useSafeAreaInsets()`. Do the same for any new one.
- `src/tablet/TabletProvider.tsx`: the one database (`localDatabase()`), the registered tablet's credentials and sync engine, and who is unlocked. Screens read the database with `useLocalQuery(sql)`, which reads again whenever the data changes, and the engine's state with `useEngineState()`.
- `src/tablet/credentials.ts`: the device token and tablet details, in `expo-secure-store`. The owner's email login is signed out once setup is done.
- `src/tablet/pin-guard.ts`: the offline PIN check and lockout, counted in the `pin_attempts` table. `src/tablet/IdleLock.tsx` locks the tablet after the business's idle time.
- `src/tablet/api.ts`: the calls outside the sync engine: email sign-in and registration, setting the owner's PIN, and adding staff (online, confirmed with the manager's PIN).
- `src/tablet/ids.ts`: ULIDs whose random part comes from `expo-crypto`. Anything that creates rows uses `newId`.
- `src/config.ts`: the API address. It's the deployed API unless `EXPO_PUBLIC_API_URL` is set in `apps/mobile/.env` (e.g. `http://<laptop IP>:3000` to try against the laptop).
- `src/ui/`: the theme (big text, strong contrast), `Button`, `Field`, `PinPad`, `SyncBanner` and `Header`.

## Offline engine (`src/offline`)

- `schema.ts`: the local tables, mirroring what `GET /sync/pull` sends (never cost prices), plus `outbox`, `row_locks`, `shadows` and `meta`. `MIGRATIONS` are frozen: add an entry, never edit one that has shipped.
- `sql.ts`: `SqlDriver` (runs one statement) and `Database` (one statement at a time, `transaction()`). Inside a transaction use only `tx`, or it waits forever. `op-sqlite.ts` is the tablet's driver; `testing/node-sqlite.ts` is Node's built-in SQLite for tests.
- `commands.ts`: each sync command applied locally, mirroring `apps/api/src/sync/handlers`. **When a server handler changes, change its twin here.** It throws `LocalRejection` for what the server would refuse, so nothing is saved.
- `store.ts`: the first time an unconfirmed command touches a row, the row is locked and the server's version kept as its shadow; pulled updates to a locked row go into the shadow. Once the command is confirmed and pulled back, the shadow replaces the row. If it's refused, every shadow is restored and the waiting commands applied again (`rebuild`). `provisionalSql()` tells a screen which rows are still provisional.
- `engine.ts`: `SyncEngine`: `record(type, payload, staffId)`, `syncNow()`, `start()` / `stop()` / `setForeground()`, `needsAttention()` / `dismiss()`, and `subscribe()` (screens use `useEngineState()` from `src/tablet/TabletProvider.tsx`). Each cycle pushes (≤50 at a time, in order) and then pulls; cycles never overlap.
- `transport.ts`: `httpTransport(createApiClient(…))`. Failures are offline, server, unauthorized (the tablet was signed out) or invalid.
  - Every push and pull carries an `OutboxReport` (how many changes wait, and the oldest one's time) as the `x-outbox-pending` / `x-outbox-oldest` headers, so the dashboard can warn when a tablet stops keeping up. The engine keeps the oldest waiting change in `SyncState.oldestPendingAt`, and `SyncBanner` warns, even on the counter, once changes have waited 30 minutes.
- Tests: `pnpm --filter @plateraa/mobile test` (Vitest in Node, against a fake server). App code must not use Node APIs: `tsconfig.json` leaves tests out, and `tsconfig.test.json` typechecks them with Node's types.
- **Offline stress run** (plan.md Phase 4): `pnpm --filter @plateraa/mobile stress` (PowerShell). Run it before a release and after any change to the engine, `store.ts`, `commands.ts` or the server's sync handlers. It takes about 13 minutes: the scenarios run side by side, but the API runs on the laptop, so every query crosses to Frankfurt (about 2 s per change; on Render it's milliseconds). Its HTTP timeout is 5 minutes for that reason; the tablet keeps its 20 s.
  - **What runs:** the real `SyncEngine`, with SQLite in a temp file, against the real API on the Neon `test` branch. `testing/stress-server.ts` compiles `shared`, `db`, `api-client` and `api` with `tsc`, migrates the branch, starts the API from `apps/api/dist` on a local port, and sets up one business per scenario (removed afterwards). It skips when `TEST_DATABASE_URL` isn't set.
  - **The trouble** (`testing/stress-tablet.ts`): `FlakyNetwork` wraps the real transport with airplane mode, answers lost after the server saved the upload, uploads arriving twice, and random trouble from a seeded source. `Till` sells the way the counter does (`counter/actions.ts`) and keeps a hand tally.
  - **The scenarios** (`offline/sync.stress.ts`): a day of `STRESS_ORDERS` (100) orders with the middle third offline; lost answers; the app killed mid-sync and again before syncing; every upload doubled, then the whole day sent again; 200 changes queued offline; random trouble with two restarts (`STRESS_SEED` repeats a run).
  - **Each must end in step:** nothing waiting or refused, every order on the server once and as the counter left it, the tablet showing what the server has, the day summary matching the hand tally, and the drawer's difference zero.
- Metro loads `@plateraa/shared` and `@plateraa/api-client` from their `dist`: after changing them, run `pnpm --filter "@plateraa/mobile^..." build` before `start`. EAS does the same through the `eas-build-post-install` script, which ran without error on build `406855bd`.

## Rules for the tablet

- The server is the source of truth for money; the tablet never settles money. Offline totals are "provisional" and come from `priceOrder()` in `@plateraa/shared`.
- Money is integer pesewas (`Pesewas` from `@plateraa/shared`); no floats.
- Device storage never holds aggregate revenue. SQLite keeps active and today's orders only; owner summaries live in memory and are cleared when the PIN session ends.
- Every change is a sync command from `@plateraa/shared` (`sync-commands.ts`): applied locally at once, queued in the outbox, pushed in batches of ≤50. A rejected command goes to "Needs attention" and is never retried.
- Not on the tablet: refunds, drawer payouts and discounts (dashboard only); approvals and digital receipts (future). Anyone can cancel a paid order; it then shows "refund owed".
- Pay before prep is on by default: an unpaid order waits in "awaiting payment" and stays off the prep queue.
- Big text tiles, no photos. If a change makes order entry slower, it's the wrong change.
- Printer setup (Phase 2): the paired list includes headphones etc. Show likely printers first (Bluetooth class "imaging"), the rest under "Other devices"; offer to turn Bluetooth on if it's off.
