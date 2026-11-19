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

/**
 * Waiting for payment (`isAwaitingPayment` in @brixx/shared, in SQL): with pay before prep on, an
 * order that isn't fully paid hasn't gone to the kitchen, and may never be paid. An online order
 * paid when it's collected is cooked first, so it never waits.
 */
export const awaitingPayment = sql`(${orders.status} in ('NEW', 'CONFIRMED') and not ${orders.payOnCollection} and ${orders.amountPaid} < ${dueSql} and coalesce((select ts.require_payment_before_prep from tenant_settings ts where ts.tenant_id = ${orders.tenantId}), true))`;

/**
 * Orders that count as sales: ones going ahead. Not cancelled or refunded, and not waiting for a
 * payment before the kitchen starts. An unpaid order a vendor cooks first (pay before prep off)
 * counts, and what's owed on it shows as unpaid.
 */
export const countsAsSale = sql`(${orders.status} not in ('CANCELLED', 'REFUNDED') and not ${awaitingPayment})`;

/** A Postgres sum (bigint, which arrives as a string) as pesewas. */
export const toPesewas = (value: string | number | null | undefined): Pesewas =>
  pesewas(Number(value ?? 0));
