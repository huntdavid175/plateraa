import { describe, expect, it } from 'vitest';
import { CATEGORY_COLOURS, categoryColours, colourOf } from './categories';

/** WCAG relative luminance, as in people.test.ts. */
function luminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  const channel = (raw: number) => {
    const part = raw / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
}

const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

describe('the colour each menu category is known by', () => {
  it('reads on its own ground, under the finger too, in both looks', () => {
    for (const colour of CATEGORY_COLOURS) {
      for (const ground of [colour.tint, colour.pressed]) {
        expect(contrast(colour.ink, ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colour.soft, ground)).toBeGreaterThanOrEqual(4.5);
      }
      // The chosen chip turns it round: the tint on the ink.
      expect(contrast(colour.tint, colour.ink)).toBeGreaterThanOrEqual(4.5);
      // The tiles have to stand out on the dark look's ground.
      expect(contrast(colour.tint, '#121213')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives every category on the menu its own colour, in the menu’s order', () => {
    const menu = Array.from({ length: 8 }, (_, place) => ({ id: `c${place}` }));
    const colours = categoryColours(menu);
    expect(new Set(menu.map((c) => colourOf(colours, c.id).tint)).size).toBe(8);
    expect(colourOf(colours, 'c0')).toBe(CATEGORY_COLOURS[0]);
  });

  it('colours what has no category, and starts again after eight', () => {
    const colours = categoryColours([
      ...Array.from({ length: 8 }, (_, p) => ({ id: `c${p}` })),
      { id: null },
    ]);
    expect(colourOf(colours, null)).toBe(CATEGORY_COLOURS[0]);
    expect(colourOf(colours, 'gone')).toBe(CATEGORY_COLOURS[0]);
  });
});
