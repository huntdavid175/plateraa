import { pesewas } from '@plateraa/shared';
import { describe, expect, it } from 'vitest';
import { needsChoice, type MenuGroup, type MenuItem } from './menu';

const protein = (minSelect: number): MenuGroup => ({
  id: 'protein',
  name: 'Protein',
  minSelect,
  maxSelect: 3,
  modifiers: [{ id: 'chicken', name: 'Chicken', priceDelta: pesewas(1500) }],
});

const item = (changes: Partial<MenuItem> = {}): MenuItem => ({
  id: 'fried-rice',
  categoryId: null,
  name: 'Fried rice',
  price: pesewas(3000),
  station: 'KITCHEN',
  soldOut: false,
  left: null,
  stockItemId: null,
  variants: [],
  groups: [],
  ...changes,
});

describe('what a tap on a menu tile does', () => {
  it('opens the sheet for an item with extras, even when choosing is optional', () => {
    expect(needsChoice(item({ groups: [protein(0)] }))).toBe(true);
    expect(needsChoice(item({ groups: [protein(1)] }))).toBe(true);
  });

  it('opens the sheet for an item with sizes', () => {
    expect(
      needsChoice(item({ variants: [{ id: 'large', name: 'Large', price: pesewas(4000) }] })),
    ).toBe(true);
  });

  it('puts an item with nothing to pick straight onto the order', () => {
    expect(needsChoice(item())).toBe(false);
  });
});
