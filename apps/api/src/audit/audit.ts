import { auditEvents, type Tx } from '@plateraa/db';
import { ulid } from 'ulid';

export interface AuditEvent {
  tenantId: string;
  actorStaffId?: string | null;
  actorPlatform?: string | null;
  deviceId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  deviceTs?: Date | null;
}

/**
 * Records who changed money, prices, stock or access. Always called with the same transaction
 * as the change itself, so the change and its audit row commit or fail together.
 * Never put secrets (PINs, hashes, tokens) in before/after.
 */
export async function recordAudit(tx: Tx, event: AuditEvent): Promise<void> {
  await tx.insert(auditEvents).values({
    id: ulid(),
    tenantId: event.tenantId,
    actorStaffId: event.actorStaffId ?? null,
    actorPlatform: event.actorPlatform ?? null,
    deviceId: event.deviceId ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    before: event.before ?? null,
    after: event.after ?? null,
    deviceTs: event.deviceTs ?? null,
  });
}
