import {
  MAX_COMMANDS_PER_PUSH,
  businessDateOf,
  syncCommandSchema,
  type SyncCommand,
  type SyncCommandInput,
  type SyncCommandType,
} from '@plateraa/shared';
import { ulid } from 'ulid';
import { LocalRejection, applyCommand } from './commands';
import type { OutboxRow } from './rows';
import type { Database, Sql } from './sql';
import {
  CommandWriter,
  applyServerChanges,
  confirmApplied,
  rebuild,
  replaceAll,
  type PullChanges,
  type Replay,
} from './store';
import { TransportError, type PushOutcome, type SyncTransport } from './transport';

export type CommandPayload<T extends SyncCommandType> = Extract<
  SyncCommandInput,
  { type: T }
>['payload'];

export interface SyncState {
  /** How the last attempt to reach the server went. */
  connection: 'unknown' | 'online' | 'offline' | 'signed-out';
  /** Changes made on this tablet that the server hasn't taken yet. */
  pending: number;
  /** Changes the server refused, waiting under "Needs attention". */
  needsAttention: number;
  /** When the tablet last brought in the server's changes. */
  lastSyncedAt: string | null;
  syncing: boolean;
  /** Goes up whenever the local tables change, so screens know to read them again. */
  dataVersion: number;
}

export interface RefusedCommand {
  id: string;
  type: SyncCommandType;
  payload: SyncCommand['payload'];
  staffId: string;
  at: string;
  code: string;
  message: string;
}

/** The screen built a command the schema doesn't accept: a bug in the screen, not the vendor's fault. */
export class InvalidCommandError extends Error {
  override name = 'InvalidCommandError';
}

export interface SyncEngineOptions {
  db: Database;
  transport: SyncTransport;
  deviceId: string;
  /** The business's timezone, for its trading day. */
  timezone?: string;
  newId?: () => string;
  now?: () => Date;
  /** How often to fetch the server's changes while the app is open. */
  pullEveryMs?: number;
  /** Waits this long after a change before uploading, so a burst of taps goes up together. */
  pushDelayMs?: number;
  /** Unexpected failures (bugs), for error reporting. */
  onError?: (error: unknown) => void;
}

const HOUR_MS = 3_600_000;
const FIRST_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
/** While the server can't be reached, a new change still tries it, but not more often than this. */
const RETRY_WHILE_FAILING_MS = 5_000;

/** The server asked for part of an upload to be sent again later. */
class RetryLater extends Error {
  override name = 'RetryLater';
}

function commandOf(row: OutboxRow): SyncCommand {
  return {
    id: row.id,
    deviceSeq: row.seq,
    deviceTs: row.device_ts,
    staffId: row.staff_id,
    type: row.type,
    payload: JSON.parse(row.payload),
  } as SyncCommand;
}

