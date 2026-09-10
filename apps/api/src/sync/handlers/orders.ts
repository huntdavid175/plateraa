import {
  and,
  deliveryZones,
  eq,
  gte,
  inArray,
  isNull,
  itemChannelPrices,
  itemVariants,
  items,
  lte,
  modifiers,
  or,
  orderItems,
  orders,
  priceHistory,
  type Tx,
} from '@plateraa/db';
import {
  PricingError,
  canEditItems,
  canTransition,
  initialStatus,
  isActive,
  priceOrder,
  type Discount,
  type OrderSource,
  type PricedOrder,
  type SyncCommandOf,
} from '@plateraa/shared';
import { recordAudit } from '../../audit/audit';
import { CommandRejected, type CommandHandler, type HandlerContext } from '../sync.types';
import {
  adjustSellableStock,
  deviceTime,
  isApproved,
  loadOrder,
  quantitiesByItem,
  recordOrderEvent,
  upsertCustomer,
} from './common';

type Line = SyncCommandOf<'order.create'>['payload']['lines'][number];
type OrderItemRow = typeof orderItems.$inferInsert;

const DAY_MS = 86_400_000;

/** Was this the menu price for the line at some point in the 24 hours before the sale? */
async function wasRecentPrice(tx: Tx, line: Line, soldAt: Date): Promise<boolean> {
  const [match] = await tx
    .select({ id: priceHistory.id })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.itemId, line.itemId),
        line.variantId
          ? eq(priceHistory.variantId, line.variantId)
          : isNull(priceHistory.variantId),
        eq(priceHistory.price, line.unitPrice),
        lte(priceHistory.validFrom, soldAt),
        or(
          isNull(priceHistory.validTo),
          gte(priceHistory.validTo, new Date(soldAt.getTime() - DAY_MS)),
        ),
      ),
    );
  return Boolean(match);
}

interface PricedLines {
  rows: OrderItemRow[];
  priced: PricedOrder;
  reviewReasons: Set<string>;
}

/**
 * Re-prices the order with the shared pricing function and snapshots each line. A price that
 * doesn't match the menu, or a big discount without approval, doesn't lose the sale: the order
 * is kept and flagged for the owner to review.
 */
async function priceLines(
  ctx: HandlerContext,
  input: {
    orderId: string;
    source: OrderSource;
    lines: Line[];
    discount: Discount | undefined;
    deliveryFee: number | undefined;
    approvalId: string | undefined;
  },
): Promise<PricedLines> {
  const { tx } = ctx;
  let priced: PricedOrder;
  try {
    priced = priceOrder({
      lines: input.lines,
      discount: input.discount,
      deliveryFee: input.deliveryFee as PricedOrder['deliveryFee'] | undefined,
    });
  } catch (error) {
    if (error instanceof PricingError) throw new CommandRejected('INVALID_PRICE', error.message);
    throw error;
  }

  const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
  const variantIds = [...new Set(input.lines.flatMap((l) => (l.variantId ? [l.variantId] : [])))];
  const modifierIds = [
    ...new Set(input.lines.flatMap((l) => l.modifiers.map((m) => m.modifierId))),
  ];

  const itemById = new Map(
    (await tx.select().from(items).where(inArray(items.id, itemIds))).map((i) => [i.id, i]),
  );
  const variantById = new Map(
    variantIds.length
      ? (await tx.select().from(itemVariants).where(inArray(itemVariants.id, variantIds))).map(
          (v) => [v.id, v],
        )
      : [],
  );
  const modifierById = new Map(
    modifierIds.length
      ? (await tx.select().from(modifiers).where(inArray(modifiers.id, modifierIds))).map((m) => [
          m.id,
          m,
        ])
      : [],
  );
  const channelPrices = await tx
    .select()
    .from(itemChannelPrices)
    .where(
      and(inArray(itemChannelPrices.itemId, itemIds), eq(itemChannelPrices.source, input.source)),
    );

  const reviewReasons = new Set<string>();
  const overrideApproved = await isApproved(tx, {
    approvalId: input.approvalId,
    actions: ['PRICE_OVERRIDE'],
    orderId: input.orderId,
  });
  const soldAt = deviceTime(ctx);

  const rows: OrderItemRow[] = [];
  for (const [position, line] of input.lines.entries()) {
    const item = itemById.get(line.itemId);
    if (!item)
      throw new CommandRejected('UNKNOWN_ITEM', 'An item on this order is not on the menu');
    const variant = line.variantId ? variantById.get(line.variantId) : undefined;
    if (line.variantId && variant?.itemId !== item.id) {
      throw new CommandRejected(
        'UNKNOWN_VARIANT',
        `${item.name}: that size or option doesn't exist`,
      );
    }

    const channelPrice = channelPrices.find(
      (p) => p.itemId === item.id && (p.variantId ?? undefined) === line.variantId,
    )?.price;
    const menuPrice = channelPrice ?? variant?.price ?? item.price;
    if (
      line.unitPrice !== menuPrice &&
      !overrideApproved &&
      !(await wasRecentPrice(tx, line, soldAt))
    ) {
      reviewReasons.add('PRICE_MISMATCH');
    }

    const lineModifiers = line.modifiers.map((m) => {
      const modifier = modifierById.get(m.modifierId);
      if (!modifier) {
        throw new CommandRejected('UNKNOWN_MODIFIER', `${item.name}: an extra on it doesn't exist`);
      }
      if (modifier.priceDelta !== m.unitPriceDelta && !overrideApproved) {
        reviewReasons.add('PRICE_MISMATCH');
      }
      return {
        modifierId: modifier.id,
        name: modifier.name,
        unitPriceDelta: m.unitPriceDelta,
        quantity: m.quantity,
      };
    });

    const pricedLine = priced.lines[position]!;
    rows.push({
      id: line.lineId,
      tenantId: ctx.tenant.id,
      orderId: input.orderId,
      itemId: item.id,
      variantId: variant?.id ?? null,
      name: item.name,
      variantName: variant?.name ?? null,
      unitPrice: line.unitPrice,
      costPrice: variant?.costPrice ?? item.costPrice,
      modifiers: lineModifiers,
      quantity: line.quantity,
      unitTotal: pricedLine.unitTotal,
      lineTotal: pricedLine.lineTotal,
      station: item.station,
      note: line.note ?? null,
      position,
    });
  }

  if (input.discount && priced.discount > 0) {
    const bps =
      input.discount.kind === 'percent'
        ? input.discount.bps
        : Math.ceil((priced.discount * 10_000) / Math.max(priced.subtotal, 1));
    const approved = await isApproved(tx, {
      approvalId: input.approvalId,
      actions: ['DISCOUNT'],
      orderId: input.orderId,
    });
    if (bps > ctx.tenant.approvalDiscountThresholdBps && !approved) {
      reviewReasons.add('UNAPPROVED_DISCOUNT');
    }
  }

  return { rows, priced, reviewReasons };
}

