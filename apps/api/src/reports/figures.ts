import {
  and,
  eq,
  expenses,
  inArray,
  isNull,
  ne,
  orderItems,
  orders,
  payments,
  platformReceivables,
  refunds,
  sql,
  type Tx,
} from '@plateraa/db';
import {
  ORDER_TYPES,
  type ExpenseCategory,
  type OrderSource,
  type OrderType,
  type PaymentMethod,
} from '@plateraa/shared';
import { countsAsSale, dueSql } from './business-day';

/**
 * One trading day's figures, in pesewas: what the day summary shows, and what a range of days
 * adds up. Kept as it is in `daily_reports.figures`, so change `REPORT_VERSION` in daily.ts
 * whenever this changes shape or meaning.
 *
 * Everything hangs off the orders' trading day, so a link paid late counts on the day its order
 * was taken. Expenses count on the day they were spent.
 */
export interface DayFigures {
  /** Orders that count as sales (not cancelled or refunded). */
  orders: number;
  /** What those orders are worth to the vendor. */
  sales: number;
  /** Still owed by customers on those orders. */
  unpaid: number;
  /** Cash and payment-link money collected on the day's orders, less refunds given back. */
  moneyIn: number;
  /** Paid via Bolt Food or Chowdeck: they owe it and pay it out later. */
  platformOwed: number;
  /** What Bolt Food and Chowdeck are expected to keep, where the owner set a commission. */
  commissionEstimate: number;
  /** The day's expenses, drawer payouts included. */
  moneyOut: number;
  /** How many expenses. */
  expenses: number;
  /** Expenses that bought stock. */
  purchases: number;
  /** Money in by the hour each order was taken, in the business's timezone. */
  byHour: { hour: number; moneyIn: number }[];
  bySource: { source: OrderSource; orders: number; sales: number }[];
  /** Dine-in, pickup and delivery, in that order. */
  byType: { type: OrderType; orders: number; sales: number }[];
  byMethod: { method: PaymentMethod; amount: number }[];
  /** Every item sold, best sellers first. */
  byItem: { name: string; quantity: number; sales: number }[];
  byCategory: { category: ExpenseCategory; amount: number }[];
  /** Orders each person took, and the cash they took on the day's orders. */
  staff: { staffId: string; orders: number; sales: number; cash: number }[];
}

export function emptyDay(): DayFigures {
  return {
    orders: 0,
    sales: 0,
    unpaid: 0,
    moneyIn: 0,
    platformOwed: 0,
    commissionEstimate: 0,
    moneyOut: 0,
    expenses: 0,
    purchases: 0,
    byHour: [],
    bySource: [],
    byType: [],
    byMethod: [],
    byItem: [],
    byCategory: [],
    staff: [],
  };
}

/** A Postgres sum (bigint, which arrives as a string) as a number. */
const n = (value: string | number | null | undefined) => Number(value ?? 0);

/** Adds orders and sales to the entry `matches` finds in `list`, making it if there's none. */
function tallyInto<T extends { orders: number; sales: number }>(
  list: T[],
  matches: (entry: T) => boolean,
  fresh: () => T,
  orders: number,
  sales: number,
) {
  let entry = list.find(matches);
  if (!entry) {
    entry = fresh();
    list.push(entry);
  }
  entry.orders += orders;
  entry.sales += sales;
}

/**
 * Works out the figures for each of `dates` from the orders, payments, refunds and expenses
 * themselves. The same queries whether it's one day or ninety: each is grouped by day.
 */
