import { sql } from 'drizzle-orm';
import { date, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { cashMovements } from './cash.js';
import { id, money, tenantId, timestamps, xid8 } from './columns.js';
import { expenseCategory, expenseMethod } from './enums.js';
import { staffMembers } from './identity.js';
import { stockItems } from './stock.js';
import { locations } from './tenancy.js';

/** Money out. A purchase is an expense linked to a stock item and quantity. */
export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: text()
      .notNull()
      .references(() => locations.id),
    amount: money().notNull(),
    category: expenseCategory().notNull(),
    method: expenseMethod().notNull(),
    note: text(),
    spentOn: date({ mode: 'string' }).notNull(),
    receiptKey: text(),
    stockItemId: text().references(() => stockItems.id),
    stockQuantity: integer(),
    supplierName: text(),
    /** Set when the expense came from a drawer payout at the counter. */
    cashMovementId: text().references(() => cashMovements.id),
    createdBy: text()
      .notNull()
      .references(() => staffMembers.id),
    deletedAt: timestamp({ withTimezone: true }),
    /**
     * Stamped by trigger on every write, like the synced tables. Expenses never go to a tablet:
     * this tells the stored daily reports that a day's money out has changed.
     */
    syncXid: xid8()
      .notNull()
      .default(sql`pg_current_xact_id()`),
    ...timestamps(),
  },
  (t) => [
    index('expenses_spent_on').on(t.tenantId, t.spentOn),
    index('expenses_sync').on(t.tenantId, t.syncXid),
  ],
);