async function flagForReview(ctx: HandlerContext, orderId: string, reasons: Set<string>) {
  if (!reasons.size) return;
  await recordAudit(ctx.tx, {
    tenantId: ctx.tenant.id,
    actorStaffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    action: 'order.flagged',
    entityType: 'order',
    entityId: orderId,
    after: { reasons: [...reasons] },
    deviceTs: deviceTime(ctx),
  });
}

function discountFields(discount: Discount | undefined) {
  return {
    discountBps: discount?.kind === 'percent' ? discount.bps : null,
    discountAmountInput: discount?.kind === 'amount' ? discount.amount : null,
  };
}

export const orderCreate: CommandHandler<'order.create'> = async (ctx) => {
  const { tx } = ctx;
  const p = ctx.command.payload;

  const [duplicate] = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.id, p.orderId));
  if (duplicate)
    throw new CommandRejected('DUPLICATE_ORDER', 'This order is already on the server');

  if (p.delivery?.zoneId) {
    const [zone] = await tx
      .select({ id: deliveryZones.id })
      .from(deliveryZones)
      .where(eq(deliveryZones.id, p.delivery.zoneId));
    if (!zone) throw new CommandRejected('UNKNOWN_ZONE', 'That delivery zone no longer exists');
  }

  const customerId = p.customer
    ? await upsertCustomer(ctx, {
        phone: p.customer.phone,
        name: p.customer.name,
        overwrite: false,
      })
    : null;

  const { rows, priced, reviewReasons } = await priceLines(ctx, {
    orderId: p.orderId,
    source: p.source,
    lines: p.lines,
    discount: p.discount,
    deliveryFee: p.delivery?.fee,
    approvalId: p.approvalId,
  });

  const status = initialStatus('MANUAL');
  await tx.insert(orders).values({
    id: p.orderId,
    tenantId: ctx.tenant.id,
    locationId: ctx.device.locationId,
    deviceId: ctx.device.id,
    displayNumber: p.displayNumber,
    businessDate: p.businessDate,
    source: p.source,
    arrivalMethod: 'MANUAL',
    externalReference: p.externalReference ?? null,
    type: p.type,
    status,
    customerId,
    deliveryAddress: p.delivery?.address ?? null,
    deliveryZoneId: p.delivery?.zoneId ?? null,
    deliveryFee: priced.deliveryFee,
    deliveryFeeCollectedBy: p.delivery?.feeCollectedBy ?? null,
    note: p.note ?? null,
    ...discountFields(p.discount),
    subtotal: priced.subtotal,
    discount: priced.discount,
    total: priced.total,
    reviewReasons: [...reviewReasons],
    createdBy: ctx.staff.staffId,
    createdAtDevice: deviceTime(ctx),
  });
  await tx.insert(orderItems).values(rows);
  await recordOrderEvent(ctx, p.orderId, null, status);
  await adjustSellableStock(ctx, p.businessDate, quantitiesByItem(p.lines), p.orderId);
  await flagForReview(ctx, p.orderId, reviewReasons);

  return {
    orderId: p.orderId,
    status,
    subtotal: priced.subtotal,
    discount: priced.discount,
    total: priced.total,
    reviewReasons: [...reviewReasons],
  };
};

