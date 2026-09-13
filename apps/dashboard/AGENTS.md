# Dashboard (`@plateraa/dashboard`)

The web dashboard for owners and managers (plan.md §3.1). It uses:

- Vite 8 and React 19;
- React Router 7: not 8, which needs React 19.2.7, while the repo pins 19.2.3 to match Expo;
- TanStack Query 5;
- Tailwind 4;
- recharts 3.

## Design

- **Follow the user's Figma Make design** in `design/dashboard_design.make`, which is a zip. Read `src/App.tsx` and `src/index.css` from the repo inside it.
  - Copy its look: colours, spacing and components.
  - Don't copy its made-up data.
  - Where its wording clashes with a settled decision, the decision wins:
    - real order numbers;
    - stations are Kitchen and Drinks only;
    - a PIN is never shown;
    - it's "Moolre account", not "MoMo account";
    - "sold out" means it can't be ordered until tomorrow.
- **Colours** are CSS variables in `src/index.css`, exposed as Tailwind colour names: `bg-surface`, `bg-tile`, `text-muted`, `border-border`, `bg-brand`, `bg-brand-subtle`, `bg-green-bg text-green`, and so on.
  - Use those names, never hex values, so dark mode keeps working.
  - Dark mode is the `dark` class on `<html>` (`lib/theme.ts`). It starts from the device's own setting and is then remembered per browser.
- **Fonts:** DM Sans for text; DM Mono (`font-mono`) for money and order numbers.
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
- `ui/`: components taken from the design:
  - `controls.tsx`: Button, Card, Toggle, Badge, Tag, FieldLabel, TextInput, Spinner, Section, ErrorNote;
  - `Page.tsx`: Page, ComingSoon, Centered;
  - `icons.tsx`.
