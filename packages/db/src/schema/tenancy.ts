import type { RevenueVisibility } from '@plateraa/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { id, money, syncColumns, tenantId, timestamps } from './columns.js';
import { orderSource } from './enums.js';
import { tenants } from './tenants.js';

export const locations = pgTable(
  'locations',
  {
    id: id(),
    tenantId: tenantId(),
    name: text().notNull(),
    isDefault: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('locations_one_default_per_tenant')
      .on(t.tenantId)
      .where(sql`${t.isDefault}`),
  ],
);

export const tenantSettings = pgTable('tenant_settings', {
  tenantId: text()
    .primaryKey()
    .references(() => tenants.id),
  revenueVisibilityByRole: jsonb().$type<RevenueVisibility['byRole']>().notNull().default({}),
  approvalPayoutThreshold: money()
    .notNull()
    .default(sql`5000`),
  approvalDiscountThresholdBps: integer().notNull().default(1000),
  idleLockSeconds: integer().notNull().default(180),
  /** Pay before prep: an order doesn't go to the kitchen until it's fully paid. */
  requirePaymentBeforePrep: boolean().notNull().default(true),
  /** Morning portion counts that count down with each sale. Optional: off unless the owner turns it on. */
  countPortions: boolean().notNull().default(false),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  ...syncColumns(),
});

export const deliveryZones = pgTable(
  'delivery_zones',
  {
    id: id(),
    tenantId: tenantId(),
    name: text().notNull(),
    fee: money().notNull(),
    active: boolean().notNull().default(true),
    position: integer().notNull().default(0),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [index('delivery_zones_sync').on(t.tenantId, t.syncXid)],
);

/** Commission per channel, typed by the owner. Blank on both means sales show as gross. */
export const channelCommissions = pgTable(
  'channel_commissions',
  {
    id: id(),
    tenantId: tenantId(),
    source: orderSource().notNull(),
    rateBps: integer(),
    flatAmount: money(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('channel_commissions_one_per_source').on(t.tenantId, t.source)],
);
