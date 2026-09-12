import type { paths } from '@plateraa/api-client';
import type { MenuTemplate, VendorType } from '@plateraa/shared';
import { ulid } from 'ulid';
import { api, call } from './api';

export const createBusiness = (name: string, vendorType: VendorType) =>
  call(api.POST('/api/onboarding/business', { body: { name, vendorType } }));

export type StarterMenu =
  paths['/api/menu/starter']['post']['requestBody']['content']['application/json'];

export const addStarterMenu = (body: StarterMenu) => call(api.POST('/api/menu/starter', { body }));

/** One line of the price grid: an item, or one size of it. */
export interface PriceRow {
  key: string;
  label: string;
}

const itemKey = (category: number, item: number) => `${category}.${item}`;
const sizeKey = (category: number, item: number, size: number) => `${category}.${item}.${size}`;

export function priceRows(template: MenuTemplate): PriceRow[] {
  return template.categories.flatMap((category, c) =>
    category.items.flatMap((item, i) =>
      item.variants?.length
        ? item.variants.map((size, s) => ({
            key: sizeKey(c, i, s),
            label: `${item.name} · ${size}`,
          }))
        : [{ key: itemKey(c, i), label: item.name }],
    ),
  );
}

/** Ids for the template's extras groups, made once, so items share the same group. */
export type GroupIds = Record<string, { id: string; options: string[] }>;

export function groupIdsFor(template: MenuTemplate): GroupIds {
  return Object.fromEntries(
    template.modifierGroups.map((group) => [
      group.key,
      { id: ulid(), options: group.options.map(() => ulid()) },
    ]),
  );
}

/**
 * The starter menu to save: every item (or size) with a price typed in. Blank ones are left off,
 * and so are categories left empty. Extras come at no charge until the owner sets one.
 */
export function starterMenu(
  template: MenuTemplate,
  prices: Record<string, number>,
  groupIds: GroupIds,
): StarterMenu {
  const groups = Object.fromEntries(
    template.modifierGroups.map((group) => {
      const ids = groupIds[group.key]!;
      return [
        group.key,
        {
          id: ids.id,
          name: group.name,
          required: group.minSelect > 0,
          maxSelect: Math.min(20, Math.max(1, group.maxSelect ?? group.options.length)),
          options: group.options.map((name, o) => ({ id: ids.options[o]!, name, priceDelta: 0 })),
        },
      ];
    }),
  );

  const categories = template.categories.flatMap((category, c) => {
    const items = category.items.flatMap((item, i) => {
      const station = item.station ?? 'KITCHEN';
      const itemGroups = (item.modifierGroups ?? []).flatMap((key) => groups[key] ?? []);
      if (item.variants?.length) {
        const variants = item.variants.flatMap((name, s) => {
          const price = prices[sizeKey(c, i, s)];
          return price === undefined ? [] : [{ id: ulid(), name, price, channelPrices: {} }];
        });
        if (!variants.length) return [];
        return [
          {
            id: ulid(),
            item: {
              name: item.name,
              price: variants[0]!.price,
              station,
              variants,
              groups: itemGroups,
              channelPrices: {},
            },
          },
        ];
      }
      const price = prices[itemKey(c, i)];
      if (price === undefined) return [];
      return [
        {
          id: ulid(),
          item: {
            name: item.name,
            price,
            station,
            variants: [],
            groups: itemGroups,
            channelPrices: {},
          },
        },
      ];
    });
    return items.length ? [{ id: ulid(), name: category.name, items }] : [];
  });
  return { categories };
}
