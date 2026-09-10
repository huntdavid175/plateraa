import { and, eq, items, sql, stockItems, stockMovements } from '@plateraa/db';
import type { StockKind } from '@plateraa/shared';
import { recordAudit } from '../../audit/audit';
import { CommandRejected, type CommandHandler, type HandlerContext } from '../sync.types';
import { deviceTime } from './common';

async function loadStockItem(ctx: HandlerContext, stockItemId: string, kind: StockKind) {
  const [stock] = await ctx.tx.select().from(stockItems).where(eq(stockItems.id, stockItemId));
  if (!stock || stock.deletedAt) {
    throw new CommandRejected('UNKNOWN_STOCK_ITEM', 'That stock item no longer exists');
  }
  if (stock.kind !== kind) {
    throw new CommandRejected(
      'WRONG_STOCK_KIND',
      kind === 'SELLABLE'
        ? "That isn't a menu item's daily count"
        : "That isn't a raw ingredient count",
    );
  }
  return stock;
}

async function assertNewMovement(ctx: HandlerContext, movementId: string) {
  const [existing] = await ctx.tx
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(eq(stockMovements.id, movementId));
  if (existing)
    throw new CommandRejected('DUPLICATE_MOVEMENT', 'This count is already on the server');
}

export const itemSetSoldOut: CommandHandler<'item.set_sold_out'> = async (ctx) => {
  const p = ctx.command.payload;
  const [item] = await ctx.tx.select({ id: items.id }).from(items).where(eq(items.id, p.itemId));
  if (!item) throw new CommandRejected('UNKNOWN_ITEM', 'That item is not on the menu');

  await ctx.tx
    .update(items)
    .set({ soldOutOn: p.soldOut ? p.businessDate : null })
    .where(eq(items.id, item.id));
  await recordAudit(ctx.tx, {
    tenantId: ctx.tenant.id,
    actorStaffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    action: p.soldOut ? 'item.sold_out' : 'item.back_in_stock',
    entityType: 'item',
    entityId: item.id,
    after: { businessDate: p.businessDate },
    deviceTs: deviceTime(ctx),
  });
  return { itemId: item.id, soldOut: p.soldOut };
};

/** "Made 40 more": adds to today's count, or starts a fresh count on a new trading day. */
export const stockPrepCount: CommandHandler<'stock.prep_count'> = async (ctx) => {
  const p = ctx.command.payload;
  const stock = await loadStockItem(ctx, p.stockItemId, 'SELLABLE');
  await assertNewMovement(ctx, p.movementId);

  const [updated] = await ctx.tx
    .update(stockItems)
    .set({
      onHand: sql`case when ${stockItems.onHandDate} = ${p.businessDate} then ${stockItems.onHand} + ${p.quantity} else ${p.quantity} end`,
      onHandDate: p.businessDate,
    })
    .where(eq(stockItems.id, stock.id))
    .returning({ onHand: stockItems.onHand });
  await ctx.tx.insert(stockMovements).values({
    id: p.movementId,
    tenantId: ctx.tenant.id,
    stockItemId: stock.id,
    type: 'PREP',
    quantity: p.quantity,
    businessDate: p.businessDate,
    staffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    createdAtDevice: deviceTime(ctx),
  });

  // More was made, so it's no longer sold out today.
  if (stock.itemId && updated!.onHand > 0) {
    await ctx.tx
      .update(items)
      .set({ soldOutOn: null })
      .where(and(eq(items.id, stock.itemId), eq(items.soldOutOn, p.businessDate)));
  }
  return { stockItemId: stock.id, onHand: updated!.onHand };
};

/** A physical count of a raw ingredient. The difference is recorded, so shrinkage shows up. */
export const stockRawCount: CommandHandler<'stock.raw_count'> = async (ctx) => {
  const p = ctx.command.payload;
  const stock = await loadStockItem(ctx, p.stockItemId, 'RAW');
  await assertNewMovement(ctx, p.movementId);
  const difference = p.counted - stock.onHand;

  await ctx.tx.update(stockItems).set({ onHand: p.counted }).where(eq(stockItems.id, stock.id));
  if (difference !== 0) {
    await ctx.tx.insert(stockMovements).values({
      id: p.movementId,
      tenantId: ctx.tenant.id,
      stockItemId: stock.id,
      type: 'COUNT_ADJUST',
      quantity: difference,
      businessDate: p.businessDate,
      staffId: ctx.staff.staffId,
      deviceId: ctx.device.id,
      createdAtDevice: deviceTime(ctx),
    });
  }
  await recordAudit(ctx.tx, {
    tenantId: ctx.tenant.id,
    actorStaffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    action: 'stock.counted',
    entityType: 'stock_item',
    entityId: stock.id,
    before: { onHand: stock.onHand },
    after: { onHand: p.counted },
    deviceTs: deviceTime(ctx),
  });
  return { stockItemId: stock.id, onHand: p.counted, difference };
};
