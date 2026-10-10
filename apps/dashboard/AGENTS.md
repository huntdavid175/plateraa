# Dashboard (`@plateraa/dashboard`)

The web dashboard for owners and managers (plan.md §3.1). It uses:

- Vite 8 and React 19;
- React Router 7: not 8, which needs React 19.2.7, while the repo pins 19.2.3 to match Expo;
- TanStack Query 5;
- Tailwind 4;
- Arc's SVG charts (recharts was removed on 9 Oct).

## Design

- **The rework (from 9 Oct, user decision).** The whole UI is being rebuilt, one screen per commit, with **shadcn/ui** (Radix base; `components.json`, components in `src/components/ui`, ours to edit) and **Arc** (uiarc.dev; free items in `src/components/arc`, installed as-is with `npx shadcn@latest add @uiarc/<id>`, left out of lint and Prettier). Use the project skills `shadcn`, `arc`, `frontend-design` and `emil-design-eng`, and the `arc` MCP server (`.mcp.json`) to find Arc items. Take an Arc item where one fits the job, a shadcn one otherwise. Arc's paid Pro items aren't available.
  - The look is the plan the user approved on 9 Oct: a clean ledger. The day's money is the one big thing; everything else stays quiet.
  - Order: 1 shell ✓, 2 sign-in ✓, 3 Home ✓, 4 Orders ✓, 5 Customers ✓, 6 Menu ✓, 7 Stock ✓, 8 Online store ✓, 9 Expenses / Refunds / money dialogs ✓, 10 Reports ✓, 11 Staff ✓, 12 Settings ✓, 13 onboarding ✓ (all rebuilt 9 Oct). The old screens' colour names (`bg-tile`, `bg-brand`, …) still map in `index.css`, for anything that uses them.
  - **Buttons are Arc's** (`components/arc/button`): the main one is ink (near-black; near-white in dark mode), one per screen, with `variant="secondary"` or `"ghost"` on the rest. Orange marks what's active or selected and links (`text-accent-strong`). Fields are Arc's `Input` and `PasswordField`; a form's error is Arc's `Alert tone="danger"` under it. Arc's password strength isn't used: its rules (12 characters, mixed case, a symbol) aren't the server's (8 characters).
  - **Shared pieces** in `components/app`: `SettingRow` and `SwitchRow` (a setting in a panel: name and what it does on the left, its control on the right), `Panel` (a titled bordered region; its rows in `PanelRows`, its heading link `PanelLink`) and `StatusBadge` (Paid, Unpaid, Refund owed… on Arc's badge). Loading is shadcn's `Skeleton` in the final layout; empty is Arc's `EmptyState`; errors are Arc's `Alert`.
  - **Bento grids** (second pass, 9 Oct, user request: "use bento grids and the Arc components that fit"): `Bento` and `Tile` in `components/app/bento.tsx`. Four columns on a laptop and two below, so small tiles pair up on a phone; a tile takes more room with `col-span-2`, `lg:col-span-3`, `lg:row-span-2`. A tile is never itself a link (charts inside stay usable): its arrow at the top right opens what's behind it. `Cedis` shows pesewas through Arc's `AnimatedCounter`; only the screen's one big figure rolls up on view. Arc's counter sizes and colours itself from tokens, so the tile sets `--text-3xl` and `--foreground` on its wrapper rather than restyling Arc.
  - **Arc's charts** replaced recharts (removed with `react-is` on 9 Oct, with `pages/OrdersByHourChart.tsx`): `BarChart` (by hour), `DonutChart` (shares; whole cedis, `wholeCedis`, so the centre fits), `Sparkline` (a figure's trend over a report's days), `Gauge` (share of an order paid), `LineChart`, `ActivityHeatmap` (Reports over 4 weeks or more, a customer's 12 weeks). The feed of the latest orders is Arc's `Timeline` (Ghana's zone, `Africa/Accra`).
  - **Money on its own** (a refund, payout, discount, expense, delivery fee) is `CediInput` (`components/app/money-field.tsx`): Arc's `MoneyInput`, set to `currency="GHS"` (without it Arc shows dollars), giving pesewas directly, with quick-add chips. Rows of prices keep `MoneyField`. Removing something is Arc's `ConfirmMorph` (asks in place); a menu item still asks in a dialog. The Orders list opens an order in Arc's `Drawer` (`?order=`, `OrderView` from `OrderPage.tsx`); opening hours are edited in a drawer with Arc's `TimePicker`. Settings is Arc's `Tabs`, the tab in `?tab=`. Customers' names and notes are Arc's `InlineEdit`. `/__preview/fields` (dev only, `dev/FieldsPreview.tsx`) shows fields that otherwise live inside dialogs.
  - Arc Pro (paid) isn't available, so its bento, KPI drill-down and settings blocks aren't used; the grids are built from free Arc parts. Arc's `PhoneInput` doesn't know Ghana (49 countries, no GH), so phone numbers are a plain `Input` that the server normalises.
  - **The preview** (`src/dev/Preview.tsx`): with `pnpm dev`, `/__preview` shows rebuilt screens inside the real frame with made-up sample data, without signing in. It never touches the saved login, and the built app leaves it out. Screens are checked by screenshotting it with headless Chrome: `chrome --headless=new --window-size=1440,1500 --screenshot=<file> http://localhost:5173/__preview`, adding `--blink-settings=preferredColorScheme=0` for dark or `=1` for light; 500 px wide for a phone, as Chrome won't go narrower. Add each rebuilt screen's route and sample data there.
  - The old Figma Make design (`design/dashboard_design.make`) is no longer the guide. Its wording rules still hold: real order numbers; stations are Kitchen and Drinks only; a PIN is never shown; "Moolre account", not "MoMo account"; "sold out" means it can't be ordered until tomorrow.
  - **Today is called Home** (9 Oct, user request): the sidebar, the phone bar, the page title and back links. The address stays `/`.