export async function workOutDays(
  tx: Tx,
  timezone: string,
  dates: string[],
): Promise<Map<string, DayFigures>> {
  const days = new Map(dates.map((date) => [date, emptyDay()]));
  if (!dates.length) return days;
  const day = (date: string) => days.get(date)!;

  const ofDays = and(inArray(orders.businessDate, dates), isNull(orders.deletedAt));
  const sales = and(ofDays, countsAsSale);
  // Money already taken on a cancelled order still counts until the refund is recorded.
  const confirmed = and(ofDays, eq(payments.status, 'CONFIRMED'), isNull(payments.deletedAt));
  const spent = and(inArray(expenses.spentOn, dates), isNull(expenses.deletedAt));
  const hourTaken = sql<number>`extract(hour from ${orders.createdAtDevice} at time zone ${timezone})::int`;

  // Where the orders came from and how the customers got them, in one pass.
  const byKind = await tx
    .select({
      date: orders.businessDate,
      source: orders.source,
      type: orders.type,
      orders: sql<number>`count(*)::int`,
      sales: sql<string>`sum(${dueSql})`,
      unpaid: sql<string>`sum(greatest(${dueSql} - ${orders.amountPaid}, 0))`,
    })
    .from(orders)
    .where(sales)
    .groupBy(orders.businessDate, orders.source, orders.type);

  const byMethod = await tx
    .select({
      date: orders.businessDate,
      method: payments.method,
      amount: sql<string>`sum(${payments.amount})`,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(confirmed)
    .groupBy(orders.businessDate, payments.method);

  // Grouped by position: the hour's expression carries the timezone as a parameter.
  const collectedByHour = await tx
    .select({
      date: orders.businessDate,
      hour: hourTaken,
      amount: sql<string>`sum(${payments.amount})`,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(confirmed, ne(payments.method, 'PLATFORM')))
    .groupBy(sql`1, 2`);

  const refundedByHour = await tx
    .select({
      date: orders.businessDate,
      hour: hourTaken,
      amount: sql<string>`sum(${refunds.amount})`,
    })
    .from(refunds)
    .innerJoin(orders, eq(orders.id, refunds.orderId))
    .where(and(ofDays, isNull(refunds.deletedAt), ne(refunds.method, 'PLATFORM')))
    .groupBy(sql`1, 2`);

  const owed = await tx
    .select({
      date: orders.businessDate,
      gross: sql<string>`sum(${platformReceivables.gross})`,
      commission: sql<string>`coalesce(sum(${platformReceivables.commissionEstimate}), 0)`,
    })
    .from(platformReceivables)
    .innerJoin(orders, eq(orders.id, platformReceivables.orderId))
    .where(sales)
    .groupBy(orders.businessDate);

  const out = await tx
    .select({
      date: expenses.spentOn,
      total: sql<string>`sum(${expenses.amount})`,
      count: sql<number>`count(*)::int`,
      purchases: sql<string>`coalesce(sum(${expenses.amount}) filter (where ${expenses.stockItemId} is not null), 0)`,
    })
    .from(expenses)
    .where(spent)
    .groupBy(expenses.spentOn);

  const byCategory = await tx
    .select({
      date: expenses.spentOn,
      category: expenses.category,
      amount: sql<string>`sum(${expenses.amount})`,
    })
    .from(expenses)
    .where(spent)
    .groupBy(expenses.spentOn, expenses.category);

  const byItem = await tx
    .select({
      date: orders.businessDate,
      name: orderItems.name,
      quantity: sql<number>`sum(${orderItems.quantity})::int`,
      sales: sql<string>`sum(${orderItems.lineTotal})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(sales, isNull(orderItems.deletedAt)))
    .groupBy(orders.businessDate, orderItems.name);

  const takenBy = await tx
    .select({
      date: orders.businessDate,
      staffId: orders.createdBy,
      orders: sql<number>`count(*)::int`,
      sales: sql<string>`sum(${dueSql})`,
    })
    .from(orders)
    .where(sales)
    .groupBy(orders.businessDate, orders.createdBy);

  const cashBy = await tx
    .select({
      date: orders.businessDate,
      staffId: payments.collectedBy,
      amount: sql<string>`sum(${payments.amount})`,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(confirmed, eq(payments.method, 'CASH')))
    .groupBy(orders.businessDate, payments.collectedBy);

  for (const row of byKind) {
    const d = day(row.date);
    d.orders += row.orders;
    d.sales += n(row.sales);
    d.unpaid += n(row.unpaid);
    tallyInto(
      d.bySource,
      (entry) => entry.source === row.source,
      () => ({ source: row.source, orders: 0, sales: 0 }),
      row.orders,
      n(row.sales),
    );
    tallyInto(
      d.byType,
      (entry) => entry.type === row.type,
      () => ({ type: row.type, orders: 0, sales: 0 }),
      row.orders,
      n(row.sales),
    );
  }
  for (const row of byMethod) {
    day(row.date).byMethod.push({ method: row.method, amount: n(row.amount) });
  }

  const hours = new Map<string, Map<number, number>>();
  const addHour = (date: string, hour: number, amount: number) => {
    const ofDay = hours.get(date) ?? new Map<number, number>();
    ofDay.set(hour, (ofDay.get(hour) ?? 0) + amount);
    hours.set(date, ofDay);
  };
  for (const row of collectedByHour) addHour(row.date, row.hour, n(row.amount));
  for (const row of refundedByHour) addHour(row.date, row.hour, -n(row.amount));
  for (const [date, ofDay] of hours) {
    const d = day(date);
    d.byHour = [...ofDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, moneyIn]) => ({ hour, moneyIn }));
    d.moneyIn = d.byHour.reduce((sum, hour) => sum + hour.moneyIn, 0);
  }

  for (const row of owed) {
    const d = day(row.date);
    d.platformOwed = n(row.gross);
    d.commissionEstimate = n(row.commission);
  }
  for (const row of out) {
    const d = day(row.date);
    d.moneyOut = n(row.total);
    d.expenses = row.count;
    d.purchases = n(row.purchases);
  }
  for (const row of byCategory) {
    day(row.date).byCategory.push({ category: row.category, amount: n(row.amount) });
  }
  for (const row of byItem) {
    day(row.date).byItem.push({ name: row.name, quantity: row.quantity, sales: n(row.sales) });
  }

  const staffOf = (date: string, staffId: string) => {
    const d = day(date);
    let entry = d.staff.find((s) => s.staffId === staffId);
    if (!entry) {
      entry = { staffId, orders: 0, sales: 0, cash: 0 };
      d.staff.push(entry);
    }
    return entry;
  };
  for (const row of takenBy) {
    const entry = staffOf(row.date, row.staffId);
    entry.orders = row.orders;
    entry.sales = n(row.sales);
  }
  for (const row of cashBy) staffOf(row.date, row.staffId).cash = n(row.amount);

  for (const d of days.values()) {
    d.byType.sort((a, b) => ORDER_TYPES.indexOf(a.type) - ORDER_TYPES.indexOf(b.type));
    d.byItem.sort((a, b) => b.sales - a.sales);
    d.byCategory.sort((a, b) => b.amount - a.amount);
  }
  return days;
}
