import { eq, receipts } from '@plateraa/db';
import { newToken } from '../../auth/secrets';
import type { CommandHandler } from '../sync.types';
import { loadOrder, upsertCustomer } from './common';

/** One customer per phone number: an existing number is updated, not duplicated. */
export const customerUpsert: CommandHandler<'customer.upsert'> = async (ctx) => {
  const p = ctx.command.payload;
  const customerId = await upsertCustomer(ctx, {
    customerId: p.customerId,
    phone: p.phone,
    name: p.name,
    notes: p.notes,
    overwrite: true,
  });
  return { customerId };
};

/** A digital receipt link to share on WhatsApp. The token is long and random. */
export const receiptCreateLink: CommandHandler<'receipt.create_link'> = async (ctx) => {
  const p = ctx.command.payload;
  const order = await loadOrder(ctx.tx, p.orderId);

  const [existing] = await ctx.tx.select().from(receipts).where(eq(receipts.id, p.receiptId));
  if (existing) return { receiptId: existing.id, token: existing.token };

  const token = newToken();
  await ctx.tx
    .insert(receipts)
    .values({ id: p.receiptId, tenantId: ctx.tenant.id, orderId: order.id, token });
  return { receiptId: p.receiptId, token };
};
