import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  and,
  dailyReports,
  eq,
  expenses,
  gte,
  lte,
  nextSyncCursor,
  orderItems,
  orders,
  payments,
  refunds,
  sql,
  tenants,
  withPlatform,
  withTenant,
  type Tx,
} from '@plateraa/db';
import * as Sentry from '@sentry/nestjs';
import { ENV, type Env } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { businessToday } from './business-day';
import { workOutDays, type DayFigures } from './figures';

/** The shape of `DayFigures`. Bump it when that changes, and every stored day is worked out again. */
export const REPORT_VERSION = 1;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** How far back the hourly run keeps days ready: enough for this month and last month. */
const READY_DAYS = 62;

/** Every day from `from` to `to`, both included, as YYYY-MM-DD. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

export const shiftDay = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Finished days' figures, worked out once and kept in `daily_reports` (plan.md §3.2). Today is
 * always worked out live.
 *
 * A kept day is used only while nothing on it has changed since. Every order, payment, refund,
 * order line and expense carries the transaction that last wrote it (`sync_xid`, from the sync
 * cursor). A day with anything written at or after its row's `as_of` is worked out again and
 * kept anew: a late refund, a link paid days later, an order a tablet uploads after being
 * offline, an expense typed in for last week.
 *
 * Reports fill in what's missing when they're read, so they're right whether or not the hourly
 * run (`RUN_DAILY_REPORTS`) is on; it only gets days ready before anyone asks.
 */
@Injectable()
export class DailyReports implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DailyReports.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | null = null;

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap() {
    if (!this.env.RUN_DAILY_REPORTS) return;
    // A minute after starting (Render wakes the API on a visit), then every hour.
    const soon = setTimeout(() => this.readySoon(), 60_000);
    const hourly = setInterval(() => this.readySoon(), HOUR_MS);
    soon.unref();
    hourly.unref();
    this.timers = [soon, hourly];
  }

  onApplicationShutdown() {
    for (const timer of this.timers) clearTimeout(timer);
  }

  private readySoon() {
    this.running ??= this.readyAll()
      .catch((error: unknown) => {
        this.logger.error('Getting daily reports ready failed', error as Error);
        Sentry.captureException(error);
      })
      .finally(() => {
        this.running = null;
      });
  }

  /** For every business, the last `READY_DAYS` finished days (from when it started). */
  async readyAll(): Promise<void> {
    const businesses = await withPlatform(this.database.db, (tx) =>
      tx
        .select({
          id: tenants.id,
          started: sql<string>`(${tenants.createdAt} at time zone ${tenants.timezone})::date::text`,
        })
        .from(tenants),
    );
    for (const business of businesses) {
      try {
        await withTenant(this.database.db, business.id, async (tx) => {
          const { date: today } = await businessToday(tx);
          const yesterday = shiftDay(today, -1);
          const earliest = shiftDay(today, -READY_DAYS);
          const from = business.started > earliest ? business.started : earliest;
          if (from <= yesterday) await this.days(tx, business.id, from, yesterday);
        });
      } catch (error) {
        this.logger.error(`Daily reports for ${business.id} failed`, error as Error);
        Sentry.captureException(error);
      }
    }
  }

  /**
   * The figures for every day from `from` to `to`. Finished days come from `daily_reports` while
   * they're still right; the rest are worked out now, and finished ones are kept for next time.
   * Run it inside `withTenant` for `tenantId`.
   */
  async days(
    tx: Tx,
    tenantId: string,
    from: string,
    to: string,
  ): Promise<{ today: string; timezone: string; days: Map<string, DayFigures> }> {
    const { date: today, timezone } = await businessToday(tx);
    // Read before any figures are: whatever they miss was written by a transaction at or after it.
    const [{ asOf } = { asOf: '0' }] = await tx.select({ asOf: nextSyncCursor }).from(tenants);

    const dates = daysBetween(from, to);
    const finished = dates.filter((date) => date < today);
    const days = new Map<string, DayFigures>();

    if (finished.length) {
      const first = finished[0]!;
      const last = finished.at(-1)!;
      const kept = (
        await tx
          .select()
          .from(dailyReports)
          .where(and(gte(dailyReports.businessDate, first), lte(dailyReports.businessDate, last)))
      ).filter((row) => row.version === REPORT_VERSION);
      if (kept.length) {
        const oldest = kept.reduce(
          (min, row) => (BigInt(row.asOf) < min ? BigInt(row.asOf) : min),
          BigInt(kept[0]!.asOf),
        );
        const changed = await lastChangeByDay(tx, oldest.toString(), first, last);
        for (const row of kept) {
          const lastChange = changed.get(row.businessDate);
          if (lastChange === undefined || lastChange < BigInt(row.asOf)) {
            days.set(row.businessDate, row.figures as unknown as DayFigures);
          }
        }
      }
    }

    const stale = finished.filter((date) => !days.has(date));
    const worked = await workOutDays(tx, timezone, [
      ...stale,
      ...dates.filter((date) => date >= today),
    ]);
    for (const [date, figures] of worked) days.set(date, figures);

    if (stale.length) {
      await tx
        .insert(dailyReports)
        .values(
          stale.map((date) => ({
            tenantId,
            businessDate: date,
            version: REPORT_VERSION,
            figures: worked.get(date)! as unknown as Record<string, unknown>,
            asOf,
          })),
        )
        .onConflictDoUpdate({
          target: [dailyReports.tenantId, dailyReports.businessDate],
          set: {
            version: sql`excluded.version`,
            figures: sql`excluded.figures`,
            asOf: sql`excluded.as_of`,
            computedAt: sql`now()`,
          },
        });
    }
    return { today, timezone, days };
  }
}