- **Colours** come from one place: Arc's token names (`--background`, `--surface`, `--surface-muted`, `--foreground`, `--text-secondary`, `--text-muted`, `--border`, `--accent`, `--success`, `--warning`, `--danger`), set to Plateraa's palette in `src/theme.css`, light and dark.
  - `src/index.css` points shadcn's Tailwind names at them (`bg-background`, `bg-card`, `bg-primary`, `text-muted-foreground`, `bg-sidebar`, …), plus ours (`text-accent-strong`, `bg-accent-subtle`, `text-success`, `text-danger`, `text-info`), plus the old screens' names (`bg-surface`, `bg-tile`, `bg-brand`, `bg-green-bg text-green`, …) until they're rebuilt.
  - shadcn's `accent` (Tailwind `bg-accent`) is the grey behind a hovered item; Arc's `--accent` (the variable) is the brand orange. Tailwind `primary` is the brand orange.
  - The accent is `#D44000`, deepened from the logo's `#FC5102` so white text on it reads (4.6:1); the logo keeps `#FC5102` (`bg-brand-mark`). In dark mode the accent is a lighter orange carrying dark text.
  - Never hex values in a screen, so dark mode keeps working.
  - Dark mode: `lib/theme.ts` sets both the `dark` class (Tailwind) and `data-theme="dark"` (Arc) on `<html>`. The choice is Light, Dark or System (the device's setting), from the account menu, remembered per browser.
- **Fonts:** Inter for text, Geist for headings (`font-heading`) and figures. Weights 400 and 500 only. `font-mono` is now Geist with even-width digits (`tabular-nums`), for money and order numbers.
- **The shell** (`shell/Shell.tsx`): shadcn's `Sidebar` (folds to icons; `Ctrl+B` or the edge rail), in four groups (Home · Orders · Customers / Menu · Stock · Online store / Expenses · Refunds · Reports / Staff · Settings), with Arc's `UserMenu` at its foot (theme, switching business, sign out). On a phone: a header with the business and the account, a bottom bar with the first four pages the person may open, and More, which opens the rest in Arc's `BottomSheet`. The window scrolls, not an inner box. The open page is marked Arc's way, not in orange (10 Oct, user request): a grey fill (`bg-sidebar-accent`, Arc's `--surface-muted`) with ink text, which glides to the next page on Arc's `morph` spring (a `motion.span` with `layoutId="sidebar-selected"`; it jumps instead when someone has reduced motion on). The phone's bottom bar and More sheet match: ink text for the open tab, a grey fill in More. The dev preview (`/__preview/...`) never lights a sidebar entry, because the links point at the real addresses.
- **A dialog holds the page still** behind it (16 Sep, user request: an iPhone ignores a page that's only hidden). Arc's `Dialog` and `BottomSheet` are Radix dialogs, which fix the page themselves (react-remove-scroll, which also stops touch scrolling on an iPhone), so nothing else is needed; the hand-made `useLockScroll` was removed on 9 Oct once nothing used it (the storefront keeps its own copy). Not yet tried on an iPhone. Anything new that covers the page is an Arc dialog or sheet.
- **Dialogs** in rebuilt screens: Arc's `<Dialog open onOpenChange><DialogContent title description>…</DialogContent></Dialog>`, the form inside with Cancel (`ghost`) and the main button at the bottom right, and a failed save as an `Alert` above them.
- **Toasts** (16 Sep, user request): `toast.ok('Saved')` / `toast.problem(…)` from `ui/Toast.tsx`, drawn by Arc's `ToastStack` since 10 Oct (user request): bottom-right (bottom-centre on a phone), 360px wide, a success for 4 s and a problem longer; three show at once, older ones tucked behind and fanned out on hover; a swipe or the close button dismisses, and timers pause while someone reads. A problem shows "Something went wrong" with the reason underneath. `toast` is called from outside React, so `ui/Toast.tsx` hands each note to Arc's hook through a small bridge. They're wired once in `lib/query.ts`: **every mutation that fails says why by itself**, and one that works says so when it carries `meta: { ok: 'Expense added' }`. A form that already prints its own error underneath (sign-in, sign-up) sets `meta: { quiet: true }` so it isn't said twice.
- **Alert colours** (16 Sep, after the user reported they were hard to read): the status inks (`--green`, `--amber`, `--red`, `--blue`) and `--muted` in `index.css` were strengthened. Every one now clears **6.2:1** on the page, a card and its own tint in light mode, and 7.3:1 in dark (the old light values were 4.45–5.9). Check a new value against the page, a card (`--surface`), a tile and its tint before changing it.
- **A time of day** (`TimeInput` on the Online store page) is an **uncontrolled** `<input type="time">`: a time field reports an empty value while it's half typed, and feeding that back wipes what's being typed, so the hour can never be finished (user report, 16 Sep). It starts from what's saved and is remounted by a `key` when something other than the keyboard changes it.
- **The Plateraa logo** (15 Sep) is `public/logo.png`, a plain `<img>` wherever the brand mark goes: sign-in, sign-up and choosing a business (`Centered` in `ui/Page.tsx`), the sidebar and the phone header (`shell/Shell.tsx`). It replaced the orange square with a typed "P". The tab and home-screen icons are `public/favicon.ico`, `public/icon-192.png` and `public/apple-touch-icon.png`, linked from `index.html`. All of them are made by `pnpm brand:assets` from `public/images/logo.png` at the repo root, so don't edit them by hand. A vendor's own logo is a different thing (`logoUrl`, uploaded on the Online store page).
- **Plain words.** Every screen works at phone width: the sidebar shows from `md` up; below that there's a bottom bar plus "More".
- **Scrollbars** (`src/index.css`): nothing may show a bar on hover, since it takes width and shifts the page. `no-scrollbar` for the sidebar and rows of pills (they still scroll), `page-scroll` for a page's own scrolling (thin, with its room always kept), `thin-scrollbar` for dialogs.

## Layout

- `lib/api.ts`:
  - the typed client from `@plateraa/api-client`, which sends the bearer token and `x-tenant-id`;
  - `call()` returns the data, or throws an `ApiError` worded for the screen;
  - `signIn()` / `signOut()`: Better Auth; the token comes from the `set-auth-token` header, which CORS exposes;
  - any 401 signs the person out.
- `lib/session.ts`: the token and the chosen business, in localStorage.
- `lib/query.ts`: the QueryClient and shared queries (`useBusinesses`, `useContextQuery`), plus `useSlow` for the "Plateraa is waking up" hint while Render's free plan starts.
- `shell/Shell.tsx`: the signed-in frame.
  - It loads `GET /api/me/context`: name, role, permissions and business.
  - It hides navigation the person can't use.
  - Screens read that context with `useMe()`.
- Components: `components/ui` (shadcn, ours to edit), `components/arc` (Arc, as installed), `components/app` (ours: Panel, PanelRows, PanelLine, PanelLink, PanelEmpty, SettingRow, SwitchRow, StatusBadge, OrderListRow, MoneyField, PlainField, DayPicker, DateField, ScreenLoading). `ui/` keeps `Page.tsx` (Page and Centered, the frames of a screen), `PhotoPicker.tsx` and `Toast.tsx`; the old hand-made controls were removed on 9 Oct.
- `lib/orders.ts`, `lib/reports.ts`: fetchers, with row types taken from the generated client, and `paymentState()` (Paid / Unpaid / Refund owed / Cancelled).
- `lib/money.ts`: `cedis()`, `longDate()`, `hourLabel()`. `lib/words.ts`: plain words for enums.
- `router.tsx` holds the routes; `pages/` holds the screens.
  - Home (`HomePage`; it was Today until 9 Oct) is kept **clean: one chart only** (10 Oct, user request: "too many charts"). What needs someone first (refunds owed, tablet warnings, as Arc alerts, shown only when there are some); then a bento: money in as the one big figure with a single bar splitting it into cash and mobile money (`byMethod` CASH and LINK; paying online is LINK), and plain-number tiles for orders, profit, not yet collected ("93% of the day's takings is in") and money out; then orders by hour (Arc's bar chart) beside the latest orders (Arc's timeline); open drawers. Trends, donuts and gauges belong in Reports, not on Home. Arc's date picker (`DayPicker`, `DateField` in `components/app/day-picker.tsx`; a field is 320px wide, as wide as the calendar Arc opens from its left edge, or the calendar runs off a laptop screen: user report, 10 Oct) opens any past day (`/?date=`), without the open drawers; today itself is left to the server's trading day.
    - Tablet warnings (`devices.manage`): the `alerts` from `GET /api/devices`, checked every minute, worded by `lib/tablet-alerts.ts`. The Staff page's Tablets card shows the same, with each tablet's last finished sync.
  - Orders (`OrdersPage`): a day's orders (`?date=`) or a range's (`?from=&to=`), filtered by dine-in, pickup or delivery and by paid or not (two Arc segmented controls, one tap each), and by `source`, `method`, `item` or `staff` when a figure links there (removable chips in Arc's `FilterToolbar`). The list is plain rows in one bordered surface, with column headings from `md` up; Arc's sortable table isn't used, as its rows can't be links and a busy day's 500 would each animate when re-sorted. The order page (`OrderPage`, rebuilt 9 Oct) is panels (items, payment, customer and notes, history) under Arc alerts for a refund owed (its "Record refund given" is the screen's one main button), what's worth a look and why it was cancelled. Everything lives in the address, so a view can be shared; the server does the filtering. Totals show only with `reports.revenue.view`.
  - **Every figure links to its rows**: Home's and Reports' figures open these Orders and Expenses views for their days (`linksFor` in `ReportsPage`).
  - Order (`OrderPage`): one order in full. Links to it pass `state: { back, label }`, so "←" returns to where the person came from. It links to the order's customer.
  - Customers (`CustomersPage`, search in `?q=`) and one customer (`CustomerPage`): their orders, first and last order, what they spent (with `reports.revenue.view`), and name and notes to edit (`customers.manage`). `lib/customers.ts`.
  - Menu (`MenuPage`, rebuilt 9 Oct): categories as an Arc segmented control with counts, item cards with their photo, and one-tap sold out (a button with a verb, "Mark sold out" / "Back in stock", never a bare switch).
  - `ItemEditorPage` (`/menu/items/new`, `/menu/items/:itemId`): a full-screen editor (Close, the title and Save in a bar) of Arc fields in panels. Money is `MoneyField` (`components/app/money-field.tsx`, drawn like Arc's input with the cedi sign inside); rows of sizes and options use `PlainField`, with labels shown on the first row only. Radix's select can't hold an empty value, so "No category" is `__none__` in the select. Removing an item asks in an Arc dialog.
    - It keeps a text form (`ItemForm`) and turns it into the API's item with `toInput()`, which also finds the first thing to fix.
    - A new item, size, group or option gets its `ulid()` in the browser.
    - A saved item has a photo (`ui/PhotoPicker`), saved on its own, apart from Save.
  - **Photos** (`lib/photos.ts`): the browser shrinks each picture on a canvas (WebP, or JPEG where the browser can't make WebP; 800 px for items, 1600 px for the cover, 400 px for the logo) and sends it as the request body with a plain `fetch`, since the typed client only sends JSON.
  - Online store (`OnlineStorePage`, `/store`, plan.md §4.0): its own sidebar entry since 14 Sep (user request; it was in Settings), for anyone with `storefront.manage` (the owner and managers; `lib/storefront.ts`). "Your store": on or off, its link with Copy and a QR code (`qrcode-generator`, downloadable), taking orders now. "Online orders": cash when they collect, accept first. "Look": the page colour (`STOREFRONT_LOOKS`, each shown as a tiny store page: its page colour, band, card and button), the cover picture and logo. "Opening hours" (16 Sep, user request): a row per day with a switch for whether they work that day and the times it opens and closes, the week in words underneath as customers will read it, and "Use the same times every day"; times save together when Save appears, unlike the switches. "On your store's page": area and phone. It says when Moolre isn't connected or there are no delivery zones yet, linking to Settings, where both stay.
  - Refunds (`RefundsPage`): orders owed money back, each with "Record refund given".
  - `money-dialogs.tsx`: the dialogs for recording a refund, applying a discount (previewed with `priceOrder`, as the server prices it) and recording a payout.
    - Each dialog makes its id with `ulid()` when it opens, so pressing Save again after a lost reply records it once.
    - `refreshMoney()` reloads everything that shows money.
    - The refund and discount dialogs open from the order page; payouts open from the "Open drawers" card on Home.
  - Sign-up and onboarding (`auth/SignUpPage`, `auth/SetupPage`, loaded lazily at `/setup`):
    - the design's 7 steps, sized for a phone;
    - the business is created at step 2;
    - the starter menu is saved in one call (`lib/onboarding.ts` turns a template and its prices into it);
    - PINs are never shown back;
    - Moolre uses the Settings check.
    - Settings → Setup guide (owners) reopens it at the menu step; closing or finishing it goes back to Settings (the link passes `state: { back }`).
  - Staff (`StaffPage`):
    - the team, with Add and Edit dialogs (PINs typed twice and checked with `pinProblem`, never shown);
    - the owner's "Who sees sales totals" switches;
    - the Tablets card, with sign out.
  - Reports (`ReportsPage`, needs `reports.revenue.view`): the last 7 days, this month, last month, or "Pick days" (up to 92), kept in the address (`?range=pick&from=&to=`). It shows:
    - totals and a profit-and-loss;
    - busy hours: the orders taken in each hour, added up over the days;
    - day by day, where each day opens its orders;
    - by source and by payment method;
    - best sellers and expenses by kind;
    - staff, and drawer closes with their variances.
  - Expenses (`ExpensesPage`): spending by range, with a total, and "Add expense", which can be a stock purchase. The range (`?range=`, or `pick` with `from`/`to`), a `category` and `kind` (`purchase` or `other`) live in the address.
  - Stock (`StockPage`): key ingredients with a "running low" banner, and Count / Edit dialogs. `lib/expenses.ts` serves both pages.
  - Settings (`SettingsPage`):
    - Business (name, type);
    - Appearance (dark mode);
    - Orders (dine-in, pay before prep, portion counts, idle lock), where toggles save at once. **Anything that saves the moment it's tapped uses `saveInPlace`** (`lib/save-in-place.ts`, spread into `useMutation` with the reload as `onSettled`): the new value goes into the loaded data at once and back if saving fails, so a switch never flicks back to its old value while it saves (user report, 13 Sep). Used by these switches, Online store, "Who sees sales totals" and the Menu page's "Mark sold out";
    - Delivery zones, for anyone with `catalog.manage` (managers too): add, change, switch off the tablet, remove (`lib/zones.ts`).
    - Payments (the Moolre account, with "Check and save").
    - Setup guide (owners): reopens the onboarding at the menu step.
  - **Bolt Food and Chowdeck are hidden** (user decision, 13 Sep) until their APIs connect: no commissions in Settings, and no platform prices in the item editor, whose "Cost and margin" section now shows only with `reports.revenue.view`. The editor still sends the prices it loaded, so none are lost.
  - **Dine-in, pickup and delivery** replace "where the order came from": Home's "By order type" rows, Reports' "Dine-in, pickup and delivery" box and the Orders filter (`?type=`), with Dine-in only where the owner offers it (`me.offersDineIn`). Orders are worded by `kindWords` ("Dine-in", or "Bolt · Pickup" for one from elsewhere); `?source=` still works as a removable chip.
    - Managers see Appearance, the business name and Delivery zones.
  - The rest are placeholders until their slices.
- **Keep the first screen light on mobile data.** Every screen but sign-in and Home loads when it's first opened (`lazy` routes in `router.tsx`, 9 Oct: the first load went from 980 KB to 347 KB, 108 KB compressed). The charts are Arc's own SVG components (no chart library since recharts was removed on 9 Oct). Helpers a page needs, like `busiestHour`, live in `lib/`.

## Rules

- **The server enforces permissions.** Hiding a screen is only tidiness. Revenue figures need `reports.revenue.view`, and the API refuses them otherwise.
- **Money** arrives as integer pesewas. Show it with `formatCedis` from `@plateraa/shared`, and never do float maths on it.
- **After adding API endpoints,** regenerate the client (see the root AGENTS.md).

## Running

- `pnpm --filter @plateraa/dashboard dev` serves http://localhost:5173.
- **Which API it talks to.** By default, the deployed API. To use an API running on the laptop, set `VITE_API_URL=http://localhost:3000` in the root `.env`.
  - The dashboard reads the root `.env` (`envDir`). Only `VITE_` keys reach the browser, so never put a secret in one.
- **Allowed browsers.** The API only accepts browsers from `TRUSTED_ORIGINS`, which defaults to `http://localhost:5173`. When the dashboard is deployed, add its address to `TRUSTED_ORIGINS` on Render.
