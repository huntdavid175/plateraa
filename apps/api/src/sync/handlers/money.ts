import {
  and,
  channelCommissions,
  eq,
  orders,
  payments,
  platformReceivables,
  refunds,
  sql,
} from '@plateraa/db';
import { add, bpsOf, formatCedis, pesewas, sub, type Pesewas } from '@plateraa/shared';
import { ulid } from 'ulid';
import { recordAudit } from '../../audit/audit';
import { CommandRejected, type CommandHandler, type HandlerContext } from '../sync.types';
import { deviceTime, loadOrder, recordOrderEvent, requireUnusedApproval } from './common';
import { loadOpenShift } from './shifts';

type Order = Awaited<ReturnType<typeof loadOrder>>;

/** What the vendor collects: the total, less the delivery fee when the rider kept it. */
function amountDue(order: Order): Pesewas {
  return order.deliveryFeeCollectedBy === 'RIDER'
    ? sub(order.total, order.deliveryFee)
    : order.total;
}

function assertCanPay(order: Order, amount: Pesewas) {
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    throw new CommandRejected('ORDER_CLOSED', 'This order was cancelled or refunded');
  }
  const outstanding = sub(amountDue(order), order.amountPaid);
  if (amount > outstanding) {
    throw new CommandRejected(
      'OVERPAYMENT',
      `Only ${formatCedis(outstanding)} is left to pay on this order`,
    );
  }
}

async function assertNewPayment(ctx: HandlerContext, paymentId: string) {
  const [existing] = await ctx.tx
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.id, paymentId));
  if (existing)
    throw new CommandRejected('DUPLICATE_PAYMENT', 'This payment is already on the server');
}

async function addToAmountPaid(ctx: HandlerContext, orderId: string, amount: number) {
  const [updated] = await ctx.tx
    .update(orders)
    .set({ amountPaid: sql`${orders.amountPaid} + ${amount}` })
    .where(eq(orders.id, orderId))
    .returning({ amountPaid: orders.amountPaid });
  return updated!.amountPaid;
}

async function auditMoney(ctx: HandlerContext, action: string, entityId: string, after: object) {
  await recordAudit(ctx.tx, {
    tenantId: ctx.tenant.id,
    actorStaffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    action,
    entityType: action.split('.')[0]!,
    entityId,
    after,
    deviceTs: deviceTime(ctx),
  });
}

export const paymentRecordCash: CommandHandler<'payment.record_cash'> = async (ctx) => {
  const p = ctx.command.payload;
  const order = await loadOrder(ctx.tx, p.orderId);
  const shift = await loadOpenShift(ctx, p.shiftId);
  assertCanPay(order, p.amount);
  await assertNewPayment(ctx, p.paymentId);

  await ctx.tx.insert(payments).values({
    id: p.paymentId,
    tenantId: ctx.tenant.id,
    orderId: order.id,
    method: 'CASH',
    status: 'CONFIRMED',
    amount: p.amount,
    tendered: p.tendered ?? null,
    collectedBy: ctx.staff.staffId,
    shiftId: shift.id,
    deviceId: ctx.device.id,
    createdAtDevice: deviceTime(ctx),
  });
  const amountPaid = await addToAmountPaid(ctx, order.id, p.amount);
  await auditMoney(ctx, 'payment.recorded', p.paymentId, {
    orderId: order.id,
    method: 'CASH',
    amount: p.amount,
  });

  return {
    paymentId: p.paymentId,
    amountPaid,
    outstanding: sub(amountDue(order), amountPaid),
    change: p.tendered === undefined ? 0 : sub(p.tendered, p.amount),
  };
};

/**
 * The platform (Bolt, Chowdeck) took the money and pays the vendor later. Recorded as money the
 * platform owes, less the commission the owner set for that channel, if any.
 */
