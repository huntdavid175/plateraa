import { Inject, Injectable, Logger } from '@nestjs/common';
import { devices, eq, sql, withTenant } from '@plateraa/db';
import * as Sentry from '@sentry/nestjs';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import type { DeviceContext } from '../identity/request-context';

/**
 * Is each tablet keeping up (plan.md Phase 4)? Every sync request says what the tablet has
 * waiting to upload (`x-outbox-pending`, `x-outbox-oldest`); the server keeps it on the device,
 * with when it last finished a sync. The dashboard turns that into warnings for the owner, and a
 * tablet that's online but stuck is reported to Sentry for us.
 */

/** What a tablet says it has waiting to upload. */
export interface OutboxReport {
  pending: number;
  /** When the oldest waiting change was made, by the tablet's clock. */
  oldestAt: Date | null;
}

export const TABLET_ALERT_KINDS = ['OUT_OF_TOUCH', 'STUCK', 'WAITING', 'REFUSED'] as const;
export type TabletAlertKind = (typeof TABLET_ALERT_KINDS)[number];

export interface TabletAlert {
  kind: TabletAlertKind;
  /** How many changes it's about (waiting, stuck or refused); 0 otherwise. */
  count: number;
  /** Since when: last in touch, oldest waiting change, or last finished sync. */
  since: string | null;
}

const MINUTE_MS = 60_000;
/** A tablet with its drawer open, not in touch for this long. */
export const OUT_OF_TOUCH_MINUTES = 15;
/** Changes waiting to upload for this long. */
export const WAITING_MINUTES = 10;
/** Uploads in a row that didn't end in a finished sync: online, but its changes aren't going in. */
export const STUCK_PUSHES = 10;
const REPORT_EVERY_MS = 60 * MINUTE_MS;

/** The two headers as a report. Missing or odd ones are ignored: older app versions send none. */
export function outboxReport(
  pending: string | undefined,
  oldest: string | undefined,
): OutboxReport | null {
  if (pending === undefined || !/^\d{1,7}$/.test(pending)) return null;
  const count = Number(pending);
  const at = count > 0 && oldest ? new Date(oldest) : null;
  if (at && Number.isNaN(at.getTime())) return null;
  return { pending: count, oldestAt: at };
}

/** What the owner should know about one tablet, worst first. */
export function tabletAlerts(
  tablet: {
    signedOut: boolean;
    drawerOpen: boolean;
    lastSeenAt: Date | null;
    pendingChanges: number;
    oldestPendingAt: Date | null;
    lastSyncedAt: Date | null;
    pushesSinceSync: number;
    /** Changes it sent that the server refused, in the last day. */
    refused: number;
  },
  now = new Date(),
): TabletAlert[] {
  if (tablet.signedOut) return [];
  const olderThan = (at: Date | null, minutes: number) =>
    !at || now.getTime() - at.getTime() > minutes * MINUTE_MS;
  const alerts: TabletAlert[] = [];

  // Trading (its drawer is open) but silent: its sales since then aren't on the dashboard.
  if (tablet.drawerOpen && olderThan(tablet.lastSeenAt, OUT_OF_TOUCH_MINUTES)) {
    alerts.push({
      kind: 'OUT_OF_TOUCH',
      count: 0,
      since: tablet.lastSeenAt?.toISOString() ?? null,
    });
  }
  if (tablet.pendingChanges > 0 && tablet.pushesSinceSync >= STUCK_PUSHES) {
    alerts.push({
      kind: 'STUCK',
      count: tablet.pendingChanges,
      since: tablet.lastSyncedAt?.toISOString() ?? null,
    });
  } else if (
    tablet.pendingChanges > 0 &&
    tablet.oldestPendingAt &&
    olderThan(tablet.oldestPendingAt, WAITING_MINUTES)
  ) {
    alerts.push({
      kind: 'WAITING',
      count: tablet.pendingChanges,
      since: tablet.oldestPendingAt.toISOString(),
    });
  }
  if (tablet.refused > 0) alerts.push({ kind: 'REFUSED', count: tablet.refused, since: null });
  return alerts;
}

@Injectable()
export class TabletHealth {
  private readonly logger = new Logger(TabletHealth.name);
  /** When each tablet was last reported as stuck, so it's reported at most once an hour. */
  private readonly reported = new Map<string, number>();

  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /** An upload arrived: count it, keep what's waiting, and report a tablet that's stuck. */
  async pushed(device: DeviceContext, report: OutboxReport | null): Promise<void> {
    const [row] = await withTenant(this.database.db, device.tenantId, (tx) =>
      tx
        .update(devices)
        .set({
          pushesSinceSync: sql`${devices.pushesSinceSync} + 1`,
          ...(report ? { pendingChanges: report.pending, oldestPendingAt: report.oldestAt } : {}),
        })
        .where(eq(devices.id, device.id))
        .returning({
          pushes: devices.pushesSinceSync,
          pending: devices.pendingChanges,
          lastSyncedAt: devices.lastSyncedAt,
        }),
    );
    if (row && row.pending > 0 && row.pushes >= STUCK_PUSHES) this.reportStuck(device, row);
  }

  /** A sync finished: the tablet has uploaded everything and is bringing in the server's changes. */
  async synced(device: DeviceContext, report: OutboxReport | null): Promise<void> {
    await withTenant(this.database.db, device.tenantId, (tx) =>
      tx
        .update(devices)
        .set({
          lastSyncedAt: sql`now()`,
          pushesSinceSync: 0,
          ...(report ? { pendingChanges: report.pending, oldestPendingAt: report.oldestAt } : {}),
        })
        .where(eq(devices.id, device.id)),
    );
  }

  private reportStuck(
    device: DeviceContext,
    row: { pushes: number; pending: number; lastSyncedAt: Date | null },
  ) {
    const last = this.reported.get(device.id) ?? 0;
    if (Date.now() - last < REPORT_EVERY_MS) return;
    this.reported.set(device.id, Date.now());
    this.logger.warn(
      `Tablet ${device.id} keeps uploading but its ${row.pending} changes aren't going in`,
    );
    Sentry.captureMessage('A tablet is online but its changes are not going through', {
      level: 'warning',
      tags: { tenant: device.tenantId, device: device.id },
      extra: {
        pending: row.pending,
        pushesSinceSync: row.pushes,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      },
    });
  }
}
