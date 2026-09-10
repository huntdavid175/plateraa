import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { id, tenantId } from './columns.js';
import { devices, staffMembers } from './identity.js';

/**
 * Who changed money, prices, stock or access, from which device, before and after.
 * Append-only: the runtime role can insert and read, never update or delete.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    tenantId: tenantId(),
    actorStaffId: text().references(() => staffMembers.id),
    /** Set instead of a staff id when a platform operator acts (CLI, support). */
    actorPlatform: text(),
    deviceId: text().references(() => devices.id),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    deviceTs: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_events_entity').on(t.tenantId, t.entityType, t.entityId)],
);
