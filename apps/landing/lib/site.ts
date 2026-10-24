/**
 * Brixx's website settings in one place.
 *
 * The dashboard is live on Vercel (24 Oct); NEXT_PUBLIC_DASHBOARD_URL overrides it (for example
 * `http://localhost:5173` to try the dashboard on the laptop). Set NEXT_PUBLIC_SITE_URL once the
 * domain is set up.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brixx.com';
const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'https://brixxrestaurantdashboard.vercel.app';

export const SIGN_UP_URL = `${DASHBOARD_URL}/sign-up`;
export const SIGN_IN_URL = `${DASHBOARD_URL}/sign-in`;

/**
 * Brixx's share of each online payment. The site names it only in the Terms (user decision,
 * 24 Oct: competitors don't publish theirs); everywhere else says "a small fee". Cash sales pay
 * nothing.
 */
export const ONLINE_FEE_WORDS = '2%';

export const SITE_NAME = 'Brixx';
export const SITE_DESCRIPTION =
  'Your customers order and pay from your own store link, and every order lands in one list on your tablet. Free to start for food vendors in Ghana, and you pay only when customers pay you online.';

/**
 * How vendors reach us. Empty values are left off the site. Still to come from the user (15 Oct).
 * `whatsapp` and `phone` are international numbers without spaces, e.g. 233201234567.
 */
export const CONTACT = {
  email: '',
  whatsapp: '',
  phone: '',
  instagram: '',
  tiktok: '',
  x: '',
  facebook: '',
};

export const NAV = [
  { href: '/features', label: 'Features' },
  { href: '/who-its-for', label: 'Who it’s for' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
] as const;
