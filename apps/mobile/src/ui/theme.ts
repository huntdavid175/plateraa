import { formatCedis, type Pesewas } from '@plateraa/shared';

/**
 * The counter's look, from the Figma Make design in apps/mobile/assets/design: calm and
 * spacious; white and warm light grey; one warm brand colour, only for the main action and the
 * selected tab; status colours only where they mean something, always with a word.
 */
export const colors = {
  canvas: '#FFFFFF',
  ground: '#F6F5F3',
  tile: '#ECEAE7',
  tilePressed: '#E4E2DE',
  field: '#FAFAF9',
  track: '#F0EEEA',
  line: '#E4E2DE',
  divider: '#F0EEEA',
  ink: '#1A1917',
  text2: '#4A4845',
  /** Secondary text; passes 4.5:1 on white. */
  muted: '#6B6860',
  /** Placeholders and decoration only: too faint for text people must read. */
  faint: '#8A8680',
  disabled: '#C5C3BF',
  brand: '#E8701A',
  brandPressed: '#D4641A',
  brandTint: '#FEF0E6',
  brandInk: '#C55A10',
  onBrand: '#FFFFFF',
  online: '#22C55E',
  good: '#16A34A',
  goodBg: '#DCFCE7',
  goodInk: '#166534',
  amberBg: '#FEF3C7',
  amberInk: '#92400E',
  red: '#EF4444',
  redBg: '#FEF2F2',
  redLine: '#FECACA',
  redInk: '#B91C1C',
  offlineBg: '#E8EEF4',
  offlineInk: '#3D5A73',
  infoBg: '#EFF6FF',
  infoInk: '#1E40AF',
  stockBg: '#F5E6D3',
  stockInk: '#7A5A36',
};

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
