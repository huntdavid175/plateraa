import { boolean, char, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { tenantStatus, vendorType } from './enums.js';

export const tenants = pgTable('tenants', {
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  vendorType: vendorType().notNull(),
  status: tenantStatus().notNull().default('ACTIVE'),
  currency: char({ length: 3 }).notNull().default('GHS'),
  timezone: text().notNull().default('Africa/Accra'),
  taxEnabled: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
