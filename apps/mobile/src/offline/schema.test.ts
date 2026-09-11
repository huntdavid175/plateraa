import { describe, expect, it } from 'vitest';
import { openLocalDatabase, resetLocalData } from './schema';
import { nodeSqliteDriver } from './testing/node-sqlite';

describe('resetLocalData', () => {
  it('empties every table, so nothing from an earlier registration stays', async () => {
    const db = await openLocalDatabase(nodeSqliteDriver());
    await db.run(`INSERT INTO items (id, name) VALUES ('i', 'Jollof rice')`);
    await db.run(`INSERT INTO meta (key, value) VALUES ('cursor', '42')`);
    await db.run(
      `INSERT INTO outbox (id, type, payload, staff_id, device_ts, status)
       VALUES ('c', 'order.hold', '{}', 's', '2026-09-17T10:00:00Z', 'PENDING')`,
    );
    await db.run(`INSERT INTO pin_attempts (staff_id, verifier, failures) VALUES ('s', 'v', 3)`);

    await resetLocalData(db);

    for (const table of ['items', 'meta', 'outbox', 'pin_attempts']) {
      expect(await db.all(`SELECT * FROM ${table}`), table).toEqual([]);
    }
  });
});
