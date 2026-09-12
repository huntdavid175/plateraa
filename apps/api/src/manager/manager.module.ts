import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  and,
  asc,
  cashMovements,
  devices,
  eq,
  expenses,
  isNull,
  orderEvents,
  orderItems,
  orders,
  refunds,
  shifts,
  sql,
  staffMembers,
  tenantSettings,
  withTenant,
  type Tx,
} from '@plateraa/db';
import {
  EXPENSE_CATEGORIES,
  ORDER_STATUSES,
  PricingError,
  amountDue,
  formatCedis,
  isFullyPaid,
  paymentStartsPrep,
  pesewas,
  priceOrder,
  refundOwed,
  type Discount,
} from '@plateraa/shared';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { nullableText } from '../openapi';
import { businessToday } from '../reports/business-day';
import { expectedCash } from '../sync/handlers/shifts';

const money = z.number().int();

class RecordRefundDto extends createZodDto(
  z.object({
    /** Made by the dashboard, so sending it twice records it once. */
    refundId: z.ulid(),
    amount: z.number().int().positive(),
    /** How it went back: cash, or mobile money sent from the vendor's own account. */
    method: z.enum(['CASH', 'LINK']),
    reason: z.string().trim().min(2).max(200),
  }),
) {}

class RefundRecordedDto extends createZodDto(
  z.object({ refundId: z.string(), amountPaid: money, refundOwed: money }),
) {}

class SetDiscountDto extends createZodDto(
  z
    .object({
      kind: z.enum(['none', 'percent', 'amount']),
      /** A percent discount in basis points: 1000 is 10%. */
      bps: z.number().int().min(1).max(10_000).optional(),
      amount: z.number().int().positive().optional(),
    })
    .refine((d) => d.kind !== 'percent' || d.bps !== undefined, {
      path: ['bps'],
      message: 'Say how much off',
    })
    .refine((d) => d.kind !== 'amount' || d.amount !== undefined, {
      path: ['amount'],
      message: 'Say how much off',
    }),
) {}

class DiscountSetDto extends createZodDto(
  z.object({
    subtotal: money,
    discount: money,
    total: money,
    amountDue: money,
    amountPaid: money,
    status: z.enum(ORDER_STATUSES),
  }),
) {}

class DrawerDto extends createZodDto(
  z.object({
    shiftId: z.string(),
    deviceName: z.string(),
    deviceCode: z.string(),
    openedBy: nullableText(),
    openedAt: z.string(),
    float: money,
    /** What should be in it now. Only for people who may see sales figures. */
    expectedCash: z.number().int().nullable(),
  }),
) {}

class RecordPayoutDto extends createZodDto(
  z.object({
    /** Made by the dashboard, so sending it twice records it once. */
    payoutId: z.ulid(),
    amount: z.number().int().positive(),
    category: z.enum(EXPENSE_CATEGORIES),
    note: z.string().trim().max(200).optional(),
  }),
) {}

class PayoutRecordedDto extends createZodDto(z.object({ payoutId: z.string() })) {}

/**
 * What only a manager or the owner does, on the dashboard: give money back, pay out of a
 * drawer, and discount an unpaid order. The tablet can't do any of these.
 */
