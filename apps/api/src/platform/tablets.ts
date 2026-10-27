import { sql, type Tx } from '@brixx/db';
import { tabletAlerts, type TabletAlert } from '../sync/tablet-health';

export interface PlatformTablet {
  id: string;
  tenantId: string;
  businessName: string;
  businessSlug: string;
  name: string;
  code: string;
  appVersion: string | null;
  lastSeenAt: string | null;
  lastSyncedAt: string | null;
  pendingChanges: number;
  oldestPendingAt: string | null;
  signedOut: boolean;
  alerts: TabletAlert[];
}

/**
 * Every tablet on the platform (or one business's), with the same warnings its owner sees on
 * Home. Read across businesses, so only for the admin console.
 */
export async function platformTablets(tx: Tx, tenantId?: string): Promise<PlatformTablet[]> {
  const only = tenantId ? sql`and d.tenant_id = ${tenantId}` : sql``;
  const { rows } = await tx.execute<{
    id: string;
    tenant_id: string;
    business_name: string;
    business_slug: string;
    name: string;
    code: string;
    app_version: string | null;
    last_seen_at: Date | null;
    last_synced_at: Date | null;
    pending_changes: number;
    oldest_pending_at: Date | null;
    pushes_since_sync: number;
    revoked_at: Date | null;
    drawer_open: boolean;
    refused: number;
  }>(sql`
    select d.id, d.tenant_id, t.name as business_name, t.slug as business_slug, d.name, d.code,
      d.app_version, d.last_seen_at, d.last_synced_at, d.pending_changes, d.oldest_pending_at,
      d.pushes_since_sync, d.revoked_at,
      exists (select 1 from shifts s where s.device_id = d.id and s.status = 'OPEN'
              and s.deleted_at is null) as drawer_open,
      (select count(*)::int from sync_commands c where c.device_id = d.id
         and c.status = 'REJECTED' and c.created_at > now() - interval '24 hours') as refused
    from devices d join tenants t on t.id = d.tenant_id
    where true ${only}
    order by t.name, d.code`);

  const iso = (at: Date | string | null) => (at ? new Date(at).toISOString() : null);
  const date = (at: Date | string | null) => (at ? new Date(at) : null);
  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    businessName: row.business_name,
    businessSlug: row.business_slug,
    name: row.name,
    code: row.code,
    appVersion: row.app_version,
    lastSeenAt: iso(row.last_seen_at),
    lastSyncedAt: iso(row.last_synced_at),
    pendingChanges: row.pending_changes,
    oldestPendingAt: iso(row.oldest_pending_at),
    signedOut: row.revoked_at !== null,
    alerts: tabletAlerts({
      signedOut: row.revoked_at !== null,
      drawerOpen: row.drawer_open,
      lastSeenAt: date(row.last_seen_at),
      pendingChanges: row.pending_changes,
      oldestPendingAt: date(row.oldest_pending_at),
      lastSyncedAt: date(row.last_synced_at),
      pushesSinceSync: row.pushes_since_sync,
      refused: row.refused,
    }),
  }));
}
