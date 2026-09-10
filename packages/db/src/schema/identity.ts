import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { id, syncColumns, tenantId, timestamps } from './columns.js';
import { staffRole } from './enums.js';
import { locations } from './tenancy.js';

/**
 * Everyone who works at a vendor. Every order, payment, refund and cash movement points here.
 * Owners and managers link to an email login (user_id); staff and riders have only a PIN.
 */
export const staffMembers = pgTable(
  'staff_members',
  {
    id: id(),
    tenantId: tenantId(),
    /** Better Auth user, for Owner/Manager email logins. FK added with the auth tables. */
    userId: text(),
    displayName: text().notNull(),
    role: staffRole().notNull(),
    /** Argon2id hash, checked by the server when online. */
    pinHash: text(),
    /** Salted PBKDF2 check sent only to registered devices, for offline unlock. */
    pinVerifier: text(),
    pinFailedAttempts: integer().notNull().default(0),
    pinLockedUntil: timestamp({ withTimezone: true }),
    /** Per-person revenue visibility; null means "use the role setting". */
    revenueVisibilityOverride: boolean(),
    /** Encrypted secret for offline approval codes (Owner/Manager only). */
    approvalSecret: text(),
    active: boolean().notNull().default(true),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    uniqueIndex('staff_members_one_per_user_per_tenant').on(t.tenantId, t.userId),
    index('staff_members_sync').on(t.tenantId, t.syncXid),
  ],
);

export const devices = pgTable(
  'devices',
  {
    id: id(),
    tenantId: tenantId(),
    locationId: text()
      .notNull()
      .references(() => locations.id),
    name: text().notNull(),
    /** Letter prefixed to order numbers if a vendor ever runs more than one device. */
    code: text().notNull().default('A'),
    /** SHA-256 of the device token; the token itself only lives on the phone. */
    tokenHash: text().notNull().unique(),
    registeredBy: text()
      .notNull()
      .references(() => staffMembers.id),
    platform: text(),
    appVersion: text(),
    lastSeenAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index('devices_tenant').on(t.tenantId)],
);
