import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, money, syncColumns, tenantId, timestamps } from './columns.js';
import { cashMovementType, expenseCategory, shiftStatus } from './enums.js';
import { devices, staffMembers } from './identity.js';
import { locations } from './tenancy.js';

/**
 * A cash drawer session, attributed to named people. Expected cash is computed by the server:
 * float + cash payments − cash refunds − payouts − drops + pay-ins.
 */
export const shifts = pgTable(
  'shifts',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: text()
      .notNull()
      .references(() => locations.id),
    deviceId: text()
      .notNull()
      .references(() => devices.id),
    status: shiftStatus().notNull().default('OPEN'),
    openedBy: text()
      .notNull()
      .references(() => staffMembers.id),
    openedAt: timestamp({ withTimezone: true }).notNull(),
    floatAmount: money().notNull(),
    closedBy: text().references(() => staffMembers.id),
    closedAt: timestamp({ withTimezone: true }),
    expectedCash: money(),
    countedCash: money(),
    variance: money(),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    uniqueIndex('shifts_one_open_per_device')
      .on(t.deviceId)
      .where(sql`${t.status} = 'OPEN'`),
    index('shifts_sync').on(t.tenantId, t.syncXid),
  ],
);

/** Drawer movements other than sales and refunds. A payout also creates an expense. */
export const cashMovements = pgTable(
  'cash_movements',
  {
    id: id(),
    tenantId: tenantId(),
    shiftId: text()
      .notNull()
      .references(() => shifts.id),
    type: cashMovementType().notNull(),
    /** Always positive; the type says which way it moves. */
    amount: money().notNull(),
    category: expenseCategory(),
    note: text(),
    approvalId: text(),
    staffId: text()
      .notNull()
      .references(() => staffMembers.id),
    deviceId: text().references(() => devices.id),
    createdAtDevice: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    index('cash_movements_shift').on(t.shiftId),
    index('cash_movements_sync').on(t.tenantId, t.syncXid),
  ],
);