@Injectable()
export class ManagerService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /**
   * Money handed back by hand, from outside the drawer: full or partial, up to what's owed.
   * It comes off what the order has been paid, so the refund owed goes down with it.
   */
  async recordRefund(actor: Actor, orderId: string, input: RecordRefundDto) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const order = await lockOrder(tx, orderId);
      const [existing] = await tx
        .select({ id: refunds.id, orderId: refunds.orderId })
        .from(refunds)
        .where(eq(refunds.id, input.refundId));
      if (existing) {
        if (existing.orderId !== orderId)
          throw new ConflictException('That refund is on another order');
        return {
          refundId: existing.id,
          amountPaid: order.amountPaid,
          refundOwed: refundOwed(order),
        };
      }

      const owed = refundOwed(order);
      if (owed <= 0) throw new BadRequestException('Nothing is owed back on this order');
      if (input.amount > owed) {
        throw new BadRequestException(`Only ${formatCedis(owed)} is owed back on this order`);
      }

      const amount = pesewas(input.amount);
      await tx.insert(refunds).values({
        id: input.refundId,
        tenantId: actor.tenantId,
        orderId,
        method: input.method,
        amount,
        reason: input.reason,
        requestedBy: actor.staffId,
        createdAtDevice: new Date(),
      });
      const [updated] = await tx
        .update(orders)
        .set({ amountPaid: sql`${orders.amountPaid} - ${amount}` })
        .where(eq(orders.id, orderId))
        .returning();
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'refund.recorded',
        entityType: 'refund',
        entityId: input.refundId,
        before: { orderId, amountPaid: order.amountPaid },
        after: {
          orderId,
          amount,
          method: input.method,
          reason: input.reason,
          amountPaid: updated!.amountPaid,
        },
      });
      return {
        refundId: input.refundId,
        amountPaid: updated!.amountPaid,
        refundOwed: refundOwed(updated!),
      };
    });
  }

  /**
   * Sets, changes or removes the discount on an order that isn't fully paid, re-pricing it with
   * the same pricing the tablet uses. With pay before prep, a discount that clears what's owed
   * sends the order to the kitchen.
   */
  async setDiscount(actor: Actor, orderId: string, input: SetDiscountDto) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
        throw new BadRequestException('This order was cancelled');
      }
      if (isFullyPaid(order)) {
        throw new BadRequestException(
          'This order is already paid. Discounts are for unpaid orders.',
        );
      }

      const lines = await tx
        .select({
          unitPrice: orderItems.unitPrice,
          quantity: orderItems.quantity,
          modifiers: orderItems.modifiers,
        })
        .from(orderItems)
        .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.deletedAt)))
        .orderBy(asc(orderItems.position));

      const discount: Discount | null =
        input.kind === 'percent'
          ? { kind: 'percent', bps: input.bps! }
          : input.kind === 'amount'
            ? { kind: 'amount', amount: pesewas(input.amount!) }
            : null;
      let priced: ReturnType<typeof priceOrder>;
      try {
        priced = priceOrder({
          lines: lines.map((line) => ({
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            modifiers: line.modifiers.map(({ unitPriceDelta, quantity }) => ({
              unitPriceDelta,
              quantity,
            })),
          })),
          discount,
          deliveryFee: order.deliveryFee,
        });
      } catch (error) {
        if (error instanceof PricingError) throw new BadRequestException(error.message);
        throw error;
      }

      const repriced = {
        ...order,
        subtotal: priced.subtotal,
        discount: priced.discount,
        total: priced.total,
      };
      if (amountDue(repriced) < order.amountPaid) {
        throw new BadRequestException(
          `${formatCedis(order.amountPaid)} is already paid, so the total can't go below that`,
        );
      }

      const [settings] = await tx
        .select({ requirePaymentBeforePrep: tenantSettings.requirePaymentBeforePrep })
        .from(tenantSettings);
      const startsPrep = paymentStartsPrep(repriced, settings?.requirePaymentBeforePrep ?? true);
      const status = startsPrep ? 'PREPARING' : order.status;

      await tx
        .update(orders)
        .set({
          subtotal: priced.subtotal,
          discount: priced.discount,
          total: priced.total,
          discountBps: input.kind === 'percent' ? input.bps! : null,
          discountAmountInput: input.kind === 'amount' ? pesewas(input.amount!) : null,
          status,
        })
        .where(eq(orders.id, orderId));
      if (startsPrep) {
        await tx.insert(orderEvents).values({
          id: ulid(),
          tenantId: actor.tenantId,
          orderId,
          fromStatus: order.status,
          toStatus: 'PREPARING',
          staffId: actor.staffId,
        });
      }
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'order.discount_set',
        entityType: 'order',
        entityId: orderId,
        before: { discount: order.discount, total: order.total },
        after: {
          kind: input.kind,
          bps: input.bps,
          amount: input.amount,
          discount: priced.discount,
          total: priced.total,
        },
      });

      return {
        subtotal: priced.subtotal,
        discount: priced.discount,
        total: priced.total,
        amountDue: amountDue(repriced),
        amountPaid: order.amountPaid,
        status,
      };
    });
  }

  /** The tablets' open drawers, for recording payouts. */
  async openDrawers(actor: Actor) {
    const seesMoney = actor.capabilities.has('reports.revenue.view');
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const rows = await tx
        .select({
          shift: shifts,
          deviceName: devices.name,
          deviceCode: devices.code,
          openedBy: staffMembers.displayName,
        })
        .from(shifts)
        .innerJoin(devices, eq(devices.id, shifts.deviceId))
        .leftJoin(staffMembers, eq(staffMembers.id, shifts.openedBy))
        .where(and(eq(shifts.status, 'OPEN'), isNull(shifts.deletedAt)))
        .orderBy(asc(shifts.openedAt));
      const drawers = [];
      for (const row of rows) {
        drawers.push({
          shiftId: row.shift.id,
          deviceName: row.deviceName,
          deviceCode: row.deviceCode,
          openedBy: row.openedBy,
          openedAt: row.shift.openedAt.toISOString(),
          float: row.shift.floatAmount,
          expectedCash: seesMoney ? await expectedCash(tx, row.shift) : null,
        });
      }
      return drawers;
    });
  }

  /**
   * Cash paid out of a tablet's open drawer (the gas seller, a supplier), booked as an expense
   * on today's date. It can't be more than the drawer should hold.
   */
  async recordPayout(actor: Actor, shiftId: string, input: RecordPayoutDto) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [shift] = await tx
        .select()
        .from(shifts)
        .where(and(eq(shifts.id, shiftId), isNull(shifts.deletedAt)))
        .for('update');
      if (!shift) throw new NotFoundException('There is no such drawer shift');

      const [existing] = await tx
        .select({ id: cashMovements.id, shiftId: cashMovements.shiftId })
        .from(cashMovements)
        .where(eq(cashMovements.id, input.payoutId));
      if (existing) {
        if (existing.shiftId !== shiftId)
          throw new ConflictException('That payout is on another drawer');
        return { payoutId: existing.id };
      }

      if (shift.status !== 'OPEN') throw new BadRequestException('That drawer is already closed');
      const inDrawer = await expectedCash(tx, shift);
      if (input.amount > inDrawer) {
        throw new BadRequestException(`Only ${formatCedis(inDrawer)} should be in that drawer`);
      }

      const amount = pesewas(input.amount);
      const today = await businessToday(tx);
      await tx.insert(cashMovements).values({
        id: input.payoutId,
        tenantId: actor.tenantId,
        shiftId,
        type: 'PAYOUT',
        amount,
        category: input.category,
        note: input.note ?? null,
        staffId: actor.staffId,
        createdAtDevice: new Date(),
      });
      const expenseId = ulid();
      await tx.insert(expenses).values({
        id: expenseId,
        tenantId: actor.tenantId,
        locationId: shift.locationId,
        amount,
        category: input.category,
        method: 'CASH_DRAWER',
        note: input.note ?? null,
        spentOn: today.date,
        cashMovementId: input.payoutId,
        createdBy: actor.staffId,
      });
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'shift.payout',
        entityType: 'cash_movement',
        entityId: input.payoutId,
        after: { shiftId, amount, category: input.category, note: input.note, expenseId },
      });
      return { payoutId: input.payoutId };
    });
  }
}

