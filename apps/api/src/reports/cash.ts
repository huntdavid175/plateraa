import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  and,
  asc,
  cashMovements,
  desc,
  devices,
  eq,
  inArray,
  isNull,
  payments,
  shifts,
  sql,
  staffMembers,
  withTenant,
} from '@brixx/db';
import { DRAWER_TOLERANCE, drawerResult } from '@brixx/shared';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { nullableText } from '../openapi';
import { businessToday, toPesewas } from './business-day';

const MAX_DAYS = 92;
const DAY_MS = 86_400_000;

class CashQueryDto extends createZodDto(z.object({ from: z.iso.date(), to: z.iso.date() })) {}

const money = z.number().int();
const result = z.enum(['EXACT', 'SHORT', 'OVER']);

const closeSchema = z.object({
  shiftId: z.string(),
  tablet: z.string(),
  openedBy: nullableText(),
  openedAt: z.string(),
  closedBy: nullableText(),
  closedAt: z.string(),
  float: money,
  /** Worked out by the server when the drawer closed. */
  expected: money,
  /** The blind count. */
  counted: money,
  /** counted − expected: below zero is short, above is over. */
  variance: money,
  /** GH₵1 or less either way is exact (`DRAWER_TOLERANCE`). */
  result,
});

class CashClosesDto extends createZodDto(
  z.object({
    from: z.string(),
    to: z.string(),
    /** Pesewas either way that still count as exact. */
    tolerance: money,
    summary: z.object({
      closes: z.number().int(),
      exact: z.number().int(),
      short: z.number().int(),
      over: z.number().int(),
      /** What went missing over the short closes, as a positive amount. */
      shortAmount: money,
      /** What was extra over the over closes. */
      overAmount: money,
    }),
    /** The days' closes, newest first. */
    closes: z.array(closeSchema),
    /**
     * Who was on the drawers: opened or closed one, took cash on it, or dropped or paid cash in.
     * Several people share a drawer, so this is who was there, never who took anything.
     */
    people: z.array(
      z.object({
        staffId: z.string(),
        name: z.string(),
        closes: z.number().int(),
        short: z.number().int(),
        over: z.number().int(),
        shortAmount: money,
        overAmount: money,
      }),
    ),
  }),
) {}

class CashCloseDto extends createZodDto(
  closeSchema.extend({
    status: z.enum(['OPEN', 'CLOSED']),
    closedBy: nullableText(),
    /** How expected was worked out: float + cash sales + pay-ins − payouts − drops. */
    cashSales: money,
    payIns: money,
    payouts: money,
    drops: money,
    /**
     * The same sum on today's records. It differs from `expected` only when something on the
     * drawer changed after it closed (a cash payment that synced late, say).
     */
    expectedNow: money,
    movements: z.array(
      z.object({
        id: z.string(),
        type: z.enum(['DROP', 'PAY_IN', 'PAYOUT']),
        amount: money,
        note: nullableText(),
        by: nullableText(),
        at: z.string(),
      }),
    ),
    /** Cash each person took on this drawer. */
    cashBy: z.array(
      z.object({
        staffId: z.string(),
        name: z.string(),
        amount: money,
        payments: z.number().int(),
      }),
    ),
  }),
) {}

/** A staff member's name, by id, as SQL (for an opener or closer). */
const nameOf = (column: typeof shifts.openedBy | typeof shifts.closedBy) =>
  sql<
    string | null
  >`(select ${staffMembers.displayName} from ${staffMembers} where ${staffMembers.id} = ${column})`;

const CLOSE = {
  shiftId: shifts.id,
  tablet: devices.name,
  openedBy: nameOf(shifts.openedBy),
  openedAt: shifts.openedAt,
  closedBy: nameOf(shifts.closedBy),
  closedAt: shifts.closedAt,
  float: shifts.floatAmount,
  expected: shifts.expectedCash,
  counted: shifts.countedCash,
  variance: shifts.variance,
};

type CloseRow = {
  shiftId: string;
  tablet: string;
  openedBy: string | null;
  openedAt: Date;
  closedBy: string | null;
  closedAt: Date | null;
  float: number;
  expected: number | null;
  counted: number | null;
  variance: number | null;
};

