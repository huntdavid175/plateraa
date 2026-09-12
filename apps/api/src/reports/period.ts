import { BadRequestException, Controller, Get, Inject, Injectable, Query } from '@nestjs/common';
import {
  and,
  desc,
  devices,
  eq,
  expenses,
  gte,
  isNotNull,
  isNull,
  lte,
  ne,
  orderItems,
  orders,
  payments,
  platformReceivables,
  refunds,
  shifts,
  sql,
  staffMembers,
  withTenant,
} from '@plateraa/db';
import { EXPENSE_CATEGORIES, ORDER_SOURCES, PAYMENT_METHODS, pesewas } from '@plateraa/shared';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { nullableText } from '../openapi';
import { businessToday, countsAsSale, dueSql, toPesewas } from './business-day';

const MAX_DAYS = 92;
const DAY_MS = 86_400_000;

class PeriodQueryDto extends createZodDto(z.object({ from: z.iso.date(), to: z.iso.date() })) {}

const money = z.number().int();

class PeriodDto extends createZodDto(
  z.object({
    from: z.string(),
    to: z.string(),
    totals: z.object({
      orders: z.number().int(),
      sales: money,
      moneyIn: money,
      platformOwed: money,
      commissionEstimate: money,
      moneyOut: money,
      /** Expenses that bought stock. */
      purchases: money,
      otherExpenses: money,
      left: money,
      profit: money,
    }),
    byDay: z.array(
      z.object({
        date: z.string(),
        orders: z.number().int(),
        sales: money,
        moneyIn: money,
        moneyOut: money,
      }),
    ),
    bySource: z.array(
      z.object({ source: z.enum(ORDER_SOURCES), orders: z.number().int(), sales: money }),
    ),
    byMethod: z.array(z.object({ method: z.enum(PAYMENT_METHODS), amount: money })),
    /** Best sellers first, up to 20. */
    byItem: z.array(z.object({ name: z.string(), quantity: z.number().int(), sales: money })),
    byCategory: z.array(z.object({ category: z.enum(EXPENSE_CATEGORIES), amount: money })),
    staff: z.array(
      z.object({
        name: z.string(),
        orders: z.number().int(),
        sales: money,
        /** Cash they took at the counter. */
        cash: money,
      }),
    ),
    /** Drawers closed in the period, newest first. */
    drawerCloses: z.array(
      z.object({
        shiftId: z.string(),
        tablet: z.string(),
        closedBy: nullableText(),
        closedAt: z.string(),
        expected: money.nullable(),
        counted: money.nullable(),
        variance: money.nullable(),
      }),
    ),
  }),
) {}

/**
 * Reports over a range of trading days (plan.md §3.2), with the day summary's definitions: money
 * in is cash and link payments less refunds; profit adds what the platforms owe, less their
 * commission and money out. Worked out live; the rollup job comes later.
 */
@Injectable()
export class PeriodService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async period(actor: Actor, from: string, to: string) {
    if (from > to) throw new BadRequestException('The first day comes after the last');
    if ((Date.parse(to) - Date.parse(from)) / DAY_MS >= MAX_DAYS) {
      throw new BadRequestException(`Pick ${MAX_DAYS} days or fewer`);
    }

    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const { timezone } = await businessToday(tx);
      const inRange = and(
        gte(orders.businessDate, from),
        lte(orders.businessDate, to),
        isNull(orders.deletedAt),
      );
      const sales = and(inRange, countsAsSale);
      const confirmed = and(inRange, eq(payments.status, 'CONFIRMED'), isNull(payments.deletedAt));
      const spentInRange = and(
        gte(expenses.spentOn, from),
        lte(expenses.spentOn, to),
        isNull(expenses.deletedAt),
      );

      const salesByDay = await tx
        .select({
          date: orders.businessDate,
          orders: sql<number>`count(*)::int`,
          sales: sql<string>`sum(${dueSql})`,
        })
        .from(orders)
        .where(sales)
        .groupBy(orders.businessDate);

      const inByDay = await tx
        .select({ date: orders.businessDate, amount: sql<string>`sum(${payments.amount})` })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(and(confirmed, ne(payments.method, 'PLATFORM')))
        .groupBy(orders.businessDate);

      const refundedByDay = await tx
        .select({ date: orders.businessDate, amount: sql<string>`sum(${refunds.amount})` })
        .from(refunds)
        .innerJoin(orders, eq(orders.id, refunds.orderId))
        .where(and(inRange, isNull(refunds.deletedAt), ne(refunds.method, 'PLATFORM')))
        .groupBy(orders.businessDate);

      const outByDay = await tx
        .select({ date: expenses.spentOn, amount: sql<string>`sum(${expenses.amount})` })
        .from(expenses)
        .where(spentInRange)
        .groupBy(expenses.spentOn);

      const bySource = await tx
        .select({
          source: orders.source,
          orders: sql<number>`count(*)::int`,
          sales: sql<string>`sum(${dueSql})`,
        })
        .from(orders)
        .where(sales)
        .groupBy(orders.source);

      const byMethod = await tx
        .select({ method: payments.method, amount: sql<string>`sum(${payments.amount})` })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(confirmed)
        .groupBy(payments.method);

