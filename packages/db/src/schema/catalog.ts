import { boolean, date, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { id, money, syncColumns, tenantId, timestamps } from './columns.js';
import { orderSource, station } from './enums.js';

export const categories = pgTable(
  'categories',
  {
    id: id(),
    tenantId: tenantId(),
    name: text().notNull(),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [index('categories_sync').on(t.tenantId, t.syncXid)],
);

export const items = pgTable(
  'items',
  {
    id: id(),
    tenantId: tenantId(),
    categoryId: text().references(() => categories.id),
    name: text().notNull(),
    description: text(),
    /** Used when the item has no variants; otherwise each variant carries its own price. */
    price: money().notNull(),
    costPrice: money(),
    prepMinutes: integer(),
    station: station().notNull().default('KITCHEN'),
    photoKey: text(),
    /** "Sold out today": the business date it was marked, so it resets itself the next day. */
    soldOutOn: date({ mode: 'string' }),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [index('items_sync').on(t.tenantId, t.syncXid)],
);

export const itemVariants = pgTable(
  'item_variants',
  {
    id: id(),
    tenantId: tenantId(),
    itemId: text()
      .notNull()
      .references(() => items.id),
    name: text().notNull(),
    price: money().notNull(),
    costPrice: money(),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    index('item_variants_item').on(t.itemId),
    index('item_variants_sync').on(t.tenantId, t.syncXid),
  ],
);

/** A required group has min_select ≥ 1 (e.g. "Choose your protein"). */
export const modifierGroups = pgTable(
  'modifier_groups',
  {
    id: id(),
    tenantId: tenantId(),
    name: text().notNull(),
    minSelect: integer().notNull().default(0),
    maxSelect: integer(),
    position: integer().notNull().default(0),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [index('modifier_groups_sync').on(t.tenantId, t.syncXid)],
);

export const modifiers = pgTable(
  'modifiers',
  {
    id: id(),
    tenantId: tenantId(),
    groupId: text()
      .notNull()
      .references(() => modifierGroups.id),
    name: text().notNull(),
    priceDelta: money().notNull(),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    index('modifiers_group').on(t.groupId),
    index('modifiers_sync').on(t.tenantId, t.syncXid),
  ],
);

export const itemModifierGroups = pgTable(
  'item_modifier_groups',
  {
    id: id(),
    tenantId: tenantId(),
    itemId: text()
      .notNull()
      .references(() => items.id),
    groupId: text()
      .notNull()
      .references(() => modifierGroups.id),
    position: integer().notNull().default(0),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    index('item_modifier_groups_item').on(t.itemId),
    index('item_modifier_groups_sync').on(t.tenantId, t.syncXid),
  ],
);

/** A different price on one channel (e.g. +15% on Bolt Food to cover commission). */
export const itemChannelPrices = pgTable(
  'item_channel_prices',
  {
    id: id(),
    tenantId: tenantId(),
    itemId: text()
      .notNull()
      .references(() => items.id),
    variantId: text().references(() => itemVariants.id),
    source: orderSource().notNull(),
    price: money().notNull(),
    ...timestamps(),
  },
  (t) => [index('item_channel_prices_item').on(t.itemId)],
);

/**
 * Every price an item or variant has had. The server accepts a price from an offline device
 * only if it matches a version valid around the time the order was taken.
 */
export const priceHistory = pgTable(
  'price_history',
  {
    id: id(),
    tenantId: tenantId(),
    itemId: text()
      .notNull()
      .references(() => items.id),
    variantId: text().references(() => itemVariants.id),
    price: money().notNull(),
    validFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp({ withTimezone: true }),
  },
  (t) => [index('price_history_item').on(t.itemId, t.validFrom)],
);
