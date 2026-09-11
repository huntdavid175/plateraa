import {
  and,
  customers,
  eq,
  inArray,
  isNull,
  items,
  orderEvents,
  orders,
  sql,
  stockItems,
  stockMovements,
  type Tx,
} from '@plateraa/db';
import type { OrderStatus } from '@plateraa/shared';
import { ulid } from 'ulid';
import { CommandRejected, type HandlerContext } from '../sync.types';

/** The trading day a moment falls on, in the business's timezone (YYYY-MM-DD). */
export function businessDateOf(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export const deviceTime = (ctx: HandlerContext) => new Date(ctx.command.deviceTs);

export async function loadOrder(tx: Tx, orderId: string) {
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));
  if (!order) throw new CommandRejected('ORDER_NOT_FOUND', 'That order is not on the server');
  return order;
}

export async function recordOrderEvent(
  ctx: HandlerContext,
  orderId: string,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
) {
  await ctx.tx.insert(orderEvents).values({
    id: ulid(),
    tenantId: ctx.tenant.id,
    orderId,
    fromStatus,
    toStatus,
    staffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    deviceTs: deviceTime(ctx),
  });
}

/** Finds a customer by phone, or creates them. Returns the customer id. */
export async function upsertCustomer(
  ctx: HandlerContext,
  input: { customerId?: string; phone: string; name?: string; notes?: string; overwrite: boolean },
): Promise<string> {
  const [existing] = await ctx.tx
    .select()
    .from(customers)
    .where(and(eq(customers.phone, input.phone), isNull(customers.deletedAt)));
  if (existing) {
    const name = input.overwrite ? (input.name ?? existing.name) : (existing.name ?? input.name);
    const notes = input.overwrite && input.notes !== undefined ? input.notes : existing.notes;
    if (name !== existing.name || notes !== existing.notes) {
      await ctx.tx
        .update(customers)
        .set({ name: name ?? null, notes: notes ?? null })
        .where(eq(customers.id, existing.id));
    }
    return existing.id;
  }
  const id = input.customerId ?? ulid();
  await ctx.tx.insert(customers).values({
    id,
    tenantId: ctx.tenant.id,
    phone: input.phone,
    name: input.name ?? null,
    notes: input.notes ?? null,
  });
  return id;
}

/**
 * Sales count down today's prep count for linked sellable items (negative quantities put stock
 * back, e.g. on cancel). At zero the item is marked sold out for the day; putting stock back
 * clears that. Items nobody counted today aren't tracked.
 */
export async function adjustSellableStock(
  ctx: HandlerContext,
  businessDate: string,
  soldByItem: Map<string, number>,
  orderId: string,
) {
  const itemIds = [...soldByItem.entries()].filter(([, qty]) => qty !== 0).map(([id]) => id);
  if (!itemIds.length) return;

  const tracked = await ctx.tx
    .select({ id: stockItems.id, itemId: stockItems.itemId })
    .from(stockItems)
    .where(
      and(
        inArray(stockItems.itemId, itemIds),
        eq(stockItems.kind, 'SELLABLE'),
        eq(stockItems.onHandDate, businessDate),
        isNull(stockItems.deletedAt),
      ),
    );

  for (const stock of tracked) {
    const sold = soldByItem.get(stock.itemId!) ?? 0;
    const [updated] = await ctx.tx
      .update(stockItems)
      .set({ onHand: sql`${stockItems.onHand} - ${sold}` })
      .where(eq(stockItems.id, stock.id))
      .returning({ onHand: stockItems.onHand });
    await ctx.tx.insert(stockMovements).values({
      id: ulid(),
      tenantId: ctx.tenant.id,
      stockItemId: stock.id,
      type: 'SALE',
      quantity: -sold,
      businessDate,
      orderId,
      staffId: ctx.staff.staffId,
      deviceId: ctx.device.id,
      createdAtDevice: deviceTime(ctx),
    });
    if (updated && updated.onHand <= 0) {
      await ctx.tx
        .update(items)
        .set({ soldOutOn: businessDate })
        .where(eq(items.id, stock.itemId!));
    } else if (updated && sold < 0) {
      await ctx.tx
        .update(items)
        .set({ soldOutOn: null })
        .where(and(eq(items.id, stock.itemId!), eq(items.soldOutOn, businessDate)));
    }
  }
}

/** Quantity per item across order lines. */
export function quantitiesByItem(
  lines: { itemId: string; quantity: number }[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.itemId, (totals.get(line.itemId) ?? 0) + line.quantity);
  return totals;
}
