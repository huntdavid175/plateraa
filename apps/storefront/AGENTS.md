# Storefront (`@plateraa/storefront`)

The online store customers order from (plan.md §4.0): one link per business, `STOREFRONT_URL/<slug>`, that the vendor shares on WhatsApp and Instagram. Next.js 16 (App Router, Turbopack), React 19, Tailwind 4. Phone first; on a laptop the cart is a side panel.

## Design

- Built to the user's Figma Make design, `design/storefront design.make` (kept out of `public/`, which the site serves to anyone). It's a zip; its code is a git pack under `make_repos/` (unpack it as described for the dashboard's design). The screens are in `src/App.tsx`. Its sample data isn't used.
- Colours are CSS variables in `app/globals.css`, exposed as Tailwind names: `bg-page`, `bg-card`, `bg-tile`, `border-border`, `text-ink`, `text-muted`, `bg-brand`, `bg-brand-tint`, `text-green` / `bg-green-bg`, and so on.
- **The whole look is the owner's choice** (user request, 13 Sep). `STOREFRONT_LOOKS` in `@plateraa/shared` has nine looks (Classic, Jollof, Pepper, Hibiscus, Plum, Sky, Lagoon, Palm, Shea), each with a light and a dark set: the page colour the owner picks, `card`, `tile`, `border`, `ink`, `muted`, a stronger band across the top (`hero` / `on-hero`), and buttons in a colour that goes with the page (`brand`, `on-brand` for words on buttons, `brand-ink` for words in the button colour). `<Themed theme>` writes them onto the page's root (`:root:root` and `:root.dark`), and `globals.css` works out `--brand-hover` and `--brand-tint` from them. Use `text-on-brand` on `bg-brand`, `text-brand-ink` for button-coloured words, and never hard-code a colour. `storefront.test.ts` in `@plateraa/shared` checks every look's contrast: run it after changing one. Keep `@theme inline` in `globals.css`: with plain `@theme`, `--color-brand` settles on :root's default orange and the owner's colour only reaches things that use `var(--brand)` directly (it happened on 13 Sep).
- Dark mode follows the phone, with a switch remembered in the browser (`plateraa-dark`), applied before the first paint by the script in `app/layout.tsx`.
- DM Sans and DM Mono come from `@fontsource`, so builds need no network. Money is `ghs()` (`lib/money.ts`), from whole pesewas.
- **The Plateraa logo** (15 Sep): `app/favicon.ico`, `app/icon.png` and `app/apple-icon.png` are the tab and home-screen icons, which Next serves by their names for every page, each store's included; `public/logo.png` is the mark on Plateraa's own page (`app/page.tsx`), where the 🍲 used to be. `Message` takes a picture or an emoji as its `icon`. They're made by `pnpm brand:assets` from `public/images/logo.png` at the repo root, so don't edit them by hand. The store's own logo is a different thing: the owner uploads it (`logoUrl`, see Photos).

## How it works

- **Only the storefront's server talks to the API** (`lib/api.ts`; `PLATERAA_API_URL`, the Render API by default). Pages load their data on the server, and the browser calls server actions (`app/actions.ts`) to place an order, pay and check a payment. Actions never throw: they return `{ ok: false, message }` for the page to show.
- `app/[slug]/page.tsx` reads the store fresh on every visit; `storefront.tsx` is the client side (menu, item sheet, cart, checkout).
- **The cart** is kept in the browser (`lib/cart.ts`) and priced with `priceOrder` from `@plateraa/shared` for showing; the server prices the order itself. Lines that sold out or changed since they were added must come off before checkout.
- **Checkout** keeps one `orderId` per visit, so a retry records the order once. Paying online: the page's address is swapped for the order's status page, then the customer goes to Moolre's page, so Back lands on the status page.
- `app/[slug]/o/[token]/` is the order's status page. It asks Moolre at once when the customer comes back from paying, then looks again every 15 s while the order is open. "Pay" opens a fresh payment page when the last one lapsed.
- **Photos** come from Cloudflare R2's public address (the API gives full URLs: `photoUrl` on items, `coverUrl` and `logoUrl` on the store). They're plain `<img>` tags: the dashboard already made them small, so Next's image optimiser isn't needed. Without a photo a card shows the item's initials; without a cover the header band is the store's colour, and without a logo the store's initials show.

## Running

- `pnpm --filter @plateraa/storefront dev` serves http://localhost:3001. To use an API on the laptop, set `PLATERAA_API_URL=http://localhost:3000` in `apps/storefront/.env.local`. After changing `@plateraa/shared` or the API client, build them first.
- **Deployed on Vercel** (13 Sep) at `https://plateraa-storefront-bvos.vercel.app`, built from `main` by Vercel's GitHub link (each build shows as a GitHub deployment; a build's own long address needs a Vercel login, the short one is public). `STOREFRONT_URL` on Render must be this address, so the dashboard shows the right store link and QR code. `PLATERAA_API_URL` isn't set there, so it uses the Render API. Until `plateraa.com` is set up, store links are `<that address>/<slug>`.
