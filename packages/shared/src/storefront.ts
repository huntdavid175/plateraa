/**
 * The colours an owner or manager can give their online store (plan.md §4.0). Each is dark
 * enough for white words on it, in light and dark mode; the storefront works out the lighter
 * and darker shades from it.
 */
export const STOREFRONT_THEMES = [
  'orange',
  'red',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const;
export type StorefrontTheme = (typeof STOREFRONT_THEMES)[number];

export const STOREFRONT_THEME_COLOURS: Record<StorefrontTheme, { name: string; brand: string }> = {
  orange: { name: 'Orange', brand: '#E8701A' },
  red: { name: 'Red', brand: '#C0392B' },
  green: { name: 'Green', brand: '#1F7A4C' },
  teal: { name: 'Teal', brand: '#0F766E' },
  blue: { name: 'Blue', brand: '#1F5FAD' },
  purple: { name: 'Purple', brand: '#6B3FA0' },
  pink: { name: 'Pink', brand: '#C2185B' },
};