function closeOf(row: CloseRow) {
  const variance = Number(row.variance ?? 0);
  return {
    shiftId: row.shiftId,
    tablet: row.tablet,
    openedBy: row.openedBy,
    openedAt: row.openedAt.toISOString(),
    closedBy: row.closedBy,
    closedAt: (row.closedAt ?? row.openedAt).toISOString(),
    float: Number(row.float),
    expected: Number(row.expected ?? 0),
    counted: Number(row.counted ?? 0),
    variance,
    result: drawerResult(variance),
  };
}

/**
 * Cash over and short (user request, 19 Nov): every drawer close over some days, how it came out,
 * and who was on the drawers. Only for people who see sales, as expected cash is.
 */
@Injectable()
export class CashService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async closes(actor: Actor, from: string, to: string) {
    if (from > to) throw new BadRequestException('The first day comes after the last');
    if ((Date.parse(to) - Date.parse(from)) / DAY_MS >= MAX_DAYS) {
      throw new BadRequestException(`Pick ${MAX_DAYS} days or fewer`);
    }
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const { timezone } = await businessToday(tx);
      // A close belongs to the day it closed on, where the business is (as in Reports).
      const closedOn = sql`(${shifts.closedAt} at time zone ${timezone})::date`;
      const rows = await tx
        .select(CLOSE)
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
      const closes = rows.map(closeOf);

      const summary = { closes: closes.length, exact: 0, short: 0, over: 0 };
      let shortAmount = 0;
      let overAmount = 0;
      for (const close of closes) {
        if (close.result === 'EXACT') summary.exact++;
        if (close.result === 'SHORT') {
          summary.short++;
          shortAmount -= close.variance;
        }
        if (close.result === 'OVER') {
          summary.over++;
          overAmount += close.variance;
        }
      }

      // Everyone who was on each drawer: opened or closed it, took cash on it, moved cash.
      const ids = closes.map((close) => close.shiftId);
      const onShift = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
      const add = (shiftId: string | null, staffId: string | null) => {
        if (shiftId && staffId) onShift.get(shiftId)?.add(staffId);
      };
      if (ids.length) {
        // One after another: a transaction is one connection, which runs one query at a time.
        const ends = await tx
          .select({ id: shifts.id, openedBy: shifts.openedBy, closedBy: shifts.closedBy })
          .from(shifts)
          .where(inArray(shifts.id, ids));
        const takers = await tx
          .selectDistinct({ shiftId: payments.shiftId, staffId: payments.collectedBy })
          .from(payments)
          .where(
            and(
              inArray(payments.shiftId, ids),
              eq(payments.method, 'CASH'),
              isNull(payments.deletedAt),
            ),
          );
        const movers = await tx
          .selectDistinct({ shiftId: cashMovements.shiftId, staffId: cashMovements.staffId })
          .from(cashMovements)
          .where(and(inArray(cashMovements.shiftId, ids), isNull(cashMovements.deletedAt)));
        for (const end of ends) {
          add(end.id, end.openedBy);
          add(end.id, end.closedBy);
        }
        for (const row of [...takers, ...movers]) add(row.shiftId, row.staffId);
      }

      const tally = new Map<
        string,
        { closes: number; short: number; over: number; shortAmount: number; overAmount: number }
      >();
      for (const close of closes) {
        for (const staffId of onShift.get(close.shiftId) ?? []) {
          const entry = tally.get(staffId) ?? {
            closes: 0,
            short: 0,
            over: 0,
            shortAmount: 0,
            overAmount: 0,
          };
          entry.closes++;
          if (close.result === 'SHORT') {
            entry.short++;
            entry.shortAmount -= close.variance;
          }
          if (close.result === 'OVER') {
            entry.over++;
            entry.overAmount += close.variance;
          }
          tally.set(staffId, entry);
        }
      }
      const staffIds = [...tally.keys()];
      const names = staffIds.length
        ? await tx
            .select({ id: staffMembers.id, name: staffMembers.displayName })
            .from(staffMembers)
            .where(inArray(staffMembers.id, staffIds))
        : [];
      const people = staffIds
        .map((staffId) => ({
          staffId,
          name: names.find((row) => row.id === staffId)?.name ?? 'Someone',
          ...tally.get(staffId)!,
        }))
        .sort((a, b) => b.shortAmount - a.shortAmount || a.name.localeCompare(b.name));

