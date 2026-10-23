# Landing page (`@brixx/landing`)

Brixx's own website, for selling Brixx to vendors. It's kept apart from the storefront (user decision, 15 Oct): stores sit at the top level there (`/<slug>`), which would clash with pages such as `/pricing`, and the two are for different people. Next.js 16 (App Router, Turbopack), React 19, Tailwind 4. Every page is static.

## Design

- **`DESIGN.md` is the design system**, drawn on 15 Oct from the screenshots in `design_inspiration/` (Toast mostly, plus Fountain, Shopify and Clover). It covers the direction, colour tokens with their contrast, type, components, motion, imagery, copy and SEO. Read it before changing a page.
- **The look:** Toast's warm orange on white and cream, with Shopify-style dark sections (user decision, 15 Oct). **No shadcn here** (user decision): components are hand-written with Tailwind in `components/`, with icons from `lucide-react`.
- **Keep the product private** (user, 15 Oct): illustrations are abstract fragments (`components/art.tsx`: an order chip, a "Paid by MoMo" note, a sold-out tag), never the real tablet, store or dashboard layouts, and never screenshots.
- **Photos** (15 Oct, picked by the user from Unsplash): seven, listed in `content/photos.ts` with their description, crop position and photographer, and kept in `public/photos/` as WebP (about 1,000–2,000 px wide, 60–170 KB each). The vendor photo on Who it's for (`aboutHero`) is cropped to leave out phone numbers painted behind the vendor. `PhotoSlot` shows one with `image={PHOTOS.x}` (`priority` for the photo at the top of a page) and falls back to a warm gradient without one. The footer credits the photographers. The people in them aren't Brixx customers, so never present a photo as a testimonial. To find more, `UNSPLASH_ACCESS_KEY` is in the root `.env` (a demo key: 50 searches an hour).
- **The Brixx logo:** `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png` and `public/logo.png` are made by `pnpm brand:assets` from `public/images/logo.png` at the repo root, so don't edit them by hand.

## Copy

- **Positioning** (user, 15 Oct): easy ordering for customers and easy order management for restaurants. The hero says "Make ordering easy for your customers and your kitchen". Money tracking and profit are supporting points.
- **Omnichannel ordering** (user, 15 Oct) means accepting orders from the food apps vendors already sell on (Bolt Food, Chowdeck) alongside their own store and counter, in one list. Delivery riders are a separate feature, never part of "omnichannel".
- **Delivery apps and delivery partners** (user, 15 Oct): Bolt Food, Chowdeck and rider booking show as "Coming soon" (`components/order-sources.tsx`, the Features page's `soon` entry, an FAQ answer). Name the apps, never use their logos, and leave delivery partners unnamed until a partnership is agreed. Switch a source to live only once its connection works.
- **Who it's for** (`/who-its-for`, user request, 15 Oct) is in the menu in place of About, and holds the About story too: business types, what owners, managers and staff each get, an honest "is it right for you" check, why we started and what we hold to. `/about` redirects there (`next.config.ts`).
- **Business types** are photo tiles (`components/business-types.tsx`): quick service, pizzerias, cafés and bakeries, juice bars, bars and lounges, hotels, cloud kitchens and restaurants, in a 4 × 2 grid (user, 15 Oct). Chop bars, waakye spots, grills and street stalls were taken off the site at the user's request, so don't bring them back in copy. **The looping strip is for businesses already on Brixx** (`components/onboard-strip.tsx`, fed by `content/vendors.ts`), and it stays hidden until the user adds real, approved names.

- `.agents/product-marketing.md` at the repo root holds the positioning, audience, objections and words to use or avoid. The marketing skills in `.claude/skills` (copywriting, pricing, seo-audit, schema and others, installed 15 Oct) read it first.
- **Pricing** (user decision, 15 Oct): free to start, no monthly fee, and **2% only on payments a customer makes online through Brixx** (payment links and the online store); cash sales are free. Always add that Moolre charges its own fee. The rate is `ONLINE_FEE_BPS` in `lib/site.ts`, and the calculator (`components/fee-calculator.tsx`) works in whole pesewas with `@brixx/shared`.
- No invented customers, figures, logos or testimonials. Check every claim against what the product does today.
- `/privacy` and `/terms` are plain-language summaries written from the code, and say so. **The lawyer must review or replace them before the site goes live.**

## How it works

- `lib/site.ts` holds the settings:
  - the dashboard's address (`NEXT_PUBLIC_DASHBOARD_URL`; the laptop's `http://localhost:5173` until it's deployed), which builds the sign-up and log-in links;
  - the site's own address (`NEXT_PUBLIC_SITE_URL`, `https://brixx.com` by default);
  - the contact details (`CONTACT`, still empty on 15 Oct). Empty ones are left off the footer and Contact page.
- SEO:
  - each page sets its own `metadata` with a canonical path;
  - `app/sitemap.ts`, `app/robots.ts` and `app/opengraph-image.tsx`;
  - JSON-LD: `Organization` and `SoftwareApplication` in the layout, and `FAQPage` from `components/faq.tsx`.
- Motion is CSS only (`app/globals.css`): the circled word draws in, sections rise with `animation-timeline: view()` where the browser supports it, and the business-type pills scroll sideways. All of it stops under `prefers-reduced-motion`.

## Running

- `pnpm --filter @brixx/landing dev` serves http://localhost:3002.
- Not deployed yet. It's meant for its own Vercel project, with `NEXT_PUBLIC_DASHBOARD_URL` and `NEXT_PUBLIC_SITE_URL` set there.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