async function setMeta(tx: Sql, key: string, value: string): Promise<void> {
  await tx.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

/**
 * The tablet's offline engine. Every change is a sync command: applied to the local database at
 * once, kept in the outbox, and uploaded in order, at most 50 at a time. Uploads are followed by
 * a pull of everything that changed on the server. A command the server refuses is undone and
 * listed under "Needs attention"; it is never sent again.
 */
export class SyncEngine {
  readonly db: Database;
  readonly newId: () => string;
  private readonly transport: SyncTransport;
  private readonly deviceId: string;
  private readonly timezone: string;
  private readonly now: () => Date;
  private readonly pullEveryMs: number;
  private readonly pushDelayMs: number;
  private readonly onError: (error: unknown) => void;

  private state: SyncState = {
    connection: 'unknown',
    pending: 0,
    needsAttention: 0,
    lastSyncedAt: null,
    syncing: false,
    dataVersion: 0,
  };
  private readonly listeners = new Set<(state: SyncState) => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private started = false;
  private foreground = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private lastAttemptAt = 0;

  constructor(options: SyncEngineOptions) {
    this.db = options.db;
    this.transport = options.transport;
    this.deviceId = options.deviceId;
    this.timezone = options.timezone ?? 'Africa/Accra';
    this.newId = options.newId ?? (() => ulid());
    this.now = options.now ?? (() => new Date());
    this.pullEveryMs = options.pullEveryMs ?? 30_000;
    this.pushDelayMs = options.pushDelayMs ?? 300;
    this.onError = options.onError ?? ((error) => console.warn('Sync failed', error));
  }

  getState(): SyncState {
    return this.state;
  }

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reads what the last run left behind. Call once, before anything else. */
  async init(): Promise<void> {
    const synced = await this.db.get<{ value: string }>(
      `SELECT value FROM meta WHERE key = 'last_synced_at'`,
    );
    this.setState({ lastSyncedAt: synced?.value ?? null });
    await this.refreshCounts();
  }

  /** Syncs now, then keeps syncing: after each change, and every 30 s while in the foreground. */
  start(): void {
    this.started = true;
    this.foreground = true;
    this.schedule(0);
  }

  stop(): void {
    this.started = false;
    this.clearTimer();
  }

  /** Call from the app's AppState: pulls pause in the background and catch up on return. */
  setForeground(active: boolean): void {
    this.foreground = active;
    if (!this.started) return;
    if (active) this.schedule(0);
    else this.clearTimer();
  }

  /**
   * Records a change made at the counter by `staffId`: applied locally straight away, then
   * uploaded. Throws `LocalRejection` (nothing saved) when the tablet can already tell the server
   * would refuse it, e.g. taking more money than is owed.
   */
  async record<T extends SyncCommandType>(
    type: T,
    payload: CommandPayload<T>,
    staffId: string,
  ): Promise<string> {
    const parsed = syncCommandSchema.safeParse({
      id: this.newId(),
      deviceSeq: 0, // The outbox numbers commands as they're saved.
      deviceTs: this.now().toISOString(),
      staffId,
      type,
      payload,
    });
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new InvalidCommandError(`${type}: ${problems.join('; ')}`);
    }
    const command = parsed.data;

    await this.db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO outbox (id, type, payload, staff_id, device_ts, status)
         VALUES (?, ?, ?, ?, ?, 'PENDING')`,
        [
          command.id,
          command.type,
          JSON.stringify(command.payload),
          command.staffId,
          command.deviceTs,
        ],
      );
      await applyCommand({
        writer: new CommandWriter(tx, command.id),
        command,
        deviceId: this.deviceId,
        newId: this.newId,
      });
    });
    this.touchData();
    await this.refreshCounts();
    if (this.started) this.schedule(this.pushDelayMs);
    return command.id;
  }

  async needsAttention(): Promise<RefusedCommand[]> {
    const rows = await this.db.all<OutboxRow>(
      `SELECT * FROM outbox WHERE status = 'REJECTED' ORDER BY seq`,
    );
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      staffId: row.staff_id,
      at: row.device_ts,
      code: row.error_code ?? 'REJECTED',
      message: row.error_message ?? '',
    }));
  }

  /** Someone has seen a refusal; it leaves the list. */
  async dismiss(commandId: string): Promise<void> {
    await this.db.run(
      `UPDATE outbox SET status = 'DISMISSED', resolved_at = ? WHERE id = ? AND status = 'REJECTED'`,
      [this.now().toISOString(), commandId],
    );
    await this.refreshCounts();
  }

  /**
   * Uploads what's waiting, then brings in the server's changes. Never throws: how it went is in
   * the state. If a sync is already running, it runs once more when that one finishes.
   */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.clearTimer();
    this.running = this.cycle().finally(() => {
      this.running = null;
      this.scheduleNext();
    });
    return this.running;
  }

  private async cycle(): Promise<void> {
    this.setState({ syncing: true });
    this.lastAttemptAt = Date.now();
    try {
      do {
        this.again = false;
        await this.pushWaiting();
        await this.pull();
      } while (this.again);
      this.failures = 0;
      this.setState({ connection: 'online' });
    } catch (error) {
      this.failures += 1;
      if (error instanceof TransportError) {
        this.setState({ connection: error.kind === 'unauthorized' ? 'signed-out' : 'offline' });
      } else if (error instanceof RetryLater) {
        this.setState({ connection: 'online' });
      } else {
        this.onError(error);
      }
    } finally {
      await this.refreshCounts();
      this.setState({ syncing: false });
    }
  }

  private async pushWaiting(): Promise<void> {
    for (;;) {
      const batch = await this.db.all<OutboxRow>(
        `SELECT * FROM outbox WHERE status = 'PENDING' ORDER BY seq LIMIT ${MAX_COMMANDS_PER_PUSH}`,
      );
      if (!batch.length) return;
      const outcomes = await this.send(batch);
      const finished = await this.db.transaction((tx) => this.recordOutcomes(tx, batch, outcomes));
      if (finished < batch.length) throw new RetryLater('The server will take the rest later');
    }
  }

  private async send(batch: OutboxRow[]): Promise<PushOutcome[]> {
    try {
      return await this.transport.push(
        batch.map((row) => commandOf(row) as unknown as SyncCommandInput),
      );
    } catch (error) {
      if (!(error instanceof TransportError) || error.kind !== 'invalid') throw error;
      // The server couldn't read the batch. Send one at a time, so one bad command can't hold up
      // the rest; the one it can't read is refused.
      if (batch.length === 1) {
        return [
          {
            id: batch[0]!.id,
            status: 'REJECTED',
            error: { code: 'INVALID_COMMAND', message: error.message },
          },
        ];
      }
      const outcomes: PushOutcome[] = [];
      for (const row of batch) {
        const [outcome] = await this.send([row]);
        if (!outcome) break;
        outcomes.push(outcome);
        if (outcome.status === 'RETRY') break;
      }
      return outcomes;
    }
  }

  /** Saves the server's answers; returns how many commands it finished with. */
  private async recordOutcomes(
    tx: Sql,
    batch: OutboxRow[],
    outcomes: PushOutcome[],
  ): Promise<number> {
    const now = this.now().toISOString();
    const byId = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
    let finished = 0;
    let refused = false;
    for (const row of batch) {
      const outcome = byId.get(row.id);
      if (!outcome) continue; // After a RETRY the server stops; the rest go next time.
      if (outcome.status === 'APPLIED') {
        await tx.run(
          `UPDATE outbox SET status = 'APPLIED', result = ?, resolved_at = ? WHERE id = ?`,
          [JSON.stringify(outcome.result), now, row.id],
        );
        finished += 1;
      } else if (outcome.status === 'REJECTED') {
        await tx.run(
          `UPDATE outbox SET status = 'REJECTED', error_code = ?, error_message = ?, resolved_at = ?
           WHERE id = ?`,
          [outcome.error.code, outcome.error.message, now, row.id],
        );
        finished += 1;
        refused = true;
      } else {
        await tx.run(
          `UPDATE outbox SET attempts = attempts + 1, error_code = ?, error_message = ? WHERE id = ?`,
          [outcome.error.code, outcome.error.message, row.id],
        );
      }
    }
    if (refused) {
      await rebuild(tx, this.replay, this.skipped);
      this.touchData();
    }
    return finished;
  }

  private async pull(): Promise<void> {
    const cursor =
      (await this.db.get<{ value: string }>(`SELECT value FROM meta WHERE key = 'cursor'`))
        ?.value ?? null;
    // Commands the server has taken so far; this pull carries their results.
    const applied = await this.db.get<{ seq: number | null }>(
      `SELECT max(seq) AS seq FROM outbox WHERE status = 'APPLIED'`,
    );

    let response;
    try {
      response = await this.transport.pull(cursor);
    } catch (error) {
      // A cursor the server can't read: start again from a full snapshot.
      if (error instanceof TransportError && error.kind === 'invalid') {
        await this.db.run(`DELETE FROM meta WHERE key = 'cursor'`);
      }
      throw error;
    }

    const now = this.now();
    await this.db.transaction(async (tx) => {
      if (cursor === null) await replaceAll(tx, response.changes);
      else await applyServerChanges(tx, response.changes);
      await confirmApplied(tx, applied?.seq ?? 0, now.toISOString());
      // A snapshot replaced everything, so apply what's still waiting to upload on top again.
      if (cursor === null) await rebuild(tx, this.replay, this.skipped);
      await setMeta(tx, 'cursor', response.cursor);
      await setMeta(tx, 'last_synced_at', now.toISOString());
      await this.prune(tx, now);
    });
    this.setState({ lastSyncedAt: now.toISOString() });
    if (cursor === null || hasRows(response.changes)) this.touchData();
  }

  /**
   * The tablet keeps today's work, yesterday's, and anything still open. Older finished orders
   * and old closed drawer shifts are cleared once the server has them: a row with a change it
   * hasn't confirmed is locked, and never cleared. Outbox entries go once confirmed; refusals
   * stay under "Needs attention" until someone dismisses them.
   */
  private async prune(tx: Sql, now: Date): Promise<void> {
    const yesterday = businessDateOf(new Date(now.getTime() - 24 * HOUR_MS), this.timezone);
    const oldOrders = `SELECT id FROM orders
      WHERE business_date < ? AND status IN ('COMPLETED', 'CANCELLED', 'REFUNDED')
        AND id NOT IN (SELECT row_id FROM row_locks WHERE tbl = 'orders')`;
    for (const table of ['order_items', 'payments', 'refunds']) {
      await tx.run(`DELETE FROM ${table} WHERE order_id IN (${oldOrders})`, [yesterday]);
    }
    await tx.run(`DELETE FROM orders WHERE id IN (${oldOrders})`, [yesterday]);

    const shiftCutoff = new Date(now.getTime() - 36 * HOUR_MS).toISOString();
    const oldShifts = `SELECT id FROM shifts WHERE status = 'CLOSED' AND opened_at < ?
        AND id NOT IN (SELECT row_id FROM row_locks WHERE tbl = 'shifts')`;
    await tx.run(`DELETE FROM cash_movements WHERE shift_id IN (${oldShifts})`, [shiftCutoff]);
    await tx.run(`DELETE FROM shifts WHERE id IN (${oldShifts})`, [shiftCutoff]);

    await tx.run(`DELETE FROM outbox WHERE status = 'SYNCED'`);
    await tx.run(`DELETE FROM outbox WHERE status = 'DISMISSED' AND resolved_at < ?`, [
      new Date(now.getTime() - 48 * HOUR_MS).toISOString(),
    ]);
  }

  private readonly replay: Replay = (writer, row) =>
    applyCommand({ writer, command: commandOf(row), deviceId: this.deviceId, newId: this.newId });

  private readonly skipped = (_command: OutboxRow, error: unknown) => {
    if (!(error instanceof LocalRejection)) this.onError(error);
  };

  /** Sync after `delay` ms. While the server can't be reached, not more often than every 5 s. */
  private schedule(delay: number): void {
    if (this.running) {
      this.again = true;
      return;
    }
    const earliest =
      this.failures > 0 ? this.lastAttemptAt + RETRY_WHILE_FAILING_MS - Date.now() : 0;
    this.setTimer(Math.max(delay, earliest));
  }

  private scheduleNext(): void {
    if (!this.started || this.state.connection === 'signed-out') return;
    if (this.failures > 0) {
      const backoff = Math.min(MAX_BACKOFF_MS, FIRST_BACKOFF_MS * 2 ** (this.failures - 1));
      this.setTimer(backoff * (0.8 + Math.random() * 0.4));
    } else if (this.foreground) {
      this.setTimer(this.pullEveryMs);
    }
  }

  private setTimer(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async refreshCounts(): Promise<void> {
    const counts = await this.db.get<{ pending: number | null; refused: number | null }>(
      `SELECT sum(status = 'PENDING') AS pending, sum(status = 'REJECTED') AS refused FROM outbox`,
    );
    this.setState({ pending: counts?.pending ?? 0, needsAttention: counts?.refused ?? 0 });
  }

  private touchData(): void {
    this.setState({ dataVersion: this.state.dataVersion + 1 });
  }

  private setState(changes: Partial<SyncState>): void {
    const keys = Object.keys(changes) as (keyof SyncState)[];
    if (keys.every((key) => this.state[key] === changes[key])) return;
    this.state = { ...this.state, ...changes };
    for (const listener of this.listeners) listener(this.state);
  }
}

function hasRows(changes: PullChanges): boolean {
  return Object.values(changes).some((rows) => rows && rows.length > 0);
}
