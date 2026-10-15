# Landing page (`@plateraa/landing`)

Plateraa's own website, for selling Plateraa to vendors. It's kept apart from the storefront (user decision, 15 Oct): stores sit at the top level there (`/<slug>`), which would clash with pages such as `/pricing`, and the two are for different people. Next.js 16 (App Router, Turbopack), React 19, Tailwind 4.

## Design

- To follow the user's design system (not yet given, 15 Oct). Until then `app/page.tsx` is a stand-in.
- **The Plateraa logo:** `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png` and `public/logo.png` are made by `pnpm brand:assets` from `public/images/logo.png` at the repo root, so don't edit them by hand.

## Running

- `pnpm --filter @plateraa/landing dev` serves http://localhost:3002.
- Not deployed yet. It's meant for its own Vercel project.
