import { DatabaseSync } from 'node:sqlite';
import type { Row, SqlDriver } from '../sql';

/** The tests' SQLite: Node's built-in one, in memory. Same SQL as op-sqlite on the tablet. */
export function nodeSqliteDriver(path = ':memory:'): SqlDriver {
  const db = new DatabaseSync(path);
  return {
    async execute(sql, params = []) {
      const statement = db.prepare(sql);
      if (statement.columns().length > 0) {
        const rows = statement.all(...params).map((row) => ({ ...row }) as Row);
        return { rows, rowsAffected: 0 };
      }
      const { changes } = statement.run(...params);
      return { rows: [], rowsAffected: Number(changes) };
    },
    close: () => db.close(),
  };
}