export const orderUpdateItems: CommandHandler<'order.update_items'> = async (ctx) => {
  const { tx } = ctx;
  const p = ctx.command.payload;
  const order = await loadOrder(tx, p.orderId);
  if (!canEditItems(order.status)) {
    throw new CommandRejected('TOO_LATE_TO_EDIT', 'The kitchen has already started this order');
  }

  const existingDiscount: Discount | undefined =
    order.discountBps !== null
      ? { kind: 'percent', bps: order.discountBps }
      : order.discountAmountInput !== null
        ? { kind: 'amount', amount: order.discountAmountInput }
        : undefined;
  const discount = p.discount === undefined ? existingDiscount : (p.discount ?? undefined);

  const { rows, priced, reviewReasons } = await priceLines(ctx, {
    orderId: order.id,
    source: order.source,
    lines: p.lines,
    discount,
    deliveryFee: order.deliveryFee,
    approvalId: p.approvalId,
  });

  const previous = await tx
    .select({ id: orderItems.id, itemId: orderItems.itemId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, order.id), isNull(orderItems.deletedAt)));

  // Lines the phone kept are replaced in place; lines it dropped are soft-deleted so the removal syncs.
  const keptIds = rows.map((r) => r.id);
  await tx.delete(orderItems).where(inArray(orderItems.id, keptIds));
  const droppedIds = previous.map((l) => l.id).filter((id) => !keptIds.includes(id));
  if (droppedIds.length) {
    await tx
      .update(orderItems)
      .set({ deletedAt: new Date() })
      .where(inArray(orderItems.id, droppedIds));
  }
  await tx.insert(orderItems).values(rows);

  const change = quantitiesByItem(p.lines);
  for (const [itemId, qty] of quantitiesByItem(previous))
    change.set(itemId, (change.get(itemId) ?? 0) - qty);
  await adjustSellableStock(ctx, order.businessDate, change, order.id);

  const allReasons = new Set([...order.reviewReasons, ...reviewReasons]);
  await tx
    .update(orders)
    .set({
      ...discountFields(discount),
      subtotal: priced.subtotal,
      discount: priced.discount,
      total: priced.total,
      reviewReasons: [...allReasons],
    })
    .where(eq(orders.id, order.id));
  await flagForReview(ctx, order.id, reviewReasons);

  return {
    orderId: order.id,
    subtotal: priced.subtotal,
    discount: priced.discount,
    total: priced.total,
    reviewReasons: [...allReasons],
  };
};

export const orderSetStatus: CommandHandler<'order.set_status'> = async (ctx) => {
  const p = ctx.command.payload;
  const order = await loadOrder(ctx.tx, p.orderId);
  if (!canTransition(order.status, p.status, order.type)) {
    throw new CommandRejected(
      'INVALID_STATUS',
      `A ${order.status.toLowerCase()} order can't be marked ${p.status.toLowerCase()}`,
    );
  }
  await ctx.tx.update(orders).set({ status: p.status }).where(eq(orders.id, order.id));
  await recordOrderEvent(ctx, order.id, order.status, p.status);
  return { orderId: order.id, status: p.status };
};

async function setHold(ctx: HandlerContext, orderId: string, onHold: boolean) {
  const order = await loadOrder(ctx.tx, orderId);
  if (!isActive(order.status)) {
    throw new CommandRejected('ORDER_CLOSED', 'This order is already finished');
  }
  await ctx.tx.update(orders).set({ onHold }).where(eq(orders.id, order.id));
  return { orderId: order.id, onHold };
}

export const orderHold: CommandHandler<'order.hold'> = (ctx) =>
  setHold(ctx, ctx.command.payload.orderId, true);

export const orderResume: CommandHandler<'order.resume'> = (ctx) =>
  setHold(ctx, ctx.command.payload.orderId, false);

export const orderCancel: CommandHandler<'order.cancel'> = async (ctx) => {
  const { tx } = ctx;
  const p = ctx.command.payload;
  const order = await loadOrder(tx, p.orderId);
  if (!isActive(order.status)) {
    throw new CommandRejected('ORDER_CLOSED', 'This order is already finished');
  }
  if (order.amountPaid > 0) {
    throw new CommandRejected(
      'REFUND_FIRST',
      'Refund the money on this order before cancelling it',
    );
  }

  await tx
    .update(orders)
    .set({ status: 'CANCELLED', cancelReason: p.reason })
    .where(eq(orders.id, order.id));
  await recordOrderEvent(ctx, order.id, order.status, 'CANCELLED');

  const lines = await tx
    .select({ itemId: orderItems.itemId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, order.id), isNull(orderItems.deletedAt)));
  const returned = new Map([...quantitiesByItem(lines)].map(([id, qty]) => [id, -qty]));
  await adjustSellableStock(ctx, order.businessDate, returned, order.id);

  return { orderId: order.id, status: 'CANCELLED' };
};