async function lockOrder(tx: Tx, orderId: string) {
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)))
    .for('update');
  if (!order) throw new NotFoundException('There is no such order');
  return order;
}

@Controller('orders')
@ApiBearerAuth()
export class OrderMoneyController {
  constructor(private readonly manager: ManagerService) {}

  @Post(':orderId/refunds')
  @Authorized('refunds.record')
  @ApiCreatedResponse({ type: RefundRecordedDto.Output })
  recordRefund(
    @CurrentActor() actor: Actor,
    @Param('orderId') orderId: string,
    @Body() body: RecordRefundDto,
  ) {
    return this.manager.recordRefund(actor, orderId, body);
  }

  @Put(':orderId/discount')
  @Authorized('discounts.apply')
  @ApiOkResponse({ type: DiscountSetDto.Output })
  setDiscount(
    @CurrentActor() actor: Actor,
    @Param('orderId') orderId: string,
    @Body() body: SetDiscountDto,
  ) {
    return this.manager.setDiscount(actor, orderId, body);
  }
}

@Controller('drawers')
@ApiBearerAuth()
export class DrawersController {
  constructor(private readonly manager: ManagerService) {}

  @Get()
  @Authorized('payouts.record')
  @ApiOkResponse({ type: DrawerDto.Output, isArray: true })
  list(@CurrentActor() actor: Actor) {
    return this.manager.openDrawers(actor);
  }

  @Post(':shiftId/payouts')
  @Authorized('payouts.record')
  @ApiCreatedResponse({ type: PayoutRecordedDto.Output })
  recordPayout(
    @CurrentActor() actor: Actor,
    @Param('shiftId') shiftId: string,
    @Body() body: RecordPayoutDto,
  ) {
    return this.manager.recordPayout(actor, shiftId, body);
  }
}

@Module({ controllers: [OrderMoneyController, DrawersController], providers: [ManagerService] })
export class ManagerModule {}
