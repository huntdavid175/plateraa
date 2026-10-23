import { NotFoundException } from '@nestjs/common';
import { orders, sql, tenants, type Tx } from '@brixx/db';
import { pesewas, type Pesewas } from '@brixx/shared';

/** Today's trading day (YYYY-MM-DD) and the timezone it's in, for the business in `tx`. */
export async function businessToday(tx: Tx): Promise<{ date: string; timezone: string }> {
  const [tenant] = await tx
    .select({
      date: sql<string>`(now() at time zone ${tenants.timezone})::date::text`,
      timezone: tenants.timezone,
    })
    .from(tenants);
  if (!tenant) throw new NotFoundException();
  return tenant;
}

/** SQL for what the vendor collects on an order: the total, less a delivery fee the rider kept. */
export const dueSql = sql`(${orders.total} - case when ${orders.deliveryFeeCollectedBy} = 'RIDER' then ${orders.deliveryFee} else 0 end)`;

/** Orders that count as sales: everything but cancelled and refunded ones. */
export const countsAsSale = sql`${orders.status} not in ('CANCELLED', 'REFUNDED')`;

/** A Postgres sum (bigint, which arrives as a string) as pesewas. */
export const toPesewas = (value: string | number | null | undefined): Pesewas =>
  pesewas(Number(value ?? 0));
