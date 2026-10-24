# Brixx website design

The design system for Brixx's own website (`apps/landing`), drawn from the screenshots in `design_inspiration/` (15 Oct 2026). Those were mostly Toast, plus Fountain, Shopify and Clover. The site is for **food vendors deciding whether to use Brixx**. Everything here serves one action: creating a free account.

## Direction

**Toast's warmth, with Shopify's dark sections.** The base is Toast:

- warm orange on white and a soft cream;
- large, light, friendly headings;
- pill buttons;
- rounded photo cards with words over them;
- one word that matters, set apart (a highlighter stroke since 15 Oct; Toast circles it by hand).

One or two **full-bleed dark sections**, as on Shopify, break the page's rhythm and carry the "works when things go wrong" story. Ideas taken from the others:

| From    | What we take                                                                       | Where                     |
| ------- | ---------------------------------------------------------------------------------- | ------------------------- |
| Toast   | Hero over a full-bleed photo, one highlighted word (now a marker stroke), pill CTA | Home hero                 |
| Toast   | Grid of orange cards, title and line at the foot                                   | "Everything you need"     |
| Toast   | Cream panel with a list of big lines, one lit, and a dark card beside it           | "Mid-rush" (dark variant) |
| Toast   | Label pill, headline with a script line, CTAs on the right                         | Inner page heroes         |
| Toast   | FAQ: rounded cream rows, the open one turns dark                                   | FAQ on every page         |
| Toast   | Orange closing band with ticks; footer as a white rounded card on it               | Every page's end          |
| Toast   | Pills of business types                                                            | "Built for"               |
| Clover  | Feature cards drawn as simplified UI (an order chip, a paid note)                  | Feature and store cards   |
| Shopify | Sentence with some words dim and some bright, on dark                              | Dark section intro        |
| Shopify | Big stat figures with a small label above                                          | Pricing                   |
| Shopify | Numbered steps 01, 02, 03 with hairlines                                           | "How it works"            |

**Not taken:**

- Clover's all-caps condensed type, which is too shouty next to Toast's warmth;
- Fountain's colour-block cards;
- Shopify's globe and stars;
- logo walls and testimonials, until we have real ones.

## Keep the product private

The user doesn't want the real screens shown publicly (15 Oct), so they can't be copied.

- **Never draw the real tablet, store or dashboard layouts.** Illustrations are **abstract fragments**: a single order chip ("W12 · Pickup · GH₵85.00"), a "Paid by MoMo" note, a "Sold out" tag, a sync dot, bars of a chart with no axes. Grey placeholder bars stand in for anything else, as in Clover's cards.
- Never put real screenshots on the site.

## Colour

Tokens live in `app/globals.css` as CSS variables and are exposed to Tailwind (`bg-cream`, `text-ink`, …). Contrast was checked on 15 Oct (WCAG AA: 4.5 for body text, 3 for large text).

| Token          | Value     | Use                                                                                |
| -------------- | --------- | ---------------------------------------------------------------------------------- |
| `brand`        | `#FC5102` | The logo orange. Big surfaces, icons, large white headings (3.3:1, large only)     |
| `brand-strong` | `#C93F00` | Buttons with white text (5.0:1) and orange words on white (5.0:1) or cream (4.5:1) |
| `brand-deep`   | `#7A2A06` | The bottom of the closing band; white text on it is 9.7:1                          |
| `brand-tint`   | `#FFE9DC` | Soft orange chips and backgrounds                                                  |
| `brand-ink`    | `#B53800` | Small orange text on `brand-tint`, like an order chip's code (5.1:1)               |
| `ink`          | `#1F1A17` | Text (15.6:1 on cream)                                                             |
| `muted`        | `#5E5650` | Secondary text (6.5:1 on cream)                                                    |
| `page`         | `#FFFFFF` | Default background                                                                 |
| `cream`        | `#F7F3EE` | Panels, FAQ rows, alternate sections                                               |
| `line`         | `#E8E1D9` | Hairlines                                                                          |
| `night`        | `#15110E` | Dark sections: warm near-black, not blue                                           |
| `night-card`   | `#211B17` | Cards on dark                                                                      |
| `night-line`   | `#3A312B` | Hairlines on dark                                                                  |
| `on-night`     | `#F5EFE9` | Text on dark (16.5:1)                                                              |
| `night-muted`  | `#A8A098` | Secondary text on dark (7.3:1)                                                     |
| `momo`         | `#FFCC00` | Only on the "Paid by MoMo" note in illustrations                                   |

- One orange per screen does the talking. Green and red never appear on their own; status always comes with a word.
- **Light only.** It's a marketing site, and its dark sections are part of the design. There's no dark-mode switch.

## Type

