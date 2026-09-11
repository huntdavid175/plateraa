import type { OutboxRow } from './rows';
import { SYNCED_TABLES, columnOf, type SyncedTable, type SyncedTableName } from './schema';
import type { Row, Sql, SqlValue } from './sql';

/**
 * How the tablet shows its own changes at once yet always ends up with the server's figures.
 *
 * A command is applied to the local tables straight away. The first time a command that the
 * server hasn't confirmed touches a row, the row as the server last sent it is kept aside as a
 * "shadow", and the row is locked by that command. While a row is locked, updates to it from a
 * pull go into the shadow instead, so the tablet keeps showing its own change.
 *
 * Once the server has taken the command and a later pull has brought back the result, the lock
 * is released and the shadow (now the server's version) replaces the row. If the server refuses
 * the command, every row goes back to its shadow and the commands still waiting are applied
 * again on top, so the refused one leaves no trace.
 */

export type ServerRow = Record<string, unknown>;
export type PullChanges = Record<string, ServerRow[] | undefined>;

function toSqlValue(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** A server row as the tablet stores it, or null if it can't be stored (no id). */
export function toLocalRow(table: SyncedTable, serverRow: ServerRow): Row | null {
  const id = table.singletonId ?? serverRow.id;
  if (typeof id !== 'string') return null;
  const row: Row = { id };
  for (const field of table.fields) row[columnOf(field)] = toSqlValue(serverRow[field]);
  return row;
}

export async function upsertRow(tx: Sql, table: string, row: Row): Promise<void> {
  const columns = Object.keys(row);
  await tx.run(
    `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => row[column] ?? null),
  );
}

async function isLocked(tx: Sql, table: string, id: string): Promise<boolean> {
  return Boolean(
    await tx.get('SELECT 1 AS locked FROM row_locks WHERE tbl = ? AND row_id = ? LIMIT 1', [
      table,
      id,
    ]),
  );
}

async function setShadow(tx: Sql, table: string, id: string, row: Row | null): Promise<void> {
  await tx.run('INSERT OR REPLACE INTO shadows (tbl, row_id, data) VALUES (?, ?, ?)', [
    table,
    id,
    row ? JSON.stringify(row) : null,
  ]);
}

/** Puts the server's version of a row back (or removes the row if the server hasn't got it). */
async function restoreShadow(tx: Sql, table: string, id: string): Promise<void> {
  const shadow = await tx.get<{ data: string | null }>(
    'SELECT data FROM shadows WHERE tbl = ? AND row_id = ?',
    [table, id],
  );
  if (!shadow) return;
  if (shadow.data === null) await tx.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  else await upsertRow(tx, table, JSON.parse(shadow.data) as Row);
  await tx.run('DELETE FROM shadows WHERE tbl = ? AND row_id = ?', [table, id]);
}

/** Writes one command's effects, locking every row it touches. */
export class CommandWriter {
  constructor(
    readonly tx: Sql,
    private readonly commandId: string,
  ) {}

  private async lock(table: SyncedTableName, id: string): Promise<void> {
    if (!(await isLocked(this.tx, table, id))) {
      const current = await this.tx.get<Row>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      await setShadow(this.tx, table, id, current ?? null);
    }
    await this.tx.run(
      'INSERT OR IGNORE INTO row_locks (tbl, row_id, command_id) VALUES (?, ?, ?)',
      [table, id, this.commandId],
    );
  }

  /** Adds a row, or replaces it whole. */
  async put(table: SyncedTableName, row: Row & { id: string }): Promise<void> {
    await this.lock(table, row.id);
    await upsertRow(this.tx, table, row);
  }

  async update(table: SyncedTableName, id: string, changes: Row): Promise<void> {
    await this.lock(table, id);
    const columns = Object.keys(changes);
    await this.tx.run(
      `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
      [...columns.map((column) => changes[column] ?? null), id],
    );
  }

  async delete(table: SyncedTableName, id: string): Promise<void> {
    await this.lock(table, id);
    await this.tx.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  }
}

