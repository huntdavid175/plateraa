import { isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * The pull filter for a synced table. With a cursor: every row written since (deletions
 * included, via deleted_at). Without one (first sync): every row that isn't deleted.
 * Pass the table itself; synced tables all have sync_xid and deleted_at.
 */
export function changedSince(
  table: { syncXid: PgColumn; deletedAt: PgColumn },
  cursor: string | undefined,
): SQL {
  return cursor ? sql`${table.syncXid} >= ${cursor}::xid8` : isNull(table.deletedAt);
}

/**
 * The cursor to hand back after a pull: the oldest transaction still running. Rows from it and
 * anything later are ≥ this value, so nothing still being written can be skipped. Run it inside
 * the same REPEATABLE READ transaction as the reads.
 */
export const nextSyncCursor = sql<string>`pg_snapshot_xmin(pg_current_snapshot())::text`;
