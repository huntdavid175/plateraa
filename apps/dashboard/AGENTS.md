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
- `router.tsx` holds the routes; `pages/` holds the screens.

## Rules

- **The server enforces permissions.** Hiding a screen is only tidiness. Revenue figures need `reports.revenue.view`, and the API refuses them otherwise.
- **Money** arrives as integer pesewas. Show it with `formatCedis` from `@plateraa/shared`, and never do float maths on it.
- **After adding API endpoints,** regenerate the client (see the root AGENTS.md).

## Running

- `pnpm --filter @plateraa/dashboard dev` serves http://localhost:5173.
- **Which API it talks to.** By default, the deployed API. To use an API running on the laptop, set `VITE_API_URL=http://localhost:3000` in the root `.env`.
  - The dashboard reads the root `.env` (`envDir`). Only `VITE_` keys reach the browser, so never put a secret in one.
- **Allowed browsers.** The API only accepts browsers from `TRUSTED_ORIGINS`, which defaults to `http://localhost:5173`. When the dashboard is deployed, add its address to `TRUSTED_ORIGINS` on Render.
