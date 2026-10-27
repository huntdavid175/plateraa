import { PLATFORM_ROLES } from '@brixx/shared';
import { boolean, index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { id, tenantId } from './columns.js';

export const platformRole = pgEnum('platform_role', PLATFORM_ROLES);

/**
 * Brixx's own team on the admin console: a login with a role (Admin or Customer service).
 * Platform-level, not tenant-scoped, like the Better Auth tables it hangs off.
 */
export const platformStaff = pgTable('platform_staff', {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: platformRole().notNull(),
  active: boolean().notNull().default(true),
  /** Who added them; null for the first Admin, added with `admin:grant`. */
  addedBy: text().references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * The team's notes on a business ("called 27 Oct, tablet battery dead"). Never synced, never
 * shown to the vendor. Tenant-scoped so row-level security covers it like everything else.
 */
export const businessNotes = pgTable(
  'business_notes',
  {
    id: id(),
    tenantId: tenantId(),
    authorUserId: text()
      .notNull()
      .references(() => user.id),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('business_notes_tenant').on(t.tenantId, t.createdAt)],
);