- **Figtree** (`@fontsource-variable/figtree`) for everything. Headings are large and light, as on Toast: weight 400–500, tight tracking (`-0.02em`), line height 1.05–1.1.
  - Hero: 56–72 px on a laptop, 40–48 px on a phone.
  - Section headings: 40–56 px.
  - Card titles: 22–26 px.
  - Body: 17–18 px, line height 1.6, `muted`.
- **Caveat** (`@fontsource/caveat`, 600–700), in `brand`, only for **one script line per page**, as in Toast's "for modern hospitality". It's never used for body text or for anything a vendor must read to act.
- **The highlighted word** (`<Highlight>`, 15 Oct, replacing the hand-drawn circle at the user's request, chosen over a sticker label): a soft orange marker stroke behind the lower half of one word, slightly tilted, swept in left to right once on load. On dark photos it's `brand` at 85%; on light pages pass `soft` (35%) so it reads as a highlighter. At most once per page, on the hero.
- Sentence case everywhere. No all-caps headings. Small labels (`Eyebrow`) may be capitals with wide tracking, at 12–13 px.

## Shape and space

- Radius:
  - buttons and pills: fully round;
  - cards: 24 px;
  - big photo panels: 32 px;
  - the footer card: 40 px at the top.
- Width: content `max-w-7xl` with 16 px side gutters on a phone and 24–32 px on a laptop. Reading text is at most about 65 characters wide.
- Sections: 96–128 px apart on a laptop, 64–80 px on a phone. One idea per section.
- Shadows: almost none. Only floating notes in illustrations get a soft shadow.

## Components

All are hand-written with Tailwind; **there's no shadcn on this site** (user decision). Icons come from `lucide-react`, at stroke width 1.75.

- **Button** (`components/button.tsx`): pill, 48–56 px tall, in three kinds:
  - `solid` (`brand-strong`, white text);
  - `outline` (`brand-strong` border and text);
  - `light` (white, for photos and dark bands).

  The main one always says what you get ("Create my free account"), never "Submit".

- **Eyebrow:** a small cream pill above a heading (Toast's "RESTAURANT POS SYSTEM").
- **Highlight / Script:** the two accents above.
- **PhotoSlot:** a rounded frame for a stock photo, with a warm gradient until one is added. It names the photo it's waiting for only in development.
- **Illustration fragments** (`components/art.tsx`): the abstract UI pieces listed under "Keep the product private".
- **Faq:** `<details>` rows, keyboard-friendly with no script. Closed rows are cream with a ⊕; the open row is `ink` with white text and ⊖.
- **CtaBand:** an orange band (`brand` → `brand-deep`), with a heading, ticks and the main button. The footer card sits on its lower half.
- **Footer:** a white card with a big top radius, holding the columns, contact and legal links, and the wordmark on orange beneath.

## Motion

Toast and Shopify move gently; so do we.

- The highlighter stroke sweeps in once (about 700 ms, ease-out).
- Sections fade up 12 px on first view.
- The business-type pills scroll slowly sideways.
- **Everything stops under `prefers-reduced-motion`.** Nothing loops except the pills, and they stop too. There's no parallax, scroll-jacking or autoplaying video.

## Imagery

- Photos come from Unsplash (added 15 Oct; see `content/photos.ts`): West African food vendors, grills and stalls, a counter with a tablet, a customer paying by phone. Warm and real, never posed office shots. A spot without a photo shows a warm gradient. Keep private details (phone numbers, number plates, names on signs) out of the crop.
- Photos with words over them get a dark gradient at the foot, so white text stays above 4.5:1.

## Copy

- Follow `.agents/product-marketing.md` (audience, objections, words to use and avoid) and the copywriting skill's rules: no "not X, it's Y", no negation lists, no em dashes in headings, nothing invented.
- **Say "tablet"** for the counter device and **"GH₵"** for money.
- Name foods and places the vendor knows (jollof, waakye, chop bar, MoMo) without caricature.
- **Pricing words:** "Free to start. You pay a small fee only when a customer pays you online. Cash sales are free." Always add that Moolre charges its own fee. **Never name the rate** outside the Terms (user decision, 24 Oct: competitors in Africa don't publish theirs). The Terms state it, from `ONLINE_FEE_WORDS` in `lib/site.ts`.
- **No made-up proof:** no customer counts, logos, testimonials or star ratings until they're real and approved.

## SEO

- Every page has its own title and description (`metadata`), a canonical URL and Open Graph tags.
- `app/sitemap.ts`, `app/robots.ts` and a generated Open Graph image.
- JSON-LD: `Organization` and `SoftwareApplication` (with the price) site-wide, `FAQPage` where an FAQ shows.
- `lang="en-GH"`. Headings run in order, one `h1` per page.
- Pages are static, with system-font fallbacks and fonts bundled (no network at build). Pictures are lazy below the fold.
