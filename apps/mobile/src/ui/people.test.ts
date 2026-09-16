import { describe, expect, it } from 'vitest';
import { PERSON_COLOURS, initialOf, personColour } from './people';

/** WCAG relative luminance, as in @plateraa/shared's storefront contrast test. */
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

describe('the colour each person is known by', () => {
  it('gives the same person the same colour every time', () => {
    const id = '01JB3Q0R5K9V2X7M8N4P6T1Z0A';
    expect(personColour(id)).toBe(personColour(id));
    expect(personColour(id)).not.toBe(personColour(`${id}B`));
  });

  it('spreads a counter’s worth of people around the palette', () => {
    const ids = Array.from({ length: 40 }, (_, index) => `01JB3Q0R5K9V2X7M8N4P6T1Z${index}`);
    const used = new Set(ids.map((id) => personColour(id).tint));
    expect(used.size).toBeGreaterThan(PERSON_COLOURS.length / 2);
  });

  it('reads at a glance in both looks: the ink is dark on its own ground', () => {
    for (const colour of PERSON_COLOURS) {
      expect(contrast(colour.ink, colour.tint)).toBeGreaterThanOrEqual(4.5);
      // The soft ground itself has to show up against the dark look's cards.
      expect(contrast(colour.tint, '#1C1A18')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('takes the first letter of the name', () => {
    expect(initialOf('Leslie K.')).toBe('L');
    expect(initialOf('  ama ')).toBe('A');
    expect(initialOf('')).toBe('·');
  });
});
