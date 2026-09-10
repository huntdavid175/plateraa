import { date, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { cashMovements } from './cash.js';
import { id, money, tenantId, timestamps } from './columns.js';
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
    ...timestamps(),
  },
  (t) => [index('expenses_spent_on').on(t.tenantId, t.spentOn)],
);
