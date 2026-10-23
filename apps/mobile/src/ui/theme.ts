import { formatCedis, type Pesewas } from '@brixx/shared';
import { useSyncExternalStore } from 'react';
import type { StyleSheet } from 'react-native';

/**
 * The one brand colour, in the two schemes. Trying blue in place of the orange (16 Sep); to go
 * back, put the orange values below back in — nothing else in the app names the brand colour.
 *   light: brand '#E8701A', brandPressed '#D4641A', brandTint '#FEF0E6', brandInk '#C55A10'
 *   dark:  brand '#E8701A', brandPressed '#D4641A', brandTint '#2E1B0B', brandInk '#F59A4E'
 */
const BRAND = {
  light: {
    brand: '#2563EB',
    brandPressed: '#1D4ED8',
    brandTint: '#E8F0FE',
    brandInk: '#1D4ED8',
    onBrand: '#FFFFFF',
  },
  dark: {
    brand: '#3B82F6',
    brandPressed: '#2563EB',
    brandTint: '#0F1E38',
    brandInk: '#7FAEF8',
    onBrand: '#FFFFFF',
  },
};

/**
 * The counter's look, from the Figma Make design in apps/mobile/assets/design: calm and
 * spacious; white and light grey; one brand colour, only for the main action and the
 * selected tab; status colours only where they mean something, always with a word.
 */
const LIGHT = {
  canvas: '#FFFFFF',
  ground: '#F6F5F3',
  tile: '#ECEAE7',
  tilePressed: '#E4E2DE',
  /** A tile set back: a sold-out item, an order not picked. */
  tileMuted: '#EDECEA',
  /** What sits on the track: the chosen segment, the chosen order. */
  raised: '#FFFFFF',
  field: '#FAFAF9',
  track: '#F0EEEA',
  line: '#E4E2DE',
  divider: '#F0EEEA',
  countBg: '#DEDAD6',
  ink: '#1A1917',
  text2: '#4A4845',
  /** Secondary text; passes 4.5:1 on white. */
  muted: '#6B6860',
  /** Placeholders and decoration only: too faint for text people must read. */
  faint: '#8A8680',
  disabled: '#C5C3BF',
  /** Dark on light and light on dark, for a toast over the counter. */
  inverse: '#1A1917',
  onInverse: '#FFFFFF',
  ...BRAND.light,
  online: '#22C55E',
  good: '#16A34A',
  goodBg: '#DCFCE7',
  goodInk: '#166534',
  amber: '#F59E0B',
  amberBg: '#FEF3C7',
  amberInk: '#92400E',
  red: '#EF4444',
  redBg: '#FEF2F2',
  redTint: '#FEE2E2',
  redLine: '#FECACA',
  redInk: '#B91C1C',
  /** A red background under white words, in both schemes. */
  redSolid: '#B91C1C',
  offlineBg: '#E8EEF4',
  offlineInk: '#3D5A73',
  /** Violet, not blue: blue is the brand, and an 'info' badge must not read as the main action. */
  infoBg: '#F4F1FE',
  infoInk: '#5B21B6',
  stockBg: '#F5E6D3',
  stockInk: '#7A5A36',
};

export type Palette = typeof LIGHT;

/** The same roles on cool dark greys, which sit under the blue; status tints keep their own hue. */
const DARK: Palette = {
  canvas: '#191C21',
  ground: '#0F1114',
  tile: '#23262C',
  tilePressed: '#2D3138',
  tileMuted: '#202329',
  raised: '#373C44',
  field: '#14161A',
  track: '#272B31',
  line: '#373C44',
  divider: '#272B31',
  countBg: '#373C44',
  ink: '#EDF0F4',
  text2: '#CFD4DB',
  muted: '#9AA1AB',
  faint: '#767D87',
  disabled: '#474D56',
  inverse: '#EDF0F4',
  onInverse: '#171A1F',
  ...BRAND.dark,
  online: '#22C55E',
  good: '#34D07A',
  goodBg: '#0F2A1C',
  goodInk: '#4ADE80',
  amber: '#F5A623',
  amberBg: '#2A1B07',
  amberInk: '#F5A623',
  red: '#F87171',
  redBg: '#2A0F0F',
  redTint: '#3A1616',
  redLine: '#5C2323',
  redInk: '#F87171',
  redSolid: '#B91C1C',
  offlineBg: '#1A2530',
  offlineInk: '#A7C0D6',
  infoBg: '#1C1630',
  infoInk: '#C4B5FD',
  stockBg: '#2E2317',
  stockInk: '#D9B68A',
};

export type Scheme = 'light' | 'dark';

const PALETTES: Record<Scheme, Palette> = { light: LIGHT, dark: DARK };
let current: Scheme = 'light';
const listeners = new Set<() => void>();

/**
 * The colours of the scheme in use. Read them while rendering, or inside `themed` and
 * `themedStyles`; a plain module-level constant would keep the scheme the app started with.
 */
export const colors: Palette = new Proxy({} as Palette, {
  get: (_, key) => PALETTES[current][key as keyof Palette],
});

/**
 * Something built from `colors` once for each scheme, such as a table of tones. Reading from it
 * gives the version for the scheme in use.
 */
export function themed<T extends object>(make: () => T): T {
  const made = {} as Record<Scheme, T>;
  const was = current;
  try {
    for (const scheme of ['light', 'dark'] as const) {
      current = scheme;
      made[scheme] = make();
    }
  } finally {
    current = was;
  }
  return new Proxy({} as T, { get: (_, key) => made[current][key as keyof T] });
}

/** A screen's styles, made once for each scheme: `styles.row` is the row for the scheme in use. */
export const themedStyles = <T extends StyleSheet.NamedStyles<T>>(make: () => T): T => themed(make);

export const getScheme = () => current;

/**
 * Switches every colour to `scheme`. Screens already drawn keep their colours until they draw
 * again, so the app's screens are drawn afresh when it changes (app/_layout.tsx).
 */
export function setScheme(scheme: Scheme) {
  if (scheme === current) return;
  current = scheme;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useScheme = (): Scheme => useSyncExternalStore(subscribe, getScheme);

/** DM Sans for words, DM Mono for money and order numbers (loaded in app/_layout.tsx). */
export const font = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radii = { sm: 8, md: 10, lg: 12, xl: 20, pill: 999 };

/** Three sizes do most of the work: small labels, medium names, large totals. */
export const text = {
  label: 12,
  small: 14,
  body: 16,
  heading: 20,
  total: 24,
  title: 26,
  key: 26,
  huge: 40,
};

/** Money as the counter shows it: "GH₵ 35.00". */
export const cedis = (amount: number) => formatCedis(amount as Pesewas).replace('GH₵', 'GH₵ ');

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
