import { boolean, index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, syncColumns, tenantId, timestamps } from './columns.js';

/** Customers are keyed by phone (E.164). No accounts, no required email. */
export const customers = pgTable(
  'customers',
  {
    id: id(),
    tenantId: tenantId(),
    phone: text().notNull(),
    name: text(),
    email: text(),
    notes: text(),
    /** Problem customers, e.g. repeatedly refused deliveries. */
    flagged: boolean().notNull().default(false),
    flaggedReason: text(),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    uniqueIndex('customers_phone_per_tenant').on(t.tenantId, t.phone),
    index('customers_sync').on(t.tenantId, t.syncXid),
  ],
);
