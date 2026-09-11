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
- How orders are paid: a walk-in pays cash or by payment link; a phone order needs the caller's number and is paid by link only; Bolt and Chowdeck orders are marked "paid on the platform". Links don't go out until §2.5.
- `ticket.ts` is the order being typed in. `menu.ts` loads the menu (`needsChoice`: a size or a required extra opens the item sheet). `queue.ts` loads the orders list. `lanes.ts` sorts orders into lanes, honouring pay before prep, and gives the amber/red timers. `numbers.ts` gives order numbers (the tablet's letter plus a daily count: A1, A2, …). `hooks.ts` has `useCounter`, `useMenu`, `useQueue` and `usePayBeforePrep`.
- Screens (11 Sep redesign, following the user's Figma Make file in `assets/design/`): `app/index.tsx` holds the tabs (`TopBar`: Counter, Orders, Kitchen) and the order being typed in. Counter is `MenuPane` (chips, tiles, and a strip of Cooking and Ready orders) beside `OrderPane` (walk-in or delivery) or `RemoteOrderPanel` (phone, Bolt, Chowdeck). Tapping an order in the strip opens `QuickOrderSheet`, with its next step, so a one-tablet counter needn't leave the till. `OptionsSheet` slides in for sizes and extras; `PaymentSheet` takes cash (keypad, change) or a payment link. After a sale, `SaleDone` shows the order number and the change until the next tap; the small toast is for holds, edits and problems. `OrdersScreen` is the list and detail; `KitchenScreen` is sized to read from 2 m.
- The drawer opens at the start of the day: `DrawerSheet` asks for the float once someone who runs the drawer unlocks and none is open (`drawer.ts`). "Not now" holds for the trading day, and then `PaymentSheet` asks at the first cash sale. `amounts.ts` and `Keypad.tsx` are the cash keypad; `AmountSheet` is the one sheet for every cash amount.
- `DrawerScreen` (the Drawer tab, for anyone with `shift.operate`): open the drawer, take cash out or put it in (`moveCash`), and close it with a blind count (`closeDrawer`). `loadDrawer` reads the open drawer and the last close. A close's figures show only to whoever closed, or to someone who can see revenue (`seesDrawerResult`).
- `StockScreen` (the Stock tab, for anyone with `stock.count`): one tap per item marks it sold out for today or back on sale (`setSoldOut`).
- Prep counts are optional (user decision, 11 Sep): the owner switches them on in the dashboard's settings (`count_portions`, off by default; `useCountPortions`). When on, the Stock tab's "Add portions" (`PortionsSheet`, `addPortions`) adds to today's count for items with a count record (`MenuItem.stockItemId`).
- `checkout.ts` checks an order before it's saved (who must give a number, delivery details); `views.ts` sorts the Orders screen by urgency.

## Look (`src/ui`)

- Follow the user's design, not a new one: calm and spacious, white and warm grey (`#F6F5F3`, `#ECEAE7`), one brand colour (`#E8701A`) only for the main action and the selected tab, status colours only with a word. DM Sans for words and DM Mono for money (`font` in `theme.ts`, loaded in `app/_layout.tsx`). Money shows as `cedis()`: "GH₵ 35.00".
- Building blocks: `Button` (56 dp, or 44 for secondary rows), `Field` / `PhoneField` (+233), and in `controls.tsx` `Segmented`, `Chip`, `OptionTile`, `Badge` and `Stepper`; `Overlay` / `CloseButton` in `Sheet.tsx`. Touch targets stay at least 44 dp; secondary text uses `muted` (`faint` fails contrast, so it's for placeholders only).
- The Figma design's WhatsApp/Instagram sources, "Save as unpaid" and receipts are left out on purpose: see the settled decisions in the root AGENTS.md.
- The design file is `assets/design/Design Plateraa POS Screen.make`. The UI guideline skill used for the redesign is `.claude/skills/airbnb-ui` (installed as-is, so Prettier skips it).

## App (`app/`, `src/tablet`, `src/ui`)

- `app/_layout.tsx` picks the screens from the tablet's state with `Stack.Protected`: `register` (not set up yet), then `lock` (the PIN switcher), then `index` (the main counter screen), plus `attention`, `add-staff` and `diagnostics`. Expo Router moves between them by itself when the state changes; don't navigate by hand for that.
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
- Tests: `pnpm --filter @plateraa/mobile test` (Vitest in Node, against a fake server). App code must not use Node APIs: `tsconfig.json` leaves tests out, and `tsconfig.test.json` typechecks them with Node's types.
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
