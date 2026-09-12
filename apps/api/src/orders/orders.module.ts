import { Controller, Get, Inject, Injectable, Module, Query } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  orderItems,
  orders,
  payments,
  sql,
  withTenant,
  type Tx,
} from '@plateraa/db';
import {
  ORDER_SOURCES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_METHODS,
  amountDue,
  refundOwed,
  type DeliveryFeeCollector,
  type OrderSource,
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
  type Pesewas,
} from '@plateraa/shared';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { businessToday, dueSql } from '../reports/business-day';

class OrdersQueryDto extends createZodDto(
  z.object({
    /** The trading day, YYYY-MM-DD. Leave it out for today in the business's timezone. */
    date: z.iso.date().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
) {}

const money = z.number().int();

class OrderRowDto extends createZodDto(
  z.object({
    id: z.string(),
    /** As shouted across the counter: the tablet's letter and the day's number, e.g. "A15". */
    displayNumber: z.string(),
    businessDate: z.string(),
    source: z.enum(ORDER_SOURCES),
    type: z.enum(ORDER_TYPES),
    status: z.enum(ORDER_STATUSES),
    onHold: z.boolean(),
    total: money,
    /** What the vendor collects: the total, less a delivery fee the rider kept. */
    amountDue: money,
    amountPaid: money,
    refundOwed: money,
    paidWith: z.array(z.enum(PAYMENT_METHODS)),
    items: z.array(
      z.object({
        name: z.string(),
        variantName: z.string().nullable(),
        quantity: z.number().int(),
      }),
    ),
    /** When it was taken, by the tablet's clock. */
    takenAt: z.string(),
  }),
) {}

const ROW = {
  id: orders.id,
  displayNumber: orders.displayNumber,
  businessDate: orders.businessDate,
  source: orders.source,
  type: orders.type,
  status: orders.status,
  onHold: orders.onHold,
  total: orders.total,
  deliveryFee: orders.deliveryFee,
  deliveryFeeCollectedBy: orders.deliveryFeeCollectedBy,
  amountPaid: orders.amountPaid,
  takenAt: orders.createdAtDevice,
};

@Injectable()
export class OrdersService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /** A day's orders, newest first. */
  async list(tenantId: string, query: { date?: string; limit: number }) {
    return withTenant(this.database.db, tenantId, async (tx) => {
      const date = query.date ?? (await businessToday(tx)).date;
      const rows = await tx
        .select(ROW)
        .from(orders)
        .where(and(eq(orders.businessDate, date), isNull(orders.deletedAt)))
        .orderBy(desc(orders.createdAtDevice))
        .limit(query.limit);
      return this.withDetails(tx, rows);
    });
  }

  /**
   * Orders, from any day, where the customer is owed money back: a cancelled order that was paid,
   * or more paid than was due. Recording the refund takes it off the list.
   */
  async refundsOwed(tenantId: string) {
    return withTenant(this.database.db, tenantId, async (tx) => {
      const rows = await tx
        .select(ROW)
        .from(orders)
        .where(
          and(
            isNull(orders.deletedAt),
            sql`${orders.amountPaid} > 0`,
            sql`(${orders.status} = 'CANCELLED' or ${orders.amountPaid} > ${dueSql})`,
          ),
        )
        .orderBy(asc(orders.createdAtDevice))
        .limit(200);
      return this.withDetails(tx, rows);
    });
  }

  private async withDetails(tx: Tx, rows: Row[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);

    const lines = await tx
      .select({
        orderId: orderItems.orderId,
        name: orderItems.name,
        variantName: orderItems.variantName,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(and(inArray(orderItems.orderId, ids), isNull(orderItems.deletedAt)))
      .orderBy(asc(orderItems.position));

    const methods = await tx
      .selectDistinct({ orderId: payments.orderId, method: payments.method })
      .from(payments)
      .where(
        and(
          inArray(payments.orderId, ids),
          eq(payments.status, 'CONFIRMED'),
          isNull(payments.deletedAt),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      displayNumber: row.displayNumber,
      businessDate: row.businessDate,
      source: row.source,
      type: row.type,
      status: row.status,
      onHold: row.onHold,
      total: row.total,
      amountDue: amountDue(row),
      amountPaid: row.amountPaid,
      refundOwed: refundOwed(row),
      paidWith: methods
        .filter((payment) => payment.orderId === row.id)
        .map((payment): PaymentMethod => payment.method),
      items: lines
        .filter((line) => line.orderId === row.id)
        .map(({ name, variantName, quantity }) => ({ name, variantName, quantity })),
      takenAt: row.takenAt.toISOString(),
    }));
  }
}

interface Row {
  id: string;
  displayNumber: string;
  businessDate: string;
  source: OrderSource;
  type: OrderType;
  status: OrderStatus;
  onHold: boolean;
  total: Pesewas;
  deliveryFee: Pesewas;
  deliveryFeeCollectedBy: DeliveryFeeCollector | null;
  amountPaid: Pesewas;
  takenAt: Date;
}

@Controller('orders')
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Authorized()
  @ApiOkResponse({ type: OrderRowDto.Output, isArray: true })
  list(@CurrentActor() actor: Actor, @Query() query: OrdersQueryDto) {
    return this.orders.list(actor.tenantId, query);
  }

  /** For whoever gives money back (managers and the owner). */
  @Get('refunds-owed')
  @Authorized('refunds.record')
  @ApiOkResponse({ type: OrderRowDto.Output, isArray: true })
  refundsOwed(@CurrentActor() actor: Actor) {
    return this.orders.refundsOwed(actor.tenantId);
  }
}

@Module({ controllers: [OrdersController], providers: [OrdersService] })
export class OrdersModule {}
