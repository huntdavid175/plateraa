import type { Pesewas } from '@plateraa/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { id, money, syncColumns, tenantId, timestamps } from './columns.js';
import { customers } from './customers.js';
import {
  arrivalMethod,
  deliveryFeeCollector,
  orderSource,
  orderStatus,
  orderType,
  station,
} from './enums.js';
import { devices, staffMembers } from './identity.js';
import { itemVariants, items } from './catalog.js';
import { deliveryZones, locations } from './tenancy.js';

export const orders = pgTable(
  'orders',
  {
    /** ULID generated on the device, so orders can be created offline. */
    id: id(),
    tenantId: tenantId(),
    locationId: text()
      .notNull()
      .references(() => locations.id),
    deviceId: text().references(() => devices.id),
    /** What gets shouted across the counter, e.g. "014". Per device, per day. */
    displayNumber: text().notNull(),
    /** Trading day in the tenant's timezone; daily counters and reports hang off it. */
    businessDate: date({ mode: 'string' }).notNull(),
    source: orderSource().notNull(),
    arrivalMethod: arrivalMethod().notNull(),
    externalReference: text(),
    type: orderType().notNull(),
    status: orderStatus().notNull(),
    onHold: boolean().notNull().default(false),
    customerId: text().references(() => customers.id),
    deliveryAddress: text(),
    deliveryZoneId: text().references(() => deliveryZones.id),
    deliveryFee: money()
      .notNull()
      .default(sql`0`),
    deliveryFeeCollectedBy: deliveryFeeCollector(),
    note: text(),
    /** Discount as entered (percent in bps, or a fixed amount); the result is `discount`. */
    discountBps: integer(),
    discountAmountInput: money(),
    /** Server-computed with priceOrder(); the device's figures are provisional. */
    subtotal: money().notNull(),
    discount: money()
      .notNull()
      .default(sql`0`),
    total: money().notNull(),
    /** Kept up to date by the server in the same transaction as each payment or refund. */
    amountPaid: money()
      .notNull()
      .default(sql`0`),
    priceMismatch: boolean().notNull().default(false),
    cancelReason: text(),
    createdBy: text()
      .notNull()
      .references(() => staffMembers.id),
    createdAtDevice: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    index('orders_business_date').on(t.tenantId, t.businessDate),
    index('orders_sync').on(t.tenantId, t.syncXid),
  ],
);

export interface OrderItemModifier {
  modifierId: string;
  name: string;
  unitPriceDelta: Pesewas;
  quantity: number;
}

export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    tenantId: tenantId(),
    orderId: text()
      .notNull()
      .references(() => orders.id),
    itemId: text()
      .notNull()
      .references(() => items.id),
    variantId: text().references(() => itemVariants.id),
    /** Snapshots: the order keeps what was sold even if the menu changes later. */
    name: text().notNull(),
    variantName: text(),
    unitPrice: money().notNull(),
    costPrice: money(),
    modifiers: jsonb().$type<OrderItemModifier[]>().notNull().default([]),
    quantity: integer().notNull(),
    unitTotal: money().notNull(),
    lineTotal: money().notNull(),
    station: station().notNull(),
    note: text(),
    position: integer().notNull().default(0),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    index('order_items_order').on(t.orderId),
    index('order_items_sync').on(t.tenantId, t.syncXid),
  ],
);

/** Append-only history of every status change: who, which device, when. */
export const orderEvents = pgTable(
  'order_events',
  {
    id: id(),
    tenantId: tenantId(),
    orderId: text()
      .notNull()
      .references(() => orders.id),
    fromStatus: orderStatus(),
    toStatus: orderStatus().notNull(),
    staffId: text().references(() => staffMembers.id),
    deviceId: text().references(() => devices.id),
    deviceTs: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_events_order').on(t.orderId)],
);

/** Public digital receipts, looked up by an unguessable token. */
export const receipts = pgTable(
  'receipts',
  {
    id: id(),
    tenantId: tenantId(),
    orderId: text()
      .notNull()
      .references(() => orders.id),
    token: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('receipts_order').on(t.orderId)],
);
