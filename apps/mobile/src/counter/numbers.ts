import type { Database } from '../offline/sql';

/**
 * The number called out at the counter: the tablet's letter and a count that starts again at 1
 * each trading day (A1, A2, …). Each tablet has its own letter, so two never hand out the same.
 */
export async function nextDisplayNumber(
  db: Database,
  deviceCode: string,
  businessDate: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const row = await tx.get<{ value: string }>(
      `SELECT value FROM meta WHERE key = 'order_number'`,
    );
    const n = countAfter(row?.value, businessDate);
    await tx.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('order_number', ?)`, [
      JSON.stringify({ date: businessDate, n }),
    ]);
    return `${deviceCode}${n}`;
  });
}

/** The number the next order will get, without using it up: for the order column's header. */
export function upcomingNumber(
  stored: string | undefined,
  deviceCode: string,
  businessDate: string,
): string {
  return `${deviceCode}${countAfter(stored, businessDate)}`;
}

function countAfter(stored: string | undefined, businessDate: string): number {
  const last = stored ? (JSON.parse(stored) as { date: string; n: number }) : null;
  return last?.date === businessDate ? last.n + 1 : 1;
}