      return {
        from,
        to,
        tolerance: DRAWER_TOLERANCE,
        summary: { ...summary, shortAmount, overAmount },
        closes,
        people,
      };
    });
  }

  /** One drawer in full: how its expected cash was worked out, its movements, who took cash. */
  async close(actor: Actor, shiftId: string) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ ...CLOSE, status: shifts.status })
        .from(shifts)
        .innerJoin(devices, eq(devices.id, shifts.deviceId))
        .where(and(eq(shifts.id, shiftId), isNull(shifts.deletedAt)));
      if (!row) throw new NotFoundException('There is no such drawer');

      const [cash] = await tx
        .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .where(
          and(
            eq(payments.shiftId, shiftId),
            eq(payments.method, 'CASH'),
            eq(payments.status, 'CONFIRMED'),
            isNull(payments.deletedAt),
          ),
        );
      const movements = await tx
        .select({
          id: cashMovements.id,
          type: cashMovements.type,
          amount: cashMovements.amount,
          note: cashMovements.note,
          by: staffMembers.displayName,
          at: cashMovements.createdAtDevice,
        })
        .from(cashMovements)
        .leftJoin(staffMembers, eq(staffMembers.id, cashMovements.staffId))
        .where(and(eq(cashMovements.shiftId, shiftId), isNull(cashMovements.deletedAt)))
        .orderBy(asc(cashMovements.createdAtDevice));
      const cashBy = await tx
        .select({
          staffId: payments.collectedBy,
          name: staffMembers.displayName,
          amount: sql<string>`sum(${payments.amount})`,
          payments: sql<number>`count(*)::int`,
        })
        .from(payments)
        .leftJoin(staffMembers, eq(staffMembers.id, payments.collectedBy))
        .where(
          and(
            eq(payments.shiftId, shiftId),
            eq(payments.method, 'CASH'),
            eq(payments.status, 'CONFIRMED'),
            isNull(payments.deletedAt),
          ),
        )
        .groupBy(payments.collectedBy, staffMembers.displayName)
        .orderBy(desc(sql`sum(${payments.amount})`));

      const moved = (type: 'DROP' | 'PAY_IN' | 'PAYOUT') =>
        movements
          .filter((movement) => movement.type === type)
          .reduce((sum, movement) => sum + Number(movement.amount), 0);
      const cashSales = Number(toPesewas(cash?.total));
      const float = Number(row.float);
      const payIns = moved('PAY_IN');
      const payouts = moved('PAYOUT');
      const drops = moved('DROP');
      const expectedNow = float + cashSales + payIns - payouts - drops;

      return {
        ...closeOf(row),
        status: row.status,
        ...(row.status === 'OPEN' ? { expected: expectedNow, counted: 0, variance: 0 } : {}),
        cashSales,
        payIns,
        payouts,
        drops,
        expectedNow,
        movements: movements.map((movement) => ({
          id: movement.id,
          type: movement.type,
          amount: Number(movement.amount),
          note: movement.note,
          by: movement.by,
          at: movement.at.toISOString(),
        })),
        cashBy: cashBy
          .filter((entry) => entry.staffId !== null)
          .map((entry) => ({
            staffId: entry.staffId!,
            name: entry.name ?? 'Someone',
            amount: Number(toPesewas(entry.amount)),
            payments: entry.payments,
          })),
      };
    });
  }
}

@Controller('cash')
@ApiBearerAuth()
export class CashController {
  constructor(private readonly cash: CashService) {}

  /** The drawer closes over some days (at most 92), and who was on them. */
  @Get('closes')
  @Authorized('reports.revenue.view')
  @ApiOkResponse({ type: CashClosesDto.Output })
  closes(@CurrentActor() actor: Actor, @Query() query: CashQueryDto) {
    return this.cash.closes(actor, query.from, query.to);
  }

  /** One drawer: how its expected cash was worked out, its drops, payouts and pay-ins. */
  @Get('closes/:shiftId')
  @Authorized('reports.revenue.view')
  @ApiOkResponse({ type: CashCloseDto.Output })
  close(@CurrentActor() actor: Actor, @Param('shiftId') shiftId: string) {
    return this.cash.close(actor, shiftId);
  }
}