export const paymentRecordPlatform: CommandHandler<'payment.record_platform'> = async (ctx) => {
  const p = ctx.command.payload;
  const order = await loadOrder(ctx.tx, p.orderId);
  assertCanPay(order, p.amount);
  await assertNewPayment(ctx, p.paymentId);

  const [commission] = await ctx.tx
    .select()
    .from(channelCommissions)
    .where(eq(channelCommissions.source, order.source));
  const commissionEstimate =
    commission && (commission.rateBps !== null || commission.flatAmount !== null)
      ? add(
          commission.rateBps !== null ? bpsOf(p.amount, commission.rateBps) : pesewas(0),
          commission.flatAmount ?? pesewas(0),
        )
      : null;

  await ctx.tx.insert(payments).values({
    id: p.paymentId,
    tenantId: ctx.tenant.id,
    orderId: order.id,
    method: 'PLATFORM',
    status: 'CONFIRMED',
    amount: p.amount,
    collectedBy: ctx.staff.staffId,
    deviceId: ctx.device.id,
    createdAtDevice: deviceTime(ctx),
  });
  await ctx.tx.insert(platformReceivables).values({
    id: ulid(),
    tenantId: ctx.tenant.id,
    orderId: order.id,
    source: order.source,
    gross: p.amount,
    commissionEstimate,
  });
  const amountPaid = await addToAmountPaid(ctx, order.id, p.amount);
  await auditMoney(ctx, 'payment.recorded', p.paymentId, {
    orderId: order.id,
    method: 'PLATFORM',
    amount: p.amount,
  });

  return { paymentId: p.paymentId, amountPaid, commissionEstimate };
};

/**
 * Cash back to a customer. Always needs a Manager/Owner approval, used once. A completed order
 * refunded in full becomes REFUNDED.
 */
export const refundCreateCash: CommandHandler<'refund.create_cash'> = async (ctx) => {
  const p = ctx.command.payload;
  const order = await loadOrder(ctx.tx, p.orderId);
  const shift = await loadOpenShift(ctx, p.shiftId);

  if (p.amount > order.amountPaid) {
    throw new CommandRejected(
      'REFUND_TOO_LARGE',
      `Only ${formatCedis(order.amountPaid)} was paid on this order`,
    );
  }
  if (p.paymentId) {
    const [payment] = await ctx.tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.id, p.paymentId), eq(payments.orderId, order.id)));
    if (!payment)
      throw new CommandRejected('PAYMENT_NOT_FOUND', 'That payment is not on this order');
  }
  const [duplicate] = await ctx.tx
    .select({ id: refunds.id })
    .from(refunds)
    .where(eq(refunds.id, p.refundId));
  if (duplicate)
    throw new CommandRejected('DUPLICATE_REFUND', 'This refund is already on the server');

  await requireUnusedApproval(ctx.tx, {
    approvalId: p.approvalId,
    actions: ['REFUND'],
    orderId: order.id,
    amount: p.amount,
  });

  await ctx.tx.insert(refunds).values({
    id: p.refundId,
    tenantId: ctx.tenant.id,
    orderId: order.id,
    paymentId: p.paymentId ?? null,
    method: 'CASH',
    amount: p.amount,
    reason: p.reason,
    requestedBy: ctx.staff.staffId,
    approvalId: p.approvalId,
    shiftId: shift.id,
    deviceId: ctx.device.id,
    createdAtDevice: deviceTime(ctx),
  });
  const amountPaid = await addToAmountPaid(ctx, order.id, -p.amount);

  if (order.status === 'COMPLETED' && amountPaid === 0) {
    await ctx.tx.update(orders).set({ status: 'REFUNDED' }).where(eq(orders.id, order.id));
    await recordOrderEvent(ctx, order.id, 'COMPLETED', 'REFUNDED');
  }
  await auditMoney(ctx, 'refund.created', p.refundId, {
    orderId: order.id,
    amount: p.amount,
    reason: p.reason,
    approvalId: p.approvalId,
  });

  return { refundId: p.refundId, amountPaid };
};
