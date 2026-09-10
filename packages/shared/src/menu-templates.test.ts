import { describe, expect, it } from 'vitest';
import { VENDOR_TYPES } from './enums.js';
import { MENU_TEMPLATES } from './menu-templates.js';

describe('MENU_TEMPLATES', () => {
  it('has a template for every vendor type', () => {
    expect(Object.keys(MENU_TEMPLATES).sort()).toEqual([...VENDOR_TYPES].sort());
  });

  for (const [vendorType, template] of Object.entries(MENU_TEMPLATES)) {
    describe(vendorType, () => {
      const items = template.categories.flatMap((c) => c.items);
      const groupKeys = new Set(template.modifierGroups.map((g) => g.key));

      it('only references modifier groups it defines', () => {
        for (const item of items) {
          for (const key of item.modifierGroups ?? []) expect(groupKeys).toContain(key);
        }
      });

      it('has no duplicate item or category names', () => {
        const names = items.map((i) => i.name);
        expect(new Set(names).size).toBe(names.length);
        const categories = template.categories.map((c) => c.name);
        expect(new Set(categories).size).toBe(categories.length);
      });

      it('has sensible modifier group limits', () => {
        for (const group of template.modifierGroups) {
          expect(group.options.length).toBeGreaterThan(0);
          expect(group.minSelect).toBeGreaterThanOrEqual(0);
          if (group.maxSelect !== null)
            expect(group.maxSelect).toBeGreaterThanOrEqual(group.minSelect);
        }
      });
    });
  }
});
