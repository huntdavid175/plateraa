# Brixx rebrand: what's left

On 23 Oct 2026 the code was renamed from Plateraa to Brixx (commit `1e0b842`). Some things outside the code still carry the old name or need a step from the founder. Tick each one here when it's done, with a short italic note, and then update `AGENTS.md`.

To find anything still named Plateraa: `git grep -n -i plateraa`.

## Before the next tablet install

- [ ] **New EAS build for the tablet.** The Android package is now `com.brixx.pos` and the link scheme `brixx`, so the build installs as a separate app beside the old Plateraa one.
  - Sync every pending order on the old app first: its saved data (`plateraa.sqlite`, `plateraa.device`) isn't carried over.
  - Then uninstall the old app, install the new one and register the tablet again.
- [ ] **Vercel:** if the storefront project has `PLATERAA_API_URL` set, rename it to `BRIXX_API_URL`. Without it, the store uses the Render address, which still works.

## Outside services still named plateraa

These were kept on purpose so nothing broke. Rename or recreate each one, then change the code that names it.

- [ ] **Render API** (`https://plateraa-api.onrender.com`, service `srv-dahug3rm8hqs73deg150`). The neatest fix is the domain below (for example `api.<domain>`), not a rename. Then update:
  - `apps/dashboard/src/lib/api.ts`, `apps/mobile/src/config.ts` and `apps/storefront/lib/api.ts` (their default API address);
  - `AGENTS.md`;
  - the tablet needs a new EAS build to pick up the address.
- [ ] **Vercel storefront** (`https://plateraa-storefront-bvos.vercel.app`). Same as the API: give it the new domain (for example `store.<domain>`). Then update:
  - `STOREFRONT_URL` on Render (it makes the dashboard's store link and QR code);
  - `apps/dashboard/src/dev/Preview.tsx`, `AGENTS.md` and `apps/storefront/AGENTS.md`.
- [ ] **R2 bucket** (`plateraa-photos`). R2 can't rename a bucket: make `brixx-photos` and copy every object across. The database only saves each photo's key, so no data changes. Then:
  - set `R2_BUCKET` (and `R2_PUBLIC_URL`, if the address changes) in `.env` and on Render, and run `pnpm --filter @brixx/api photos:check`;
  - update the default in `apps/api/src/config/env.ts`, plus `apps/api/src/test/test-app.ts`, `.env.example` and `AGENTS.md`;
  - delete the old bucket once the stores show their photos from the new one.
- [ ] **EAS project** (slug `plateraa`, `@huntdavid175/plateraa`). The slug is tied to the EAS project ID in `apps/mobile/app.json`, so changing it means a new EAS project (new `projectId`, and the build credentials set up again). Optional: nobody sees it. If done, update `apps/mobile/app.json` and `apps/mobile/AGENTS.md`.
- [ ] **GitHub repo** (`huntdavid175/plateraa`). GitHub redirects the old address after a rename. Afterwards:
  - point the local remote at the new name (`git remote set-url origin …`);
  - check that Render's and Vercel's GitHub links still deploy from `main`;
  - update the `gh api repos/huntdavid175/…` example in `AGENTS.md`.
  - The old links in `plan.md` can stay: they're history.

## Brand

- [ ] **Domain.** `brixx.com` in the code is a placeholder (`apps/landing/lib/site.ts`, `apps/api/src/config/env.ts`, `.env.example`, `plan.md` Phase 0) and may well be taken. Once a domain is bought, put the real one there, then use it for the API, store and photo addresses above, and for login emails.
- [x] **Logo.** _23 Oct: the user's Brixx logo is `public/images/brixx-logo.png`; `pnpm brand:assets` now makes a white B on an orange square for every icon, and `wordmark.png` (the full logo) for the landing page's header and footer and the dashboard's sign-in pages. The tablet still needs its new EAS build to show it._
- [x] **Share picture.** _23 Oct: `apps/landing/app/opengraph-image.tsx` is now the orange B on black beside the headline, as in the user's glowing picture. The B comes from `brixx-logo.png` (`assets/mark.png`, made by `pnpm brand:assets`), as the glowing picture's glow is stored as see-through pixels and the black version sent after it is too small (612×408)._
- [ ] **Figma Make files** still say Plateraa inside (`apps/dashboard/design/dashboard_design.make`, `apps/storefront/design/storefront design.make`, `apps/mobile/assets/design/Design Brixx POS Screen.make`). They're binary, so rename them in Figma Make if wanted, then export them again.
- [ ] **Outside accounts:** Moolre (the SMS sender ID `MOOLRE_SMS_SENDER_ID` customers see on payment links), Sentry project, Neon project, Cloudflare and Google Play listing names.
- [ ] **Laptop folder** (`C:\Users\user\Desktop\projects\plateraa`). Optional. Renaming it starts Claude Code's saved notes afresh, as they're kept by folder path.
