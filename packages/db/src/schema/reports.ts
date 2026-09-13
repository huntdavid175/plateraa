import { date, integer, jsonb, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { tenantId, xid8 } from './columns.js';

/**
 * A finished trading day's figures, worked out once and kept (plan.md §3.2), so reports over
 * past days don't add up every order again. Server only: never synced, since devices never hold
 * sales totals.
 *
 * A row is only good while nothing on its day has changed. Every order, payment, refund, order
 * line and expense is stamped with the transaction that last wrote it (`sync_xid`); anything on
 * the day stamped at or after `asOf` means the row is out of date and the day is worked out again.
 */
export const dailyReports = pgTable(
  'daily_reports',
  {
    tenantId: tenantId(),
    businessDate: date({ mode: 'string' }).notNull(),
    /** The shape of `figures`. A row from an older shape is worked out again. */
    version: integer().notNull(),
    figures: jsonb().$type<Record<string, unknown>>().notNull(),
    /** The oldest transaction still running when the figures were read. */
    asOf: xid8().notNull(),
    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.businessDate] })],
);