/**
 * For each day from `from` to `to`, the newest transaction that wrote anything on it at or after
 * `since`. It walks the sync indexes (tenant, sync_xid), so it only reads what changed since.
 */
async function lastChangeByDay(
  tx: Tx,
  since: string,
  from: string,
  to: string,
): Promise<Map<string, bigint>> {
  type Stamp =
    | typeof orders.syncXid
    | typeof payments.syncXid
    | typeof refunds.syncXid
    | typeof orderItems.syncXid
    | typeof expenses.syncXid;
  // xid8 has no max(); its text form is a plain number.
  const newest = (column: Stamp) => sql<string>`max(${column}::text::numeric)::text`;
  const after = (column: Stamp) => sql`${column} >= ${since}::xid8`;
  const inRange = and(gte(orders.businessDate, from), lte(orders.businessDate, to));

  const onOrders = await tx
    .select({ date: orders.businessDate, xid: newest(orders.syncXid) })
    .from(orders)
    .where(and(after(orders.syncXid), inRange))
    .groupBy(orders.businessDate);
  const onChildren = [];
  for (const child of [payments, refunds, orderItems]) {
    onChildren.push(
      ...(await tx
        .select({ date: orders.businessDate, xid: newest(child.syncXid) })
        .from(child)
        .innerJoin(orders, eq(orders.id, child.orderId))
        .where(and(after(child.syncXid), inRange))
        .groupBy(orders.businessDate)),
    );
  }
  const onExpenses = await tx
    .select({ date: expenses.spentOn, xid: newest(expenses.syncXid) })
    .from(expenses)
    .where(and(after(expenses.syncXid), gte(expenses.spentOn, from), lte(expenses.spentOn, to)))
    .groupBy(expenses.spentOn);

  const changed = new Map<string, bigint>();
  for (const row of [...onOrders, ...onChildren, ...onExpenses]) {
    const xid = BigInt(row.xid);
    const seen = changed.get(row.date);
    if (seen === undefined || xid > seen) changed.set(row.date, xid);
  }
  return changed;
}
