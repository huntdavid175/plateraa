# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Brixx's own team, never vendors. Two roles:

- **Admin**: the founder and anyone running the business. Everything Customer service can do, plus suspending and restoring businesses, managing the Brixx team's accounts and exporting the audit log.
- **Customer service**: answers vendors' calls and WhatsApp messages. Looks up any business, order, payment link or customer; approves or declines sign-up requests; resets a staff PIN, signs a tablet out, resends a payment link and leaves notes on a business.

They work at a laptop, often while on the phone with a vendor, and need an answer in seconds.

## Product Purpose

The console Brixx runs on: let new vendors in, keep the ones already in working, and see how the whole platform is doing. It replaces the `admin:requests` / `admin:approve` scripts and the Admin CLI v0 in `plan.md`.

## Operating Context

- Vendors are small informal Ghanaian food businesses (chop bars, fast food, cafés) using an offline-first tablet at the counter, a dashboard and an online store. Money goes only through each vendor's own Moolre account, never through Brixx.
- A request to join waits as `PENDING` until Brixx approves it; nothing works for the business until then.
- A support call usually starts with a phone number, a business name or an order number (`W12`, `A34`).
- Tablets go quiet, get stuck or get refused changes; a stuck tablet is the commonest support problem.

## Capabilities and Constraints

- Lives in `apps/admin`, its own Vite app, against the same NestJS API (`/api/platform/*`), with the same Better Auth login. A `platform_staff` table gives a login its Brixx role.
- The server enforces every permission; hiding a button is only tidiness.
- Every action that changes something is audited with the Brixx person who did it.
- Money is integer pesewas, shown with `formatCedis`. Brixx never holds vendors' money, so platform figures are "orders through Brixx", never revenue Brixx earned. Brixx's own fee (the split) isn't decided yet: don't show it.
- Bolt Food and Chowdeck aren't connected yet.

## Brand Commitments

- The name is Brixx. The console looks and feels like the vendor dashboard (shadcn and Arc, the same tokens), by the user's decision on 27 Oct; it says "Brixx Admin" in the sidebar so staff know where they are.
- Plain language. "Payment account" rather than "Moolre account" where a vendor would read it. Internally, staff may see Moolre named.

## Evidence on Hand

Real data lives in the API (businesses, orders, tablets, audit events). No real platform figures exist for design; sample data in previews must be labelled as such.

## Product Principles

1. Answer the support call fast: one search box finds a business, order, phone number or customer.
2. Show what needs someone first: waiting requests, stuck tablets, failed links.
3. Every change is deliberate and traceable: confirm, give a reason, audit it.
4. Brixx sees what it needs to help, not more: no PINs, no keys, no tokens, ever.

## Accessibility & Inclusion

WCAG AA contrast in light and dark. Fully usable from the keyboard.
