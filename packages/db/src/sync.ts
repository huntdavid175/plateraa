import { isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

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
 * Has anything changed for this tenant since the cursor? One index probe per table, each
 * stopping at the first row it finds, in a single expression — so a pull that has nothing to
 * send can say so without reading every table (16 Sep). Run it in the same transaction as the
 * reads it stands in for, so it answers from the same snapshot.
 */
export function anythingChangedSince(
  tables: readonly (PgTable & { syncXid: PgColumn })[],
  cursor: string | undefined,
): SQL<boolean> {
  // The first sync has nothing to compare against: everything is new to that tablet.
  if (!cursor) return sql<boolean>`true`;
  const probes = tables.map(
    (table) => sql`EXISTS (SELECT 1 FROM ${table} WHERE ${table.syncXid} >= ${cursor}::xid8)`,
  );
  return sql<boolean>`(${sql.join(probes, sql` OR `)})`;
}

/**
 * The cursor to hand back after a pull: the oldest transaction still running. Rows from it and
 * anything later are ≥ this value, so nothing still being written can be skipped. Run it inside
 * the same REPEATABLE READ transaction as the reads.
 */
export const nextSyncCursor = sql<string>`pg_snapshot_xmin(pg_current_snapshot())::text`;
