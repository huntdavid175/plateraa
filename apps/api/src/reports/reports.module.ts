import { Controller, Get, Inject, Injectable, Module, Query } from '@nestjs/common';
import { withTenant } from '@brixx/db';
import { ORDER_SOURCES, ORDER_TYPES, PAYMENT_METHODS, pesewas } from '@brixx/shared';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { businessToday } from './business-day';
import { DailyReports } from './daily';
import { emptyDay } from './figures';
import { PeriodController, PeriodService } from './period';

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
    /**
     * By the hour each order was taken, in the business's timezone: orders that count as sales
     * (the busy hours), and the money in on them.
     */
    byHour: z.array(z.object({ hour: z.number().int(), orders: z.number().int(), moneyIn: money })),
    bySource: z.array(
      z.object({ source: z.enum(ORDER_SOURCES), orders: z.number().int(), sales: money }),
    ),
    /** Dine-in, pickup and delivery. */
    byType: z.array(
      z.object({ type: z.enum(ORDER_TYPES), orders: z.number().int(), sales: money }),
    ),
    byMethod: z.array(z.object({ method: z.enum(PAYMENT_METHODS), amount: money })),
  }),
) {}

@Injectable()
export class DaySummaryService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly daily: DailyReports,
  ) {}

  /**
   * The day summary (plan.md §3.2). Today is worked out live; a finished day comes from the kept
   * daily report while nothing on it has changed (see DailyReports).
   */
  async summary(tenantId: string, requested?: string) {
    return withTenant(this.database.db, tenantId, async (tx) => {
      const date = requested ?? (await businessToday(tx)).date;
      const { days } = await this.daily.days(tx, tenantId, date, date);
      const day = days.get(date) ?? emptyDay();
      return {
        date,
        orders: day.orders,
        sales: pesewas(day.sales),
        moneyIn: pesewas(day.moneyIn),
        notYetCollected: pesewas(day.platformOwed + day.unpaid),
        platformOwed: pesewas(day.platformOwed),
        unpaid: pesewas(day.unpaid),
        commissionEstimate: pesewas(day.commissionEstimate),
        moneyOut: pesewas(day.moneyOut),
        expenses: day.expenses,
        left: pesewas(day.moneyIn - day.moneyOut),
        profit: pesewas(day.moneyIn + day.platformOwed - day.commissionEstimate - day.moneyOut),
        byHour: day.byHour,
        bySource: day.bySource,
        byType: day.byType,
        byMethod: day.byMethod,
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

@Module({
  controllers: [ReportsController, PeriodController],
  providers: [DaySummaryService, PeriodService, DailyReports],
})
export class ReportsModule {}
