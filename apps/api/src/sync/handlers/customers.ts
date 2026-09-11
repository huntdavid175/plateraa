import type { CommandHandler } from '../sync.types';
import { upsertCustomer } from './common';

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
