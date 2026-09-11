import { and, eq, gt, moolreAccounts, or, paymentLinks } from '@plateraa/db';
import { amountDue, sub } from '@plateraa/shared';
import { recordAudit } from '../../audit/audit';
import { CommandRejected, type CommandHandler } from '../sync.types';
import { deviceTime, loadOrder } from './common';

/**
 * Asks for a Moolre payment link for what's still owed. The link is made and texted after this
 * transaction commits (payments/payment-links.service.ts), so a slow Moolre never holds up a sync.
 * One open link per order at a time, so a customer can't pay the same order twice.
 */
export const paymentRequestLink: CommandHandler<'payment.request_link'> = async (ctx) => {
  const p = ctx.command.payload;
  const order = await loadOrder(ctx.tx, p.orderId);
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    throw new CommandRejected('ORDER_CLOSED', 'This order was cancelled or refunded');
  }
  const owed = sub(amountDue(order), order.amountPaid);
  if (owed <= 0) throw new CommandRejected('ALREADY_PAID', 'This order is already paid');

  const [account] = await ctx.tx.select({ tenantId: moolreAccounts.tenantId }).from(moolreAccounts);
  if (!account) {
    throw new CommandRejected(
      'MOOLRE_NOT_CONNECTED',
      "This business hasn't connected its Moolre account yet, so payment links can't go out. Take cash for now.",
    );
  }

  const [existing] = await ctx.tx
    .select({ id: paymentLinks.id })
    .from(paymentLinks)
    .where(eq(paymentLinks.id, p.linkId));
  if (existing) throw new CommandRejected('DUPLICATE_LINK', 'This link is already on the server');

  const [open] = await ctx.tx
    .select({ id: paymentLinks.id })
    .from(paymentLinks)
    .where(
      and(
        eq(paymentLinks.orderId, order.id),
        or(
          eq(paymentLinks.status, 'QUEUED'),
          and(eq(paymentLinks.status, 'SENT'), gt(paymentLinks.expiresAt, new Date())),
        ),
      ),
    );
  if (open) {
    throw new CommandRejected(
      'LINK_ALREADY_OPEN',
      "A payment link for this order is still open. A new one can be sent once it's paid, expires or fails.",
    );
  }

  await ctx.tx.insert(paymentLinks).values({
    id: p.linkId,
    tenantId: ctx.tenant.id,
    orderId: order.id,
    status: 'QUEUED',
    amount: owed,
    phone: p.phone,
    requestedBy: ctx.staff.staffId,
    deviceId: ctx.device.id,
    createdAtDevice: deviceTime(ctx),
  });
  await recordAudit(ctx.tx, {
    tenantId: ctx.tenant.id,
    actorStaffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    action: 'payment_link.requested',
    entityType: 'payment_link',
    entityId: p.linkId,
    after: { orderId: order.id, amount: owed },
    deviceTs: deviceTime(ctx),
  });
  return { linkId: p.linkId, amount: owed, status: 'QUEUED' };
};
