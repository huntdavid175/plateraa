import { date, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { cashMovements, shifts } from './cash.js';
import { id, money, syncColumns, tenantId, timestamps } from './columns.js';
import { orderSource, paymentMethod, paymentStatus } from './enums.js';
import { devices, staffMembers } from './identity.js';
import { orders } from './orders.js';

export const payments = pgTable(
  'payments',
  {
    id: id(),
    tenantId: tenantId(),
    orderId: text()
      .notNull()
      .references(() => orders.id),
    method: paymentMethod().notNull(),
    status: paymentStatus().notNull(),
    amount: money().notNull(),
    /** Cash handed over, for the change shown on screen and the receipt. */
    tendered: money(),
    collectedBy: text()
      .notNull()
      .references(() => staffMembers.id),
    shiftId: text().references(() => shifts.id),
    deviceId: text().references(() => devices.id),
    createdAtDevice: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    index('payments_order').on(t.orderId),
    index('payments_shift').on(t.shiftId),
    index('payments_sync').on(t.tenantId, t.syncXid),
  ],
);

/** Pilot refunds are cash. Cancelling a paid order creates one; both need approval. */
export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    tenantId: tenantId(),
    orderId: text()
      .notNull()
      .references(() => orders.id),
    paymentId: text().references(() => payments.id),
    method: paymentMethod().notNull(),
    amount: money().notNull(),
    reason: text().notNull(),
    requestedBy: text()
      .notNull()
      .references(() => staffMembers.id),
    approvalId: text(),
    shiftId: text().references(() => shifts.id),
    cashMovementId: text().references(() => cashMovements.id),
    deviceId: text().references(() => devices.id),
    createdAtDevice: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [index('refunds_order').on(t.orderId), index('refunds_sync').on(t.tenantId, t.syncXid)],
);

/** Money a delivery platform owes the vendor (Bolt Food pays weekly). Surfaced, not settled. */
export const platformReceivables = pgTable(
  'platform_receivables',
  {
    id: id(),
    tenantId: tenantId(),
    orderId: text()
      .notNull()
      .references(() => orders.id),
    source: orderSource().notNull(),
    gross: money().notNull(),
    commissionEstimate: money(),
    expectedPayoutOn: date({ mode: 'string' }),
    ...timestamps(),
  },
  (t) => [index('platform_receivables_order').on(t.orderId)],
);
