import {
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  and,
  asc,
  customers,
  desc,
  eq,
  inArray,
  isNull,
  orderEvents,
  orderItems,
  orders,
  paymentLinks,
  payments,
  refunds,
  sql,
  staffMembers,
  withTenant,
  type Tx,
} from '@plateraa/db';
import {
  DELIVERY_FEE_COLLECTORS,
  ORDER_SOURCES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_LINK_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
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
import { nullableText } from '../openapi';
import { businessToday, dueSql } from '../reports/business-day';

class OrdersQueryDto extends createZodDto(
  z.object({
    /** The trading day, YYYY-MM-DD. Leave it out for today in the business's timezone. */
    date: z.iso.date().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
  }),
) {}

const money = z.number().int();

const orderRowSchema = z.object({
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
      variantName: nullableText(),
      quantity: z.number().int(),
    }),
  ),
  /** When it was taken, by the tablet's clock, and by whom. */
  takenAt: z.string(),
  takenBy: nullableText(),
  customerPhone: nullableText(),
});

class OrderRowDto extends createZodDto(orderRowSchema) {}

class OrderDetailDto extends createZodDto(
  orderRowSchema.extend({
    subtotal: money,
    discount: money,
    /** A percent discount in basis points (1000 is 10%); null for an amount off, or none. */
    discountBps: z.number().int().nullable(),
    deliveryFee: money,
    deliveryFeeCollectedBy: z.enum(DELIVERY_FEE_COLLECTORS).nullable(),
    deliveryAddress: nullableText(),
    note: nullableText(),
    cancelReason: nullableText(),
    externalReference: nullableText(),
    /** Why the owner should look at it, e.g. PRICE_MISMATCH. */
    reviewReasons: z.array(z.string()),
    customerName: nullableText(),
    items: z.array(
      z.object({
        name: z.string(),
        variantName: nullableText(),
        quantity: z.number().int(),
        unitPrice: money,
        /** One of the item with its extras. */
        unitTotal: money,
        lineTotal: money,
        modifiers: z.array(
          z.object({ name: z.string(), quantity: z.number().int(), unitPriceDelta: money }),
        ),
        note: nullableText(),
      }),
    ),
    payments: z.array(
      z.object({
        id: z.string(),
        method: z.enum(PAYMENT_METHODS),
        status: z.enum(PAYMENT_STATUSES),
        amount: money,
        tendered: money.nullable(),
        by: nullableText(),
        at: z.string(),
      }),
    ),
    refunds: z.array(
      z.object({
        id: z.string(),
        method: z.enum(PAYMENT_METHODS),
        amount: money,
        reason: z.string(),
        by: nullableText(),
        at: z.string(),
      }),
    ),
    links: z.array(
      z.object({
        id: z.string(),
        status: z.enum(PAYMENT_LINK_STATUSES),
        amount: money,
        phone: z.string(),
        failure: nullableText(),
        sentAt: nullableText(),
        paidAt: nullableText(),
        at: z.string(),
      }),
    ),
    /** Every status change, oldest first. */
    history: z.array(
      z.object({
        from: z.enum(ORDER_STATUSES).nullable(),
        to: z.enum(ORDER_STATUSES),
        by: nullableText(),
        at: z.string(),
      }),
    ),
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
  takenBy: staffMembers.displayName,
  customerPhone: customers.phone,
};

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
  takenBy: string | null;
  customerPhone: string | null;
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

@Injectable()
export class OrdersService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /** A day's orders, newest first. */
  async list(tenantId: string, query: { date?: string; limit: number }) {
    return withTenant(this.database.db, tenantId, async (tx) => {
      const date = query.date ?? (await businessToday(tx)).date;
      const rows = await this.selectRows(tx)
        .where(and(eq(orders.businessDate, date), isNull(orders.deletedAt)))
        .orderBy(desc(orders.createdAtDevice))
        .limit(query.limit);
      return this.withItems(tx, rows);
    });
  }

  /**
   * Orders, from any day, where the customer is owed money back: a cancelled order that was paid,
   * or more paid than was due. Recording the refund takes it off the list.
   */
  async refundsOwed(tenantId: string) {
    return withTenant(this.database.db, tenantId, async (tx) => {
      const rows = await this.selectRows(tx)
        .where(
          and(
            isNull(orders.deletedAt),
            sql`${orders.amountPaid} > 0`,
            sql`(${orders.status} = 'CANCELLED' or ${orders.amountPaid} > ${dueSql})`,
          ),
        )
        .orderBy(asc(orders.createdAtDevice))
        .limit(200);
      return this.withItems(tx, rows);
    });
  }

  /** One order in full: its lines, money, payment links and history. */
  async detail(tenantId: string, orderId: string) {
    return withTenant(this.database.db, tenantId, async (tx) => {
      const [order] = await tx
        .select({
          ...ROW,
          subtotal: orders.subtotal,
          discount: orders.discount,
          discountBps: orders.discountBps,
          deliveryAddress: orders.deliveryAddress,
          note: orders.note,
          cancelReason: orders.cancelReason,
          externalReference: orders.externalReference,
          reviewReasons: orders.reviewReasons,
          customerName: customers.name,
        })
        .from(orders)
        .leftJoin(staffMembers, eq(staffMembers.id, orders.createdBy))
        .leftJoin(customers, eq(customers.id, orders.customerId))
        .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));
      if (!order) throw new NotFoundException('There is no such order');

      const lines = await tx
        .select({
          name: orderItems.name,
          variantName: orderItems.variantName,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          unitTotal: orderItems.unitTotal,
          lineTotal: orderItems.lineTotal,
          modifiers: orderItems.modifiers,
          note: orderItems.note,
        })
        .from(orderItems)
        .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)))
        .orderBy(asc(orderItems.position));

      const paid = await tx
        .select({
          id: payments.id,
          method: payments.method,
          status: payments.status,
          amount: payments.amount,
          tendered: payments.tendered,
          by: staffMembers.displayName,
          at: payments.createdAtDevice,
        })
        .from(payments)
        .leftJoin(staffMembers, eq(staffMembers.id, payments.collectedBy))
        .where(and(eq(payments.orderId, orderId), isNull(payments.deletedAt)))
        .orderBy(asc(payments.createdAtDevice));

      const givenBack = await tx
        .select({
          id: refunds.id,
          method: refunds.method,
          amount: refunds.amount,
          reason: refunds.reason,
          by: staffMembers.displayName,
          at: refunds.createdAtDevice,
        })
        .from(refunds)
        .leftJoin(staffMembers, eq(staffMembers.id, refunds.requestedBy))
        .where(and(eq(refunds.orderId, orderId), isNull(refunds.deletedAt)))
        .orderBy(asc(refunds.createdAtDevice));

      const links = await tx
        .select({
          id: paymentLinks.id,
          status: paymentLinks.status,
          amount: paymentLinks.amount,
          phone: paymentLinks.phone,
          failure: paymentLinks.failure,
          sentAt: paymentLinks.sentAt,
          paidAt: paymentLinks.paidAt,
          at: paymentLinks.createdAtDevice,
        })
        .from(paymentLinks)
        .where(and(eq(paymentLinks.orderId, orderId), isNull(paymentLinks.deletedAt)))
        .orderBy(asc(paymentLinks.createdAtDevice));

      const history = await tx
        .select({
          from: orderEvents.fromStatus,
          to: orderEvents.toStatus,
          by: staffMembers.displayName,
          at: sql<Date>`coalesce(${orderEvents.deviceTs}, ${orderEvents.createdAt})`.mapWith(
            orderEvents.createdAt,
          ),
        })
        .from(orderEvents)
        .leftJoin(staffMembers, eq(staffMembers.id, orderEvents.staffId))
        .where(eq(orderEvents.orderId, orderId))
        .orderBy(asc(orderEvents.createdAt));

      const confirmedMethods = new Set(
        paid.filter((payment) => payment.status === 'CONFIRMED').map((payment) => payment.method),
      );

      return {
        ...this.toRow(order, [...confirmedMethods], lines),
        subtotal: order.subtotal,
        discount: order.discount,
        discountBps: order.discountBps,
        deliveryFee: order.deliveryFee,
        deliveryFeeCollectedBy: order.deliveryFeeCollectedBy,
        deliveryAddress: order.deliveryAddress,
        note: order.note,
        cancelReason: order.cancelReason,
        externalReference: order.externalReference,
        reviewReasons: order.reviewReasons,
        customerName: order.customerName,
        items: lines.map((line) => ({
          ...line,
          modifiers: line.modifiers.map(({ name, quantity, unitPriceDelta }) => ({
            name,
            quantity,
            unitPriceDelta,
          })),
        })),
        payments: paid.map((payment) => ({ ...payment, at: payment.at.toISOString() })),
        refunds: givenBack.map((refund) => ({ ...refund, at: refund.at.toISOString() })),
        links: links.map((link) => ({
          ...link,
          sentAt: iso(link.sentAt),
          paidAt: iso(link.paidAt),
          at: link.at.toISOString(),
        })),
        history: history.map((event) => ({ ...event, at: event.at.toISOString() })),
      };
    });
  }

  /** Orders with who took them and the customer's number; add a where, an order and a limit. */
  private selectRows(tx: Tx) {
    return tx
      .select(ROW)
      .from(orders)
      .leftJoin(staffMembers, eq(staffMembers.id, orders.createdBy))
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .$dynamic();
  }

  private async withItems(tx: Tx, rows: Row[]) {
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

    return rows.map((row) =>
      this.toRow(
        row,
        methods.filter((payment) => payment.orderId === row.id).map((payment) => payment.method),
        lines.filter((line) => line.orderId === row.id),
      ),
    );
  }

  private toRow(
    row: Row,
    paidWith: PaymentMethod[],
    lines: { name: string; variantName: string | null; quantity: number }[],
  ) {
    return {
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
      paidWith,
      items: lines.map(({ name, variantName, quantity }) => ({ name, variantName, quantity })),
      takenAt: row.takenAt.toISOString(),
      takenBy: row.takenBy,
      customerPhone: row.customerPhone,
    };
  }
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

  @Get(':orderId')
  @Authorized()
  @ApiOkResponse({ type: OrderDetailDto.Output })
  detail(@CurrentActor() actor: Actor, @Param('orderId') orderId: string) {
    return this.orders.detail(actor.tenantId, orderId);
  }
}

@Module({ controllers: [OrdersController], providers: [OrdersService] })
export class OrdersModule {}
