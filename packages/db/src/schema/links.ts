import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { id, money, syncColumns, tenantId, timestamps } from './columns.js';
import { paymentLinkStatus } from './enums.js';
import { devices, staffMembers } from './identity.js';
import { orders } from './orders.js';
import { payments } from './payments.js';
import { tenants } from './tenants.js';

/**
 * A vendor's own Moolre merchant account (plan.md §2.5). Link payments go straight into it and
 * never pass through us. Never sent to a device; the public key is stored encrypted.
 */
export const moolreAccounts = pgTable('moolre_accounts', {
  tenantId: text()
    .primaryKey()
    .references(() => tenants.id),
  /** X-API-USER: the vendor's Moolre username. */
  apiUser: text().notNull(),
  /** X-API-PUBKEY, encrypted with SECRETS_KEY (AES-256-GCM). */
  publicKey: text().notNull(),
  accountNumber: text().notNull(),
  /** The business email Moolre asks for on every link. */
  email: text().notNull(),
  ...timestamps(),
});

/**
 * A Moolre payment link texted to a customer for what's owed on an order. Synced to the tablet,
 * so the counter sees "Link sent", "Paid" or why it couldn't go.
 */
export const paymentLinks = pgTable(
  'payment_links',
  {
    /** ULID from the tablet; also the reference (externalref) Moolre knows the payment by. */
    id: id(),
    tenantId: tenantId(),
    orderId: text()
      .notNull()
      .references(() => orders.id),
    status: paymentLinkStatus().notNull(),
    /** What was still owed when the link was asked for. */
    amount: money().notNull(),
    phone: text().notNull(),
    url: text(),
    /** Moolre's own reference for the link. */
    providerReference: text(),
    /** Why it couldn't be sent or wasn't paid, in words for the counter. */
    failure: text(),
    requestedBy: text()
      .notNull()
      .references(() => staffMembers.id),
    deviceId: text().references(() => devices.id),
    paymentId: text().references(() => payments.id),
    /** Tries at creating and texting the link; it gives up after a few. */
    attempts: integer().notNull().default(0),
    sentAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    /** When the sender or the status check last looked at it. */
    checkedAt: timestamp({ withTimezone: true }),
    createdAtDevice: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    index('payment_links_order').on(t.orderId),
    index('payment_links_status').on(t.status),
    index('payment_links_sync').on(t.tenantId, t.syncXid),
  ],
);

/**
 * Every callback a payment provider sends, stored as it arrived before anything acts on it. The
 * business is only known once the reference is matched, so tenant_id starts empty.
 */
export const providerEvents = pgTable(
  'provider_events',
  {
    id: id(),
    tenantId: text().references(() => tenants.id),
    provider: text().notNull(),
    reference: text(),
    sourceIp: text(),
    payload: jsonb().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
    outcome: text(),
  },
  (t) => [index('provider_events_reference').on(t.reference)],
);
