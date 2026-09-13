import { describe, expect, it } from 'vitest';
import {
  BRAND_TINT_PERCENT,
  STOREFRONT_LOOKS,
  STOREFRONT_THEMES,
  type StorefrontPalette,
} from './storefront.js';

type Rgb = [number, number, number];

const rgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** `color-mix(in srgb, a p%, b)`, as the storefront's stylesheet works it out. */
const mix = (a: Rgb, percent: number, b: Rgb): Rgb =>
  a.map((value, i) => Math.round((value * percent + b[i]! * (100 - percent)) / 100)) as Rgb;

const luminance = ([r, g, b]: Rgb) => {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG contrast: 4.5 is the floor for ordinary words, 7 is comfortable reading. */
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Every pair of colours that sits together on the store's pages, with the contrast it needs. */
function pairs(p: StorefrontPalette, mode: 'light' | 'dark') {
  const c = (hex: string) => rgb(hex);
  const tint = mix(c(p.brand), BRAND_TINT_PERCENT[mode], c(p.card));
  const hover = mix(c(p.brand), 86, [0, 0, 0]);
  return [
    ['words on the page', c(p.ink), c(p.page), 7],
    ['words on a card', c(p.ink), c(p.card), 7],
    ['words on a tile', c(p.ink), c(p.tile), 4.5],
    ['quiet words on the page', c(p.muted), c(p.page), 4.5],
    ['quiet words on a card', c(p.muted), c(p.card), 4.5],
    ['quiet words on a tile', c(p.muted), c(p.tile), 4.5],
    ['words on the band', c(p.onHero), c(p.hero), 7],
    ['the area on the band', mix(c(p.onHero), 80, c(p.hero)), c(p.hero), 4.5],
    ['words on a button', c(p.onBrand), c(p.brand), 4.5],
    ['words on a pressed button', c(p.onBrand), hover, 4.5],
    ['button-coloured words on the page', c(p.brandInk), c(p.page), 4.5],
    ['button-coloured words on a card', c(p.brandInk), c(p.card), 4.5],
    ['a chosen option', c(p.brandInk), tint, 4.5],
    ['a button against a card', c(p.brand), c(p.card), 3],
  ] as const;
}

describe('storefront looks', () => {
  it('has a look for every theme', () => {
    expect(Object.keys(STOREFRONT_LOOKS).sort()).toEqual([...STOREFRONT_THEMES].sort());
  });

  for (const theme of STOREFRONT_THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${STOREFRONT_LOOKS[theme].name} (${mode}) is easy to read`, () => {
        const low = pairs(STOREFRONT_LOOKS[theme][mode], mode)
          .map(([what, a, b, needed]) => ({ what, ratio: contrast(a, b), needed }))
          .filter(({ ratio, needed }) => ratio < needed)
          .map(({ what, ratio, needed }) => `${what}: ${ratio.toFixed(2)} < ${needed}`);
        expect(low).toEqual([]);
      });
    }
  }
});
