import { date, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { id, syncColumns, tenantId, timestamps } from './columns.js';
import { stockKind, stockMovementType } from './enums.js';
import { devices, staffMembers } from './identity.js';
import { items } from './catalog.js';
import { orders } from './orders.js';

/**
 * SELLABLE: today's prep count for a menu item ("made 40 jollof"), resets each trading day.
 * RAW: a running count of a key ingredient (bags of rice, crates of eggs).
 */
export const stockItems = pgTable(
  'stock_items',
  {
    id: id(),
    tenantId: tenantId(),
    kind: stockKind().notNull(),
    itemId: text().references(() => items.id),
    name: text().notNull(),
    unit: text().notNull(),
    lowThreshold: integer(),
    /** Current level, maintained by the server in the same transaction as each movement. */
    onHand: integer().notNull().default(0),
    /** For SELLABLE items, the trading day `onHand` belongs to. */
    onHandDate: date({ mode: 'string' }),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [index('stock_items_sync').on(t.tenantId, t.syncXid)],
);

/** Ledger-style: the level is the sum of movements, so nothing is ever overwritten. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: id(),
    tenantId: tenantId(),
    stockItemId: text()
      .notNull()
      .references(() => stockItems.id),
    type: stockMovementType().notNull(),
    /** Signed: +40 prepped, −1 sold, −3 wasted. */
    quantity: integer().notNull(),
    businessDate: date({ mode: 'string' }).notNull(),
    orderId: text().references(() => orders.id),
    staffId: text().references(() => staffMembers.id),
    deviceId: text().references(() => devices.id),
    createdAtDevice: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stock_movements_item_date').on(t.stockItemId, t.businessDate)],
);
