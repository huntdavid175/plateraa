import { open, type Scalar } from '@op-engineering/op-sqlite';
import type { Row, SqlDriver } from './sql';

/** The tablet's SQLite: one op-sqlite connection to the app's database file. */
export function opSqliteDriver(name = 'plateraa.sqlite'): SqlDriver {
  const db = open({ name });
  return {
    async execute(sql, params = []) {
      const result = await db.execute(sql, [...params] as Scalar[]);
      return { rows: result.rows as Row[], rowsAffected: result.rowsAffected };
    },
    close: () => db.close(),
  };
}
