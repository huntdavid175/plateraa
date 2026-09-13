import { BadRequestException, Controller, Get, Inject, Injectable, Query } from '@nestjs/common';
import {
  and,
  desc,
  devices,
  eq,
  inArray,
  isNull,
  shifts,
  sql,
  staffMembers,
  withTenant,
} from '@plateraa/db';
import {
  EXPENSE_CATEGORIES,
  ORDER_SOURCES,
  PAYMENT_METHODS,
  pesewas,
  type ExpenseCategory,
  type OrderSource,
  type PaymentMethod,
} from '@plateraa/shared';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { nullableText } from '../openapi';
import { DailyReports, daysBetween } from './daily';
import { emptyDay } from './figures';

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

/** Adds `amount` to the entry under `key`, making it if needed. */
function tally<K>(totals: Map<K, number>, key: K, amount: number) {
  totals.set(key, (totals.get(key) ?? 0) + amount);
}

/** Largest first. */
const byAmount = <K>(totals: Map<K, number>) => [...totals.entries()].sort(([, a], [, b]) => b - a);

/**
 * Reports over a range of trading days (plan.md §3.2), with the day summary's definitions: money
 * in is cash and link payments less refunds; profit adds what the platforms owe, less their
 * commission and money out. Each day's figures come from DailyReports (kept for finished days,
 * live for today); drawer closes are read as they are.
 */
@Injectable()
export class PeriodService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly daily: DailyReports,
  ) {}

  async period(actor: Actor, from: string, to: string) {
    if (from > to) throw new BadRequestException('The first day comes after the last');
    if ((Date.parse(to) - Date.parse(from)) / DAY_MS >= MAX_DAYS) {
      throw new BadRequestException(`Pick ${MAX_DAYS} days or fewer`);
    }

    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const { timezone, days } = await this.daily.days(tx, actor.tenantId, from, to);
      const figures = daysBetween(from, to).map((date) => ({
        date,
        day: days.get(date) ?? emptyDay(),
      }));

      const sources = new Map<OrderSource, { orders: number; sales: number }>();
      const methods = new Map<PaymentMethod, number>();
      const items = new Map<string, { quantity: number; sales: number }>();
      const categories = new Map<ExpenseCategory, number>();
      const staff = new Map<string, { orders: number; sales: number; cash: number }>();
      for (const { day } of figures) {
        for (const row of day.bySource) {
          const entry = sources.get(row.source) ?? { orders: 0, sales: 0 };
          entry.orders += row.orders;
          entry.sales += row.sales;
          sources.set(row.source, entry);
        }
        for (const row of day.byMethod) tally(methods, row.method, row.amount);
        for (const row of day.byItem) {
          const entry = items.get(row.name) ?? { quantity: 0, sales: 0 };
          entry.quantity += row.quantity;
          entry.sales += row.sales;
          items.set(row.name, entry);
        }
        for (const row of day.byCategory) tally(categories, row.category, row.amount);
        for (const row of day.staff) {
          const entry = staff.get(row.staffId) ?? { orders: 0, sales: 0, cash: 0 };
          entry.orders += row.orders;
          entry.sales += row.sales;
          entry.cash += row.cash;
          staff.set(row.staffId, entry);
        }
      }

      const staffIds = [...staff.keys()];
      const names = staffIds.length
        ? await tx
            .select({ id: staffMembers.id, name: staffMembers.displayName })
            .from(staffMembers)
            .where(inArray(staffMembers.id, staffIds))
        : [];

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

      const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
      const all = figures.map(({ day }) => day);
      const moneyIn = sum(all.map((day) => day.moneyIn));
      const moneyOut = sum(all.map((day) => day.moneyOut));
      const purchases = sum(all.map((day) => day.purchases));
      const platformOwed = sum(all.map((day) => day.platformOwed));
      const commissionEstimate = sum(all.map((day) => day.commissionEstimate));

      return {
        from,
        to,
        totals: {
          orders: sum(all.map((day) => day.orders)),
          sales: pesewas(sum(all.map((day) => day.sales))),
          moneyIn: pesewas(moneyIn),
          platformOwed: pesewas(platformOwed),
          commissionEstimate: pesewas(commissionEstimate),
          moneyOut: pesewas(moneyOut),
          purchases: pesewas(purchases),
          otherExpenses: pesewas(moneyOut - purchases),
          left: pesewas(moneyIn - moneyOut),
          profit: pesewas(moneyIn + platformOwed - commissionEstimate - moneyOut),
        },
        byDay: figures.map(({ date, day }) => ({
          date,
          orders: day.orders,
          sales: pesewas(day.sales),
          moneyIn: pesewas(day.moneyIn),
          moneyOut: pesewas(day.moneyOut),
        })),
        bySource: [...sources.entries()].map(([source, entry]) => ({ source, ...entry })),
        byMethod: [...methods.entries()].map(([method, amount]) => ({ method, amount })),
        byItem: [...items.entries()]
          .sort(([, a], [, b]) => b.sales - a.sales)
          .slice(0, 20)
          .map(([name, entry]) => ({ name, ...entry })),
        byCategory: byAmount(categories).map(([category, amount]) => ({ category, amount })),
        // Everyone who took orders, as before: cash alone doesn't put someone on the list.
        staff: [...staff.entries()]
          .filter(([, entry]) => entry.orders > 0)
          .map(([staffId, entry]) => ({
            name: names.find((row) => row.id === staffId)?.name ?? 'Someone removed',
            ...entry,
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
