import type { Pesewas, Station } from '@plateraa/shared';
import type { Sql } from '../offline/sql';

export interface MenuModifier {
  id: string;
  name: string;
  priceDelta: Pesewas;
}

export interface MenuGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number | null;
  modifiers: MenuModifier[];
}

export interface MenuVariant {
  id: string;
  name: string;
  price: Pesewas;
}

export interface MenuItem {
  id: string;
  categoryId: string | null;
  name: string;
  price: Pesewas;
  station: Station;
  soldOut: boolean;
  /** Today's prep count still left, for items someone counted this morning. */
  left: number | null;
  /** The item's daily portion count record, if it has one (the dashboard sets these up). */
  stockItemId: string | null;
  variants: MenuVariant[];
  groups: MenuGroup[];
}

export interface MenuCategory {
  id: string | null;
  name: string;
  items: MenuItem[];
}

/** Tapping the tile needs a choice first: a size, or a required extra like the soup. */
export const needsChoice = (item: MenuItem) =>
  item.variants.length > 0 || item.groups.some((group) => group.minSelect > 0);

/** The menu as the counter shows it: categories in order, then anything without one. */
export async function loadMenu(db: Sql, businessDate: string): Promise<MenuCategory[]> {
  const categories = await db.all<{ id: string; name: string }>(
    'SELECT id, name FROM categories WHERE active = 1 ORDER BY position, name',
  );
  const items = await db.all<{
    id: string;
    category_id: string | null;
    name: string;
    price: Pesewas;
    station: Station | null;
    sold_out_on: string | null;
  }>(
    `SELECT id, category_id, name, price, station, sold_out_on FROM items
      WHERE active = 1 ORDER BY position, name`,
  );
  const variants = await db.all<{ id: string; item_id: string; name: string; price: Pesewas }>(
    'SELECT id, item_id, name, price FROM item_variants WHERE active = 1 ORDER BY position, name',
  );
  const links = await db.all<{
    item_id: string;
    group_id: string;
    name: string;
    min_select: number | null;
    max_select: number | null;
  }>(
    `SELECT l.item_id, g.id AS group_id, g.name, g.min_select, g.max_select
       FROM item_modifier_groups l JOIN modifier_groups g ON g.id = l.group_id
      ORDER BY l.position, g.position`,
  );
  const modifiers = await db.all<{
    id: string;
    group_id: string;
    name: string;
    price_delta: Pesewas;
  }>(
    'SELECT id, group_id, name, price_delta FROM modifiers WHERE active = 1 ORDER BY position, name',
  );
  const stock = await db.all<{
    id: string;
    item_id: string;
    on_hand: number;
    on_hand_date: string | null;
  }>(
    `SELECT id, item_id, on_hand, on_hand_date FROM stock_items
      WHERE kind = 'SELLABLE' AND item_id IS NOT NULL`,
  );

  // A count belongs to its trading day; yesterday's leftovers aren't today's count.
  const stockOf = new Map(stock.map((s) => [s.item_id, s]));
  const leftToday = (itemId: string) => {
    const count = stockOf.get(itemId);
    return count && count.on_hand_date === businessDate ? count.on_hand : null;
  };
  const menuItems: MenuItem[] = items.map((item) => ({
    id: item.id,
    categoryId: item.category_id,
    name: item.name,
    price: item.price,
    station: item.station ?? 'KITCHEN',
    soldOut: item.sold_out_on === businessDate,
    left: leftToday(item.id),
    stockItemId: stockOf.get(item.id)?.id ?? null,
    variants: variants
      .filter((variant) => variant.item_id === item.id)
      .map(({ id, name, price }) => ({ id, name, price })),
    groups: links
      .filter((link) => link.item_id === item.id)
      .map((link) => ({
        id: link.group_id,
        name: link.name,
        minSelect: link.min_select ?? 0,
        maxSelect: link.max_select,
        modifiers: modifiers
          .filter((modifier) => modifier.group_id === link.group_id)
          .map(({ id, name, price_delta }) => ({ id, name, priceDelta: price_delta })),
      })),
  }));

  const known = new Set(categories.map((category) => category.id));
  const result: MenuCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    items: menuItems.filter((item) => item.categoryId === category.id),
  }));
  result.push({
    id: null,
    name: 'Other',
    items: menuItems.filter((item) => !item.categoryId || !known.has(item.categoryId)),
  });
  return result.filter((category) => category.items.length > 0);
}