      const byItem = await tx
        .select({
          name: orderItems.name,
          quantity: sql<number>`sum(${orderItems.quantity})::int`,
          sales: sql<string>`sum(${orderItems.lineTotal})`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(sales, isNull(orderItems.deletedAt)))
        .groupBy(orderItems.name)
        .orderBy(desc(sql`sum(${orderItems.lineTotal})`))
        .limit(20);

      const byCategory = await tx
        .select({ category: expenses.category, amount: sql<string>`sum(${expenses.amount})` })
        .from(expenses)
        .where(spentInRange)
        .groupBy(expenses.category)
        .orderBy(desc(sql`sum(${expenses.amount})`));

      const [purchased] = await tx
        .select({ amount: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
        .from(expenses)
        .where(and(spentInRange, isNotNull(expenses.stockItemId)));

      const [owed] = await tx
        .select({
          gross: sql<string>`coalesce(sum(${platformReceivables.gross}), 0)`,
          commission: sql<string>`coalesce(sum(${platformReceivables.commissionEstimate}), 0)`,
        })
        .from(platformReceivables)
        .innerJoin(orders, eq(orders.id, platformReceivables.orderId))
        .where(sales);

      const takenBy = await tx
        .select({
          staffId: orders.createdBy,
          name: staffMembers.displayName,
          orders: sql<number>`count(*)::int`,
          sales: sql<string>`sum(${dueSql})`,
        })
        .from(orders)
        .innerJoin(staffMembers, eq(staffMembers.id, orders.createdBy))
        .where(sales)
        .groupBy(orders.createdBy, staffMembers.displayName);

      const cashBy = await tx
        .select({ staffId: payments.collectedBy, amount: sql<string>`sum(${payments.amount})` })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(and(confirmed, eq(payments.method, 'CASH')))
        .groupBy(payments.collectedBy);

      const closedOn = sql`(${shifts.closedAt} at time zone ${timezone})::date`;
      const closes = await tx
        .select({
          shiftId: shifts.id,
          tablet: devices.name,
          closedBy: sql<
            string | null
          >`(select ${staffMembers.displayName} from ${staffMembers} where ${staffMembers.id} = ${shifts.closedBy})`,
          closedAt: shifts.closedAt,
          expected: shifts.expectedCash,
          counted: shifts.countedCash,
          variance: shifts.variance,
        })
        .from(shifts)
        .innerJoin(devices, eq(devices.id, shifts.deviceId))
        .where(
          and(
            eq(shifts.status, 'CLOSED'),
            isNull(shifts.deletedAt),
            sql`${closedOn} between ${from}::date and ${to}::date`,
          ),
        )
        .orderBy(desc(shifts.closedAt));

      // Day by day, every day in the range, including quiet ones.
      const days: string[] = [];
      for (
        let t = Date.parse(`${from}T00:00:00Z`);
        t <= Date.parse(`${to}T00:00:00Z`);
        t += DAY_MS
      ) {
        days.push(new Date(t).toISOString().slice(0, 10));
      }
      const amountOn = (rows: { date: string; amount: string }[], date: string) =>
        Number(rows.find((row) => row.date === date)?.amount ?? 0);
      const byDay = days.map((date) => {
        const sold = salesByDay.find((row) => row.date === date);
        return {
          date,
          orders: sold?.orders ?? 0,
          sales: toPesewas(sold?.sales),
          moneyIn: pesewas(amountOn(inByDay, date) - amountOn(refundedByDay, date)),
          moneyOut: pesewas(amountOn(outByDay, date)),
        };
      });

      const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
      const moneyIn = sum(byDay.map((day) => day.moneyIn));
      const moneyOut = sum(byDay.map((day) => day.moneyOut));
      const purchases = toPesewas(purchased?.amount);
      const platformOwed = toPesewas(owed?.gross);
      const commissionEstimate = toPesewas(owed?.commission);

      return {
        from,
        to,
        totals: {
          orders: sum(byDay.map((day) => day.orders)),
          sales: pesewas(sum(byDay.map((day) => day.sales))),
          moneyIn: pesewas(moneyIn),
          platformOwed,
          commissionEstimate,
          moneyOut: pesewas(moneyOut),
          purchases,
          otherExpenses: pesewas(moneyOut - purchases),
          left: pesewas(moneyIn - moneyOut),
          profit: pesewas(moneyIn + platformOwed - commissionEstimate - moneyOut),
        },
        byDay,
        bySource: bySource.map((row) => ({ ...row, sales: toPesewas(row.sales) })),
        byMethod: byMethod.map((row) => ({ method: row.method, amount: toPesewas(row.amount) })),
        byItem: byItem.map((row) => ({ ...row, sales: toPesewas(row.sales) })),
        byCategory: byCategory.map((row) => ({
          category: row.category,
          amount: toPesewas(row.amount),
        })),
        staff: takenBy
          .map((row) => ({
            name: row.name,
            orders: row.orders,
            sales: toPesewas(row.sales),
            cash: toPesewas(cashBy.find((cash) => cash.staffId === row.staffId)?.amount),
          }))
          .sort((a, b) => b.sales - a.sales),
        drawerCloses: closes.map((row) => ({
          ...row,
          closedAt: row.closedAt!.toISOString(),
        })),
      };
    });
  }
}

@Controller('reports')
@ApiBearerAuth()
export class PeriodController {
  constructor(private readonly periods: PeriodService) {}

  /** Money over a range of days: for the owner, and anyone they let see sales. */
  @Get('period')
  @Authorized('reports.revenue.view')
  @ApiOkResponse({ type: PeriodDto.Output })
  period(@CurrentActor() actor: Actor, @Query() query: PeriodQueryDto) {
    return this.periods.period(actor, query.from, query.to);
  }
}
