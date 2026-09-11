import { channelCommissions, eq, orders, payments, platformReceivables, sql } from '@plateraa/db';
import {
  add,
  amountDue,
  bpsOf,
  formatCedis,
  paymentStartsPrep,
  pesewas,
  sub,
  type OrderStatus,
  type Pesewas,
} from '@plateraa/shared';
import { ulid } from 'ulid';
import { recordAudit } from '../../audit/audit';
import { CommandRejected, type CommandHandler, type HandlerContext } from '../sync.types';
import { deviceTime, loadOrder, recordOrderEvent } from './common';
import { loadOpenShift } from './shifts';

type Order = Awaited<ReturnType<typeof loadOrder>>;

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
  if (existing) {
    throw new CommandRejected('DUPLICATE_PAYMENT', 'This payment is already on the server');
  }
}

async function addToAmountPaid(ctx: HandlerContext, orderId: string, amount: number) {
  const [updated] = await ctx.tx
    .update(orders)
    .set({ amountPaid: sql`${orders.amountPaid} + ${amount}` })
    .where(eq(orders.id, orderId))
    .returning({ amountPaid: orders.amountPaid });
  return updated!.amountPaid;
}

/** Pay before prep: the payment that clears an order sends it to the kitchen, with no extra tap. */
async function startPrepIfPaid(
  ctx: HandlerContext,
  order: Order,
  amountPaid: Pesewas,
): Promise<OrderStatus> {
  if (!paymentStartsPrep({ ...order, amountPaid }, ctx.tenant.requirePaymentBeforePrep)) {
    return order.status;
  }
  await ctx.tx.update(orders).set({ status: 'PREPARING' }).where(eq(orders.id, order.id));
  await recordOrderEvent(ctx, order.id, order.status, 'PREPARING');
  return 'PREPARING';
}

async function auditPayment(ctx: HandlerContext, paymentId: string, after: object) {
  await recordAudit(ctx.tx, {
    tenantId: ctx.tenant.id,
    actorStaffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    action: 'payment.recorded',
    entityType: 'payment',
    entityId: paymentId,
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
  const status = await startPrepIfPaid(ctx, order, amountPaid);
  await auditPayment(ctx, p.paymentId, { orderId: order.id, method: 'CASH', amount: p.amount });

  return {
    paymentId: p.paymentId,
    amountPaid,
    outstanding: sub(amountDue(order), amountPaid),
    change: p.tendered === undefined ? 0 : sub(p.tendered, p.amount),
    status,
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
  const status = await startPrepIfPaid(ctx, order, amountPaid);
  await auditPayment(ctx, p.paymentId, {
    orderId: order.id,
    method: 'PLATFORM',
    amount: p.amount,
  });

  return { paymentId: p.paymentId, amountPaid, commissionEstimate, status };
};