- `lib/orders.ts`, `lib/reports.ts`: fetchers, with row types taken from the generated client, and `paymentState()` (Paid / Unpaid / Refund owed / Cancelled).
- `lib/money.ts`: `cedis()`, `longDate()`, `hourLabel()`. `lib/words.ts`: plain words for enums.
- `router.tsx` holds the routes; `pages/` holds the screens.
  - Today (`TodayPage`): the day summary, the refunds-owed banner and recent orders. The date box opens any past day (`/?date=`), without the open drawers; today itself is left to the server's trading day.
    - Tablet warnings (`devices.manage`): the `alerts` from `GET /api/devices`, checked every minute, worded by `lib/tablet-alerts.ts`. The Staff page's Tablets card shows the same, with each tablet's last finished sync.
  - Orders (`OrdersPage`): a day's orders (`?date=`) or a range's (`?from=&to=`), filtered by source and by paid or not, and by `method`, `item` or `staff` when a figure links there (shown as removable chips). Everything lives in the address, so a view can be shared; the server does the filtering. Totals show only with `reports.revenue.view`.
  - **Every figure links to its rows**: Today's and Reports' figures open these Orders and Expenses views for their days (`linksFor` in `ReportsPage`).
  - Order (`OrderPage`): one order in full. Links to it pass `state: { back, label }`, so "←" returns to where the person came from. It links to the order's customer.
  - Customers (`CustomersPage`, search in `?q=`) and one customer (`CustomerPage`): their orders, first and last order, what they spent (with `reports.revenue.view`), and name and notes to edit (`customers.manage`). `lib/customers.ts`.
  - Menu (`MenuPage`): category pills, item cards, and one-tap sold out.
  - `ItemEditorPage` (`/menu/items/new`, `/menu/items/:itemId`): the design's full-screen editor.
    - It keeps a text form (`ItemForm`) and turns it into the API's item with `toInput()`, which also finds the first thing to fix.
    - A new item, size, group or option gets its `ulid()` in the browser.
  - Refunds (`RefundsPage`): orders owed money back, each with "Record refund given".
  - `money-dialogs.tsx`: the dialogs for recording a refund, applying a discount (previewed with `priceOrder`, as the server prices it) and recording a payout.
    - Each dialog makes its id with `ulid()` when it opens, so pressing Save again after a lost reply records it once.
    - `refreshMoney()` reloads everything that shows money.
    - The refund and discount dialogs open from the order page; payouts open from the "Open drawers" card on Today.
  - Sign-up and onboarding (`auth/SignUpPage`, `auth/SetupPage`, loaded lazily at `/setup`):
    - the design's 7 steps, sized for a phone;
    - the business is created at step 2;
    - the starter menu is saved in one call (`lib/onboarding.ts` turns a template and its prices into it);
    - PINs are never shown back;
    - Moolre uses the Settings check.
    - The sidebar's "Setup guide" (owners) reopens it at the menu step.
  - Staff (`StaffPage`):
    - the team, with Add and Edit dialogs (PINs typed twice and checked with `pinProblem`, never shown);
    - the owner's "Who sees sales totals" switches;
    - the Tablets card, with sign out.
  - Reports (`ReportsPage`, needs `reports.revenue.view`): the last 7 days, this month, last month, or "Pick days" (up to 92), kept in the address (`?range=pick&from=&to=`). It shows:
    - totals and a profit-and-loss;
    - day by day, where each day opens its orders;
    - by source and by payment method;
    - best sellers and expenses by kind;
    - staff, and drawer closes with their variances.
  - Expenses (`ExpensesPage`): spending by range, with a total, and "Add expense", which can be a stock purchase. The range (`?range=`, or `pick` with `from`/`to`), a `category` and `kind` (`purchase` or `other`) live in the address.
  - Stock (`StockPage`): key ingredients with a "running low" banner, and Count / Edit dialogs. `lib/expenses.ts` serves both pages.
  - Settings (`SettingsPage`):
    - Business (name, type);
    - Appearance (dark mode);
    - Orders (dine-in, pay before prep, portion counts, idle lock), where toggles save at once;
    - Online store (plan.md §4.0), for anyone with `storefront.manage` (the owner and managers; `lib/storefront.ts`): the store on or off, its link with Copy and a QR code (`qrcode-generator`, downloadable), taking orders now, cash when they collect, accept first, the colour (`STOREFRONT_THEMES` swatches) and what its page shows (area, phone, hours). It says when Moolre isn't connected or there are no delivery zones yet;
    - Delivery zones, for anyone with `catalog.manage` (managers too): add, change, switch off the tablet, remove (`lib/zones.ts`).
    - Payments (the Moolre account, with "Check and save").
  - **Bolt Food and Chowdeck are hidden** (user decision, 13 Sep) until their APIs connect: no commissions in Settings, and no platform prices in the item editor, whose "Cost and margin" section now shows only with `reports.revenue.view`. The editor still sends the prices it loaded, so none are lost.
  - **Dine-in, pickup and delivery** replace "where the order came from": Today's cards, Reports' "Dine-in, pickup and delivery" box and the Orders filter (`?type=`), with Dine-in only where the owner offers it (`me.offersDineIn`). Orders are worded by `kindWords` ("Dine-in", or "Bolt · Pickup" for one from elsewhere); `?source=` still works as a removable chip.
    - Managers see Appearance, the business name and Delivery zones.
  - The rest are placeholders until their slices.
- **Keep the first screen light on mobile data.** Big libraries load lazily: the recharts chart is `pages/MoneyInChart.tsx`, loaded with `lazy()`.

## Rules

- **The server enforces permissions.** Hiding a screen is only tidiness. Revenue figures need `reports.revenue.view`, and the API refuses them otherwise.
- **Money** arrives as integer pesewas. Show it with `formatCedis` from `@plateraa/shared`, and never do float maths on it.
- **After adding API endpoints,** regenerate the client (see the root AGENTS.md).

## Running

- `pnpm --filter @plateraa/dashboard dev` serves http://localhost:5173.
- **Which API it talks to.** By default, the deployed API. To use an API running on the laptop, set `VITE_API_URL=http://localhost:3000` in the root `.env`.
  - The dashboard reads the root `.env` (`envDir`). Only `VITE_` keys reach the browser, so never put a secret in one.
- **Allowed browsers.** The API only accepts browsers from `TRUSTED_ORIGINS`, which defaults to `http://localhost:5173`. When the dashboard is deployed, add its address to `TRUSTED_ORIGINS` on Render.
