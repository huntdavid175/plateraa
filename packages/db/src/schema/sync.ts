import { bigint, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { tenantId } from './columns.js';
import { syncCommandStatus } from './enums.js';
import { devices, staffMembers } from './identity.js';

/**
 * Every command a device pushed, keyed by the command's own ULID. Pushing the same command
 * twice returns the stored result instead of applying it again.
 */
export const syncCommands = pgTable(
  'sync_commands',
  {
    id: text().primaryKey(),
    tenantId: tenantId(),
    deviceId: text()
      .notNull()
      .references(() => devices.id),
    staffId: text().references(() => staffMembers.id),
    type: text().notNull(),
    deviceSeq: bigint({ mode: 'number' }).notNull(),
    status: syncCommandStatus().notNull(),
    result: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sync_commands_device').on(t.deviceId, t.deviceSeq)],
);
