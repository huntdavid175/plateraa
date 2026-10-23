/**
 * Brixx's website settings in one place.
 *
 * The dashboard isn't deployed yet (user decision, 13 Sep), so its address defaults to the laptop's
 * dev server. Set NEXT_PUBLIC_DASHBOARD_URL when it goes live, and NEXT_PUBLIC_SITE_URL once the
 * domain is set up.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brixx.com';
const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:5173';

export const SIGN_UP_URL = `${DASHBOARD_URL}/sign-up`;
export const SIGN_IN_URL = `${DASHBOARD_URL}/sign-in`;

/** Brixx's share of each online payment, in basis points (200 = 2%). Cash sales pay nothing. */
export const ONLINE_FEE_BPS = 200;
export const ONLINE_FEE_WORDS = '2%';

export const SITE_NAME = 'Brixx';
export const SITE_DESCRIPTION =
  'Your customers order and pay from your own store link, and every order lands in one list on your tablet. Free to start for food vendors in Ghana: 2% only on online payments.';

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
