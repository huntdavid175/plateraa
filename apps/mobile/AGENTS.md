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

- `App.tsx` is the **day-1 test screen** (plan.md §1.2). It passed on a real tablet: 2,000 SQLite inserts in 535 ms; right PIN accepted in 295 ms, wrong refused in 230 ms; Bluetooth lists paired devices. Printing a real receipt waits for a printer.
- Next is Phase 2 (plan.md §2.1 onwards), replacing the test screen with the real app (Expo Router). Start with the offline engine: device SQLite schema + migrations, a `SqlDriver` interface (op-sqlite on the device, better-sqlite3 in tests), the outbox and the sync engine against the API via `@plateraa/api-client`.

## Rules for the tablet

- The server is the source of truth for money; the tablet never settles money. Offline totals are "provisional" and come from `priceOrder()` in `@plateraa/shared`.
- Money is integer pesewas (`Pesewas` from `@plateraa/shared`); no floats.
- Device storage never holds aggregate revenue. SQLite keeps active and today's orders only; owner summaries live in memory and are cleared when the PIN session ends.
- Every change is a sync command from `@plateraa/shared` (`sync-commands.ts`): applied locally at once, queued in the outbox, pushed in batches of ≤50. A rejected command goes to "Needs attention" and is never retried.
- Not on the tablet: refunds, drawer payouts and discounts (dashboard only); approvals and digital receipts (future). Anyone can cancel a paid order; it then shows "refund owed".
- Pay before prep is on by default: an unpaid order waits in "awaiting payment" and stays off the prep queue.
- Big text tiles, no photos. If a change makes order entry slower, it's the wrong change.
- Printer setup (Phase 2): the paired list includes headphones etc. Show likely printers first (Bluetooth class "imaging"), the rest under "Other devices"; offer to turn Bluetooth on if it's off.
