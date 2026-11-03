# Admin console (`@brixx/admin`)

Brixx's own console for running the business (27 Oct, user request), never seen by vendors. Vite 8, React 19, React Router 7, TanStack Query 5 and Tailwind 4, like the dashboard, against the same API's `/api/platform/*` (see `apps/api/AGENTS.md`, Platform). Product truth is in `PRODUCT.md` here.

## Roles

Two, from `PLATFORM_ROLES` in `@brixx/shared` (`platform.ts`), held in `platform_staff`:

- **Customer service** (`SUPPORT`): sees everything, approves or declines sign-ups, resets a staff PIN, signs a tablet out, writes notes on a business.
- **Admin** (`ADMIN`): all of that, plus suspending and restoring a business, downloading the audit log and managing the team.

The server checks every permission (`@Platform(...)`); the console only hides what someone can't use (`useCan()` in `lib/query.ts`). The first Admin is added with `pnpm --filter @brixx/api admin:grant <email> ADMIN "Their name"`, which makes the login itself and asks for its password in the terminal; after that, Admins add people on the Team page, which makes their logins too.

**The team and vendors never share a login** (27 Oct, user decision: an Admin had shown up as a vendor). A team login can't ask for a business (the API refuses it), and an email that already belongs to a business can't join the team. Nobody on the team goes through the vendor sign-up.

## Screens

- **Home** (`/`): today across Brixx, then four queues as figures (requests, tablets with a problem, failed payment links, gone quiet) and one "Needs someone" list, worst first, with orders by hour and the team's latest actions.
- **Requests** (`/requests`, `?open=<id>`): waiting requests beside the one being decided: call or WhatsApp them, Approve, or Decline with a reason. Declined ones stay 30 days and can be approved after all.
- **Businesses** (`/businesses`, `?filter=` and `?q=`) and one business (`/businesses/:id`): owner, phone, payment account, store, last 30 days, tablets (sign out), staff (new PIN), logins, orders, payment links, activity; Admins suspend or restore. **The team's notes sit in the page's margin** (below the header on narrower screens).
- **Support** (`/support?q=`): one box for anything a vendor says: a name, a phone number, an order number (last 7 days, any business; `14` finds `014`) or an owner's email. Ctrl+K (⌘K) in the sidebar jumps to it.
- **Analytics** (`/analytics?days=7|30|90`): totals against the period before, orders per day, the sign-up-to-trading funnel, order types and sources, and each business with its trend (most orders, falling, growing).
- **Health** (`/health`): tablets (needing help, or all), payment links today, refused sync changes, failed links this week.
- **Audit log** (`/audit`, filters in the address): everyone's changes, newest first, with before and after; Admins download it as CSV.
- **Team** (`/team`).

## Design: the dashboard's look, in shadcn and Arc

**Same look and feel as the vendor dashboard** (27 Oct, user decision, after first trying a separate "counter notebook" world): the dashboard's tokens (`src/theme.css` and `src/index.css`, copied from `apps/dashboard`), shadcn's sidebar (`components/ui`) and **Arc** (uiarc.dev) for everything Arc has, installed as-is in `components/arc` (`npx shadcn@latest add @uiarc/<id>`; `components.json` has the registry). The rules in `apps/dashboard/AGENTS.md`, Design, hold here too.

- **Which Arc parts, where:**
  - `metric-card` for headline figures (Home, Analytics, a business's Overview);
  - `sortable-data-table` for every table, inside a `Panel` with `TableScroll`;
  - `timeline` for the team's actions, notes and the audit log, with `json-viewer` for before and after;
  - charts: `bar-chart` (orders by hour, a business's 30 days), `line-chart` (orders per day), `donut-chart` through `ShareDonut` (it hides Arc's legend and lists the parts itself, because Arc's squeezes labels to a letter in a half-width panel), `progress` for the sign-up funnel;
  - `segmented-control` for filters and periods, `tabs` on one business (`?tab=`), `search-field`, `select`, `date-range-picker`, `switch`;
  - `badge` for every state, `alert`, `empty-state`, `skeleton`;
  - `dialog` (every change asks why: `ReasonDialog`), `copy-button`, `avatar`, `user-menu`, `toast-stack` (via `ui/Toast.tsx`);
  - the `command-palette` block, opened with Ctrl+K (⌘K) or "Find anything", over every page and business.
  - The `page-header` block was installed but isn't used: it's a demo without props.
- **Shared pieces:** `components/app/panel.tsx`, `bento.tsx`, `loading.tsx` and `ui/Page.tsx`, copied from the dashboard (`Page` gained `back`). Ours are in `components/app/admin.tsx`: `ReasonDialog`, `TabletBadge`, `LinkBadge`, `Loading`, `TableScroll`, `TrendLine` (a trend inside a table cell) and `ShareDonut`.
- **Arc's metric card trims a plain leading space** in `suffix`: use `NBSP` from `lib/format.ts` ("9 of 11").
- **Installing more Arc parts:** never let the CLI's `--overwrite` stand on `src/index.css`. On 27 Oct it wrote Arc's default tokens (a black accent) into it, and every colour went wrong; restore it from `apps/dashboard/src/index.css`. `command-palette.tsx` has six `!` added for this repo's `noUncheckedIndexedAccess`; put them back if it's reinstalled.

## Running

- `pnpm --filter @brixx/admin dev` serves http://localhost:5174 (5173 is the dashboard's). It uses the deployed API unless `VITE_API_URL` is set in the root `.env`.
- **The API only accepts browsers in `TRUSTED_ORIGINS`.** On Render it lists `https://brixxsuperadmin.vercel.app` and `http://localhost:5174` (27 Oct); add any new address of the console there, or signing in fails with "Can't reach Brixx". Deployed on Vercel at `https://brixxsuperadmin.vercel.app`.
- **Preview** (dev only): `?preview` (or `?preview=SUPPORT`) answers every API call with made-up sample data from `src/dev/preview.ts`, with no login, and a strip says so; `?live` turns it off. The build leaves it out. Screens are checked by screenshotting it with headless Chrome at 1440 and 500 wide, light (`--blink-settings=preferredColorScheme=1`) and dark (`=0`).
- `vercel.json` sends every address to `index.html`.
- **After each deploy, tabs left open ask for page files that are gone** (every page but sign-in and Home loads when first opened, from fingerprinted files). `components/app/route-error.tsx`, the routes' `errorElement`, spots that error and reloads once to get the new version (at most once a minute); any other crash shows "This page hit a problem" with the error, beside the sidebar, or on its own if the shell itself failed.
