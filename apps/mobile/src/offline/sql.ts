/**
 * The local database. Each SQLite library (op-sqlite on the tablet, Node's built-in SQLite in
 * tests) only has to run one statement; `Database` adds what the offline engine relies on:
 * statements run one at a time, and a transaction never interleaves with anything else.
 */

export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

export interface SqlDriver {
  execute(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<{ rows: Row[]; rowsAffected: number }>;
  close(): void;
}

/** Reads and writes, inside a transaction or not. */
export interface Sql {
  all<T extends object = Row>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  get<T extends object = Row>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined>;
  /** Runs a statement and returns how many rows it changed. */
  run(sql: string, params?: readonly SqlValue[]): Promise<number>;
}

class DirectSql implements Sql {
  constructor(private readonly driver: SqlDriver) {}

  async all<T extends object = Row>(sql: string, params?: readonly SqlValue[]): Promise<T[]> {
    return (await this.driver.execute(sql, params)).rows as unknown as T[];
  }

  async get<T extends object = Row>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<T | undefined> {
    return (await this.all<T>(sql, params))[0];
  }

  async run(sql: string, params?: readonly SqlValue[]): Promise<number> {
    return (await this.driver.execute(sql, params)).rowsAffected;
  }
}

export class Database implements Sql {
  private readonly direct: DirectSql;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly driver: SqlDriver) {
    this.direct = new DirectSql(driver);
  }

  /** Runs `task` once everything queued before it has finished. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }

  all<T extends object = Row>(sql: string, params?: readonly SqlValue[]): Promise<T[]> {
    return this.serial(() => this.direct.all<T>(sql, params));
  }

  get<T extends object = Row>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined> {
    return this.serial(() => this.direct.get<T>(sql, params));
  }

  run(sql: string, params?: readonly SqlValue[]): Promise<number> {
    return this.serial(() => this.direct.run(sql, params));
  }

  /**
   * All or nothing. Inside `fn`, use only `tx`: calling the Database itself from in there waits
   * for this transaction to finish, which then never happens.
   */
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
    return this.serial(async () => {
      await this.driver.execute('BEGIN IMMEDIATE');
      try {
        const result = await fn(this.direct);
        await this.driver.execute('COMMIT');
        return result;
      } catch (error) {
        await this.driver.execute('ROLLBACK');
        throw error;
      }
    });
  }

  close(): void {
    this.driver.close();
  }
}

/** `?, ?, ?` for an `IN (…)` list. */
export const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');