/** Writes pulled rows: straight in, or into the shadow while an unconfirmed command holds the row. */
export async function applyServerChanges(tx: Sql, changes: PullChanges): Promise<void> {
  const locked = new Set(
    (
      await tx.all<{ key: string }>(`SELECT DISTINCT tbl || ':' || row_id AS key FROM row_locks`)
    ).map((row) => row.key),
  );
  for (const table of SYNCED_TABLES) {
    for (const serverRow of changes[table.pullKey] ?? []) {
      const row = toLocalRow(table, serverRow);
      if (!row) continue;
      const id = row.id as string;
      const deleted = serverRow.deletedAt !== undefined && serverRow.deletedAt !== null;
      if (locked.has(`${table.name}:${id}`))
        await setShadow(tx, table.name, id, deleted ? null : row);
      else if (deleted) await tx.run(`DELETE FROM ${table.name} WHERE id = ?`, [id]);
      else await upsertRow(tx, table.name, row);
    }
  }
}

/** A full snapshot from the server replaces everything the tablet had. */
export async function replaceAll(tx: Sql, changes: PullChanges): Promise<void> {
  for (const table of SYNCED_TABLES) await tx.run(`DELETE FROM ${table.name}`);
  await tx.run('DELETE FROM shadows');
  await tx.run('DELETE FROM row_locks');
  await applyServerChanges(tx, changes);
}

/**
 * The server has taken these commands and the pull just applied carries their results: their
 * rows go back to the server's version, unless a later command still waiting holds them too.
 */
export async function confirmApplied(tx: Sql, upToSeq: number, now: string): Promise<void> {
  const applied = `SELECT id FROM outbox WHERE status = 'APPLIED' AND seq <= ?`;
  const touched = await tx.all<{ tbl: string; row_id: string }>(
    `SELECT DISTINCT tbl, row_id FROM row_locks WHERE command_id IN (${applied})`,
    [upToSeq],
  );
  await tx.run(`DELETE FROM row_locks WHERE command_id IN (${applied})`, [upToSeq]);
  for (const { tbl, row_id } of touched) {
    if (!(await isLocked(tx, tbl, row_id))) await restoreShadow(tx, tbl, row_id);
  }
  await tx.run(
    `UPDATE outbox SET status = 'SYNCED', resolved_at = ? WHERE status = 'APPLIED' AND seq <= ?`,
    [now, upToSeq],
  );
}

export type Replay = (writer: CommandWriter, command: OutboxRow) => Promise<void>;

/**
 * Puts every row back to the server's version, then applies the commands the server hasn't
 * refused again, in order. A command that no longer applies (the order was cancelled meanwhile,
 * say) is skipped here; the server has the final word on it.
 */
export async function rebuild(
  tx: Sql,
  replay: Replay,
  onSkipped: (command: OutboxRow, error: unknown) => void,
): Promise<void> {
  for (const { tbl, row_id } of await tx.all<{ tbl: string; row_id: string }>(
    'SELECT tbl, row_id FROM shadows',
  )) {
    await restoreShadow(tx, tbl, row_id);
  }
  await tx.run('DELETE FROM row_locks');

  const waiting = await tx.all<OutboxRow>(
    `SELECT * FROM outbox WHERE status IN ('PENDING', 'APPLIED') ORDER BY seq`,
  );
  for (const command of waiting) {
    await tx.run('SAVEPOINT replay');
    try {
      await replay(new CommandWriter(tx, command.id), command);
      await tx.run('RELEASE replay');
    } catch (error) {
      await tx.run('ROLLBACK TO replay');
      await tx.run('RELEASE replay');
      onSkipped(command, error);
    }
  }
}

/** SQL that is true while a row shows changes the server hasn't confirmed yet ("provisional"). */
export const provisionalSql = (table: SyncedTableName, idColumn: string) =>
  `EXISTS (SELECT 1 FROM row_locks WHERE tbl = '${table}' AND row_id = ${idColumn})`;
