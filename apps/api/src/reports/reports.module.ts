import { Controller, Get, Inject, Injectable, Module, Query } from '@nestjs/common';
import {
  and,
  eq,
  expenses,
  isNull,
  ne,
  orders,
  payments,
  platformReceivables,
  refunds,
  sql,
  withTenant,
} from '@plateraa/db';
import { ORDER_SOURCES, PAYMENT_METHODS, pesewas } from '@plateraa/shared';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { businessToday, countsAsSale, dueSql, toPesewas } from './business-day';

class DayQueryDto extends createZodDto(
  z.object({
    /** The trading day, YYYY-MM-DD. Leave it out for today in the business's timezone. */
    date: z.iso.date().optional(),
  }),
) {}

const money = z.number().int();

class DaySummaryDto extends createZodDto(
  z.object({
    date: z.string(),
    /** Orders that count as sales (not cancelled or refunded). */
    orders: z.number().int(),
    /** What those orders are worth to the vendor. */
    sales: money,
    /** Cash and payment-link money collected on the day's orders, less refunds given back. */
    moneyIn: money,
    /** platformOwed + unpaid. */
    notYetCollected: money,
    /** Paid via Bolt Food or Chowdeck: they owe it and pay it out later. */
    platformOwed: money,
    /** Still owed by customers on the day's orders. */
    unpaid: money,
    /** What Bolt Food and Chowdeck are expected to keep, where the owner set a commission. */
    commissionEstimate: money,
    /** The day's expenses, drawer payouts included. */
    moneyOut: money,
    expenses: z.number().int(),
    /** moneyIn − moneyOut. */
    left: money,
    /** moneyIn + platformOwed − commissionEstimate − moneyOut. */
    profit: money,
    /** Money in by the hour each order was taken, in the business's timezone. */
    byHour: z.array(z.object({ hour: z.number().int(), moneyIn: money })),
    bySource: z.array(
      z.object({ source: z.enum(ORDER_SOURCES), orders: z.number().int(), sales: money }),
    ),
    byMethod: z.array(z.object({ method: z.enum(PAYMENT_METHODS), amount: money })),
  }),
) {}

@Injectable()
export class DaySummaryService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /**
   * The day summary (plan.md §3.2). Everything hangs off the orders' trading day, so a link paid
   * late still counts on the day its order was taken. Expenses count on the day they were spent.
   */
  async summary(tenantId: string, requested?: string) {
    return withTenant(this.database.db, tenantId, async (tx) => {
      const today = await businessToday(tx);
      const date = requested ?? today.date;
      const ofDay = and(eq(orders.businessDate, date), isNull(orders.deletedAt));
      const hourTaken = sql<number>`extract(hour from ${orders.createdAtDevice} at time zone ${today.timezone})::int`;

      const bySource = await tx
        .select({
          source: orders.source,
          orders: sql<number>`count(*)::int`,
          sales: sql<string>`coalesce(sum(${dueSql}), 0)`,
          unpaid: sql<string>`coalesce(sum(greatest(${dueSql} - ${orders.amountPaid}, 0)), 0)`,
        })
        .from(orders)
        .where(and(ofDay, countsAsSale))
        .groupBy(orders.source);

      // Money already taken on a cancelled order still counts until the refund is recorded.
      const confirmed = and(ofDay, eq(payments.status, 'CONFIRMED'), isNull(payments.deletedAt));
      const byMethod = await tx
        .select({ method: payments.method, amount: sql<string>`sum(${payments.amount})` })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(confirmed)
        .groupBy(payments.method);

      const collectedByHour = await tx
        .select({ hour: hourTaken, amount: sql<string>`sum(${payments.amount})` })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(and(confirmed, ne(payments.method, 'PLATFORM')))
        .groupBy(sql`1`);

      const refundedByHour = await tx
        .select({ hour: hourTaken, amount: sql<string>`sum(${refunds.amount})` })
        .from(refunds)
        .innerJoin(orders, eq(orders.id, refunds.orderId))
        .where(and(ofDay, isNull(refunds.deletedAt), ne(refunds.method, 'PLATFORM')))
        .groupBy(sql`1`);

      const [owed] = await tx
        .select({
          gross: sql<string>`coalesce(sum(${platformReceivables.gross}), 0)`,
          commission: sql<string>`coalesce(sum(${platformReceivables.commissionEstimate}), 0)`,
        })
        .from(platformReceivables)
        .innerJoin(orders, eq(orders.id, platformReceivables.orderId))
        .where(and(ofDay, countsAsSale));

      const [spent] = await tx
        .select({
          total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
          count: sql<number>`count(*)::int`,
        })
        .from(expenses)
        .where(and(eq(expenses.spentOn, date), isNull(expenses.deletedAt)));

      const hours = new Map<number, number>();
      for (const row of collectedByHour) {
        hours.set(row.hour, (hours.get(row.hour) ?? 0) + Number(row.amount));
      }
      for (const row of refundedByHour) {
        hours.set(row.hour, (hours.get(row.hour) ?? 0) - Number(row.amount));
      }

      const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
      const moneyIn = total([...hours.values()]);
      const platformOwed = toPesewas(owed?.gross);
      const commissionEstimate = toPesewas(owed?.commission);
      const unpaid = total(bySource.map((row) => Number(row.unpaid)));
      const moneyOut = toPesewas(spent?.total);

      return {
        date,
        orders: total(bySource.map((row) => row.orders)),
        sales: pesewas(total(bySource.map((row) => Number(row.sales)))),
        moneyIn: pesewas(moneyIn),
        notYetCollected: pesewas(platformOwed + unpaid),
        platformOwed,
        unpaid: pesewas(unpaid),
        commissionEstimate,
        moneyOut,
        expenses: spent?.count ?? 0,
        left: pesewas(moneyIn - moneyOut),
        profit: pesewas(moneyIn + platformOwed - commissionEstimate - moneyOut),
        byHour: [...hours.entries()]
          .sort(([a], [b]) => a - b)
          .map(([hour, amount]) => ({ hour, moneyIn: pesewas(amount) })),
        bySource: bySource.map((row) => ({
          source: row.source,
          orders: row.orders,
          sales: toPesewas(row.sales),
        })),
        byMethod: byMethod.map((row) => ({ method: row.method, amount: toPesewas(row.amount) })),
      };
    });
  }
}

@Controller('reports')
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly days: DaySummaryService) {}

  /** The day's money: for the owner, and for anyone they let see sales. */
  @Get('day')
  @Authorized('reports.revenue.view')
  @ApiOkResponse({ type: DaySummaryDto.Output })
  day(@CurrentActor() actor: Actor, @Query() query: DayQueryDto) {
    return this.days.summary(actor.tenantId, query.date);
  }
}

@Module({ controllers: [ReportsController], providers: [DaySummaryService] })
export class ReportsModule {}
