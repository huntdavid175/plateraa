import { sql } from 'drizzle-orm';
import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, money, syncColumns, tenantId, timestamps } from './columns.js';
import { approvalAction, approvalMethod, approvalStatus } from './enums.js';
import { devices, staffMembers } from './identity.js';
import { orders } from './orders.js';

/** A request for a Manager/Owner to approve a refund, payout, discount or price override. */
export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: id(),
    tenantId: tenantId(),
    action: approvalAction().notNull(),
    amount: money(),
    discountBps: integer(),
    orderId: text().references(() => orders.id),
    requestedBy: text()
      .notNull()
      .references(() => staffMembers.id),
    deviceId: text().references(() => devices.id),
    status: approvalStatus().notNull().default('PENDING'),
    method: approvalMethod(),
    decidedBy: text().references(() => staffMembers.id),
    decidedAt: timestamp({ withTimezone: true }),
    /** For offline codes: the 2-minute window the code belonged to. One use per approver per window. */
    codeWindow: bigint({ mode: 'number' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
    ...syncColumns(),
  },
  (t) => [
    uniqueIndex('approval_requests_offline_code_once')
      .on(t.tenantId, t.decidedBy, t.codeWindow)
      .where(sql`${t.method} = 'OFFLINE_CODE'`),
    index('approval_requests_sync').on(t.tenantId, t.syncXid),
  ],
);
