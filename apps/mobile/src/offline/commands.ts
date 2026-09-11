import {
  PricingError,
  add,
  amountDue,
  canEditItems,
  canTransition,
  formatCedis,
  initialStatus,
  isActive,
  isAwaitingPayment,
  paymentStartsPrep,
  pesewas,
  priceOrder,
  sub,
  type Discount,
  type OrderInput,
  type PayableOrder,
  type Pesewas,
  type PricedOrder,
  type SyncCommand,
  type SyncCommandOf,
  type SyncCommandType,
} from '@plateraa/shared';
import type { CustomerRow, OrderRow, ShiftRow, StockItemRow } from './rows';
import { placeholders, type Row, type Sql } from './sql';
import type { CommandWriter } from './store';

/**
 * Each command applied to the tablet's own tables, the way the server's handler applies it
 * (apps/api/src/sync/handlers). The tablet's figures are provisional; the server's replace them.
 */

/** The tablet refuses a command it can already tell the server would refuse. */
export class LocalRejection extends Error {
  override name = 'LocalRejection';

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** What helpers shared by several commands need. */
interface BaseContext {
  writer: CommandWriter;
  command: Pick<SyncCommand, 'staffId' | 'deviceTs'>;
  deviceId: string;
  newId: () => string;
}

export interface ApplyContext<T extends SyncCommandType = SyncCommandType> extends BaseContext {
  command: SyncCommandOf<T>;
}

type Line = SyncCommandOf<'order.create'>['payload']['lines'][number];

async function loadOrder(tx: Sql, orderId: string): Promise<OrderRow> {
  const order = await tx.get<OrderRow>('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) throw new LocalRejection('ORDER_NOT_FOUND', 'That order is not on this tablet');
  return order;
}

function payable(order: OrderRow): PayableOrder {
  return {
    status: order.status,
    total: order.total,
    deliveryFee: order.delivery_fee,
    deliveryFeeCollectedBy: order.delivery_fee_collected_by,
    amountPaid: order.amount_paid,
  };
}

async function requirePaymentBeforePrep(tx: Sql): Promise<boolean> {
  const settings = await tx.get<{ on: number | null }>(
    'SELECT require_payment_before_prep AS "on" FROM settings LIMIT 1',
  );
  return settings?.on === null || settings?.on === undefined ? true : settings.on === 1;
}

function price(input: OrderInput): PricedOrder {
  try {
    return priceOrder(input);
  } catch (error) {
    if (error instanceof PricingError) throw new LocalRejection('INVALID_PRICE', error.message);
    throw error;
  }
}

/** Snapshots each line from the tablet's menu, refusing anything that isn't on it. */
async function lineRows(
  tx: Sql,
  orderId: string,
  lines: Line[],
  priced: PricedOrder,
): Promise<(Row & { id: string })[]> {
  const rows: (Row & { id: string })[] = [];
  for (const [position, line] of lines.entries()) {
    const item = await tx.get<{ name: string; station: string }>(
      'SELECT name, station FROM items WHERE id = ?',
      [line.itemId],
    );
    if (!item) throw new LocalRejection('UNKNOWN_ITEM', 'An item on this order is not on the menu');

    let variantName: string | null = null;
    if (line.variantId) {
      const variant = await tx.get<{ item_id: string; name: string }>(
        'SELECT item_id, name FROM item_variants WHERE id = ?',
        [line.variantId],
      );
      if (variant?.item_id !== line.itemId) {
        throw new LocalRejection(
          'UNKNOWN_VARIANT',
          `${item.name}: that size or option doesn't exist`,
        );
      }
      variantName = variant.name;
    }

    const modifiers = [];
    for (const modifier of line.modifiers) {
      const found = await tx.get<{ name: string }>('SELECT name FROM modifiers WHERE id = ?', [
        modifier.modifierId,
      ]);
      if (!found) {
        throw new LocalRejection('UNKNOWN_MODIFIER', `${item.name}: an extra on it doesn't exist`);
      }
      modifiers.push({ ...modifier, name: found.name });
    }

    const pricedLine = priced.lines[position]!;
    rows.push({
      id: line.lineId,
      order_id: orderId,
      item_id: line.itemId,
      variant_id: line.variantId ?? null,
      name: item.name,
      variant_name: variantName,
      unit_price: line.unitPrice,
      modifiers: JSON.stringify(modifiers),
      quantity: line.quantity,
      unit_total: pricedLine.unitTotal,
      line_total: pricedLine.lineTotal,
      station: item.station,
      note: line.note ?? null,
      position,
    });
  }
  return rows;
}

function quantitiesByItem(lines: { item_id?: string; itemId?: string; quantity: number }[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const itemId = (line.itemId ?? line.item_id)!;
    totals.set(itemId, (totals.get(itemId) ?? 0) + line.quantity);
  }
  return totals;
}

/**
 * Sales count down today's prep count; at zero the item is sold out for the day, and putting
 * stock back (a cancel) clears that. Items nobody counted today aren't tracked.
 */
async function adjustSellableStock(
  writer: CommandWriter,
  businessDate: string,
  soldByItem: Map<string, number>,
): Promise<void> {
  const itemIds = [...soldByItem].filter(([, quantity]) => quantity !== 0).map(([id]) => id);
  if (!itemIds.length) return;
  const tracked = await writer.tx.all<StockItemRow>(
    `SELECT * FROM stock_items
      WHERE kind = 'SELLABLE' AND on_hand_date = ? AND item_id IN (${placeholders(itemIds.length)})`,
    [businessDate, ...itemIds],
  );
  for (const stock of tracked) {
    const itemId = stock.item_id!;
    const sold = soldByItem.get(itemId) ?? 0;
    const onHand = stock.on_hand - sold;
    await writer.update('stock_items', stock.id, { on_hand: onHand });
    if (onHand <= 0) {
      await writer.update('items', itemId, { sold_out_on: businessDate });
    } else if (sold < 0) {
      await clearSoldOut(writer, itemId, businessDate);
    }
  }
}

async function clearSoldOut(writer: CommandWriter, itemId: string, businessDate: string) {
  const item = await writer.tx.get<{ sold_out_on: string | null }>(
    'SELECT sold_out_on FROM items WHERE id = ?',
    [itemId],
  );
  if (item?.sold_out_on === businessDate)
    await writer.update('items', itemId, { sold_out_on: null });
}

async function upsertCustomer(
  { writer, newId }: BaseContext,
  input: { customerId?: string; phone: string; name?: string; notes?: string; overwrite: boolean },
): Promise<string> {
  const existing = await writer.tx.get<CustomerRow>('SELECT * FROM customers WHERE phone = ?', [
    input.phone,
  ]);
  if (existing) {
    const name = input.overwrite
      ? (input.name ?? existing.name)
      : (existing.name ?? input.name ?? null);
    const notes = input.overwrite && input.notes !== undefined ? input.notes : existing.notes;
    if (name !== existing.name || notes !== existing.notes) {
      await writer.update('customers', existing.id, { name, notes });
    }
    return existing.id;
  }
  const id = input.customerId ?? newId();
  await writer.put('customers', {
    id,
    phone: input.phone,
    name: input.name ?? null,
    notes: input.notes ?? null,
    flagged: 0,
    flagged_reason: null,
  });
  return id;
}

async function loadOpenShift(tx: Sql, shiftId: string, deviceId: string): Promise<ShiftRow> {
  const shift = await tx.get<ShiftRow>('SELECT * FROM shifts WHERE id = ?', [shiftId]);
  if (!shift || shift.device_id !== deviceId) {
    throw new LocalRejection('SHIFT_NOT_FOUND', 'That drawer shift is not on this tablet');
  }
  if (shift.status !== 'OPEN') {
    throw new LocalRejection('SHIFT_CLOSED', 'That drawer shift is already closed');
  }
  return shift;
}

async function recordPayment(
  ctx: BaseContext,
  input: { paymentId: string; orderId: string; amount: Pesewas },
  payment: Row,
): Promise<void> {
  const { tx } = ctx.writer;
  const order = await loadOrder(tx, input.orderId);
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    throw new LocalRejection('ORDER_CLOSED', 'This order was cancelled or refunded');
  }
  const outstanding = sub(amountDue(payable(order)), order.amount_paid);
  if (input.amount > outstanding) {
    throw new LocalRejection(
      'OVERPAYMENT',
      `Only ${formatCedis(outstanding)} is left to pay on this order`,
    );
  }
  if (await tx.get('SELECT 1 AS found FROM payments WHERE id = ?', [input.paymentId])) {
    throw new LocalRejection('DUPLICATE_PAYMENT', 'This payment is already on this tablet');
  }

  await ctx.writer.put('payments', {
    id: input.paymentId,
    order_id: order.id,
    status: 'CONFIRMED',
    amount: input.amount,
    collected_by: ctx.command.staffId,
    created_at_device: ctx.command.deviceTs,
    ...payment,
  });
  const amountPaid = add(order.amount_paid, input.amount);
  // Pay before prep: the payment that clears the order sends it to the kitchen.
  const startsPrep = paymentStartsPrep(
    { ...payable(order), amountPaid },
    await requirePaymentBeforePrep(tx),
  );
  await ctx.writer.update(
    'orders',
    order.id,
    startsPrep ? { amount_paid: amountPaid, status: 'PREPARING' } : { amount_paid: amountPaid },
  );
}

async function setHold(ctx: BaseContext, orderId: string, onHold: boolean) {
  const order = await loadOrder(ctx.writer.tx, orderId);
  if (!isActive(order.status)) {
    throw new LocalRejection('ORDER_CLOSED', 'This order is already finished');
  }
  await ctx.writer.update('orders', order.id, { on_hold: onHold ? 1 : 0 });
}

type LocalHandlers = { [T in SyncCommandType]: (ctx: ApplyContext<T>) => Promise<void> };

const HANDLERS: LocalHandlers = {
  'order.create': async (ctx) => {
    const { writer, command } = ctx;
    const p = command.payload;
    if (await writer.tx.get('SELECT 1 AS found FROM orders WHERE id = ?', [p.orderId])) {
      throw new LocalRejection('DUPLICATE_ORDER', 'This order is already on this tablet');
    }
    if (
      p.delivery?.zoneId &&
      !(await writer.tx.get('SELECT 1 AS found FROM delivery_zones WHERE id = ?', [
        p.delivery.zoneId,
      ]))
    ) {
      throw new LocalRejection('UNKNOWN_ZONE', 'That delivery zone no longer exists');
    }
    const priced = price({ lines: p.lines, deliveryFee: p.delivery?.fee });
    const lines = await lineRows(writer.tx, p.orderId, p.lines, priced);
    const customerId = p.customer
      ? await upsertCustomer(ctx, { ...p.customer, overwrite: false })
      : null;

    await writer.put('orders', {
      id: p.orderId,
      device_id: ctx.deviceId,
      display_number: p.displayNumber,
      business_date: p.businessDate,
      source: p.source,
      arrival_method: 'MANUAL',
      external_reference: p.externalReference ?? null,
      type: p.type,
      status: initialStatus('MANUAL'),
      on_hold: 0,
      customer_id: customerId,
      delivery_address: p.delivery?.address ?? null,
      delivery_zone_id: p.delivery?.zoneId ?? null,
      delivery_fee: priced.deliveryFee,
      delivery_fee_collected_by: p.delivery?.feeCollectedBy ?? null,
      note: p.note ?? null,
      discount_bps: null,
      discount_amount_input: null,
      subtotal: priced.subtotal,
      discount: priced.discount,
      total: priced.total,
      amount_paid: 0,
      review_reasons: '[]',
      cancel_reason: null,
      created_by: command.staffId,
      created_at_device: command.deviceTs,
    });
    for (const line of lines) await writer.put('order_items', line);
    await adjustSellableStock(writer, p.businessDate, quantitiesByItem(p.lines));
  },

  'order.update_items': async ({ writer, command }) => {
    const p = command.payload;
    const order = await loadOrder(writer.tx, p.orderId);
    if (!canEditItems(order.status)) {
      throw new LocalRejection('TOO_LATE_TO_EDIT', 'The kitchen has already started this order');
    }
    // Keep any discount a manager applied on the dashboard.
    const discount: Discount | undefined =
      order.discount_bps !== null
        ? { kind: 'percent', bps: order.discount_bps }
        : order.discount_amount_input !== null
          ? { kind: 'amount', amount: order.discount_amount_input }
          : undefined;
    const priced = price({ lines: p.lines, discount, deliveryFee: order.delivery_fee });
    const rows = await lineRows(writer.tx, order.id, p.lines, priced);

    const previous = await writer.tx.all<{ id: string; item_id: string; quantity: number }>(
      'SELECT id, item_id, quantity FROM order_items WHERE order_id = ?',
      [order.id],
    );
    const kept = new Set(rows.map((row) => row.id));
    for (const line of previous)
      if (!kept.has(line.id)) await writer.delete('order_items', line.id);
    for (const row of rows) await writer.put('order_items', row);

    const change = quantitiesByItem(p.lines);
    for (const [itemId, quantity] of quantitiesByItem(previous)) {
      change.set(itemId, (change.get(itemId) ?? 0) - quantity);
    }
    await adjustSellableStock(writer, order.business_date, change);
    await writer.update('orders', order.id, {
      subtotal: priced.subtotal,
      discount: priced.discount,
      total: priced.total,
    });
  },

  'order.set_status': async ({ writer, command }) => {
    const p = command.payload;
    const order = await loadOrder(writer.tx, p.orderId);
    if (!canTransition(order.status, p.status, order.type)) {
      throw new LocalRejection(
        'INVALID_STATUS',
        `A ${order.status.toLowerCase()} order can't be marked ${p.status.toLowerCase()}`,
      );
    }
    if (
      p.status === 'PREPARING' &&
      isAwaitingPayment(payable(order), await requirePaymentBeforePrep(writer.tx))
    ) {
      throw new LocalRejection(
        'AWAITING_PAYMENT',
        "This order isn't paid yet. It goes to the kitchen once it's paid",
      );
    }
    await writer.update('orders', order.id, { status: p.status });
  },

  'order.hold': (ctx) => setHold(ctx, ctx.command.payload.orderId, true),
  'order.resume': (ctx) => setHold(ctx, ctx.command.payload.orderId, false),

  'order.cancel': async ({ writer, command }) => {
    const p = command.payload;
    const order = await loadOrder(writer.tx, p.orderId);
    if (!isActive(order.status)) {
      throw new LocalRejection('ORDER_CLOSED', 'This order is already finished');
    }
    await writer.update('orders', order.id, { status: 'CANCELLED', cancel_reason: p.reason });
    const lines = await writer.tx.all<{ item_id: string; quantity: number }>(
      'SELECT item_id, quantity FROM order_items WHERE order_id = ?',
      [order.id],
    );
    const returned = new Map(
      [...quantitiesByItem(lines)].map(([itemId, quantity]) => [itemId, -quantity]),
    );
    await adjustSellableStock(writer, order.business_date, returned);
  },

  'payment.record_cash': async (ctx) => {
    const p = ctx.command.payload;
    const shift = await loadOpenShift(ctx.writer.tx, p.shiftId, ctx.deviceId);
    await recordPayment(ctx, p, {
      method: 'CASH',
      tendered: p.tendered ?? null,
      shift_id: shift.id,
    });
  },

  'payment.record_platform': (ctx) =>
    recordPayment(ctx, ctx.command.payload, { method: 'PLATFORM', tendered: null, shift_id: null }),

  /** Saved at once, even offline; the server makes the link and texts it once this reaches it. */
  'payment.request_link': async ({ writer, command }) => {
    const p = command.payload;
    const order = await loadOrder(writer.tx, p.orderId);
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
      throw new LocalRejection('ORDER_CLOSED', 'This order was cancelled or refunded');
    }
    const owed = sub(amountDue(payable(order)), order.amount_paid);
    if (owed <= 0) throw new LocalRejection('ALREADY_PAID', 'This order is already paid');
    const open = await writer.tx.get(
      `SELECT 1 AS found FROM payment_links WHERE order_id = ?
         AND (status = 'QUEUED' OR (status = 'SENT' AND (expires_at IS NULL OR expires_at > ?)))`,
      [order.id, command.deviceTs],
    );
    if (open) {
      throw new LocalRejection(
        'LINK_ALREADY_OPEN',
        "A payment link for this order is still open. A new one can be sent once it's paid, expires or fails.",
      );
    }
    await writer.put('payment_links', {
      id: p.linkId,
      order_id: order.id,
      status: 'QUEUED',
      amount: owed,
      phone: p.phone,
      url: null,
      failure: null,
      sent_at: null,
      expires_at: null,
      paid_at: null,
      created_at_device: command.deviceTs,
    });
  },

  'shift.open': async ({ writer, command, deviceId }) => {
    const p = command.payload;
    if (
      await writer.tx.get(`SELECT 1 AS found FROM shifts WHERE device_id = ? AND status = 'OPEN'`, [
        deviceId,
      ])
    ) {
      throw new LocalRejection('SHIFT_ALREADY_OPEN', 'Close the current drawer shift first');
    }
    await writer.put('shifts', {
      id: p.shiftId,
      device_id: deviceId,
      status: 'OPEN',
      opened_by: command.staffId,
      opened_at: command.deviceTs,
      float_amount: p.float,
      closed_by: null,
      closed_at: null,
      expected_cash: null,
      counted_cash: null,
      variance: null,
    });
  },

  'shift.cash_movement': async ({ writer, command, deviceId }) => {
    const p = command.payload;
    const shift = await loadOpenShift(writer.tx, p.shiftId, deviceId);
    if (await writer.tx.get('SELECT 1 AS found FROM cash_movements WHERE id = ?', [p.movementId])) {
      throw new LocalRejection('DUPLICATE_MOVEMENT', 'This is already on this tablet');
    }
    await writer.put('cash_movements', {
      id: p.movementId,
      shift_id: shift.id,
      type: p.type,
      amount: p.amount,
      note: p.note ?? null,
      staff_id: command.staffId,
      created_at_device: command.deviceTs,
    });
  },

  /** Float + cash taken − payouts − drops + pay-ins, as far as this tablet knows. */
  'shift.close': async ({ writer, command, deviceId }) => {
    const p = command.payload;
    const shift = await loadOpenShift(writer.tx, p.shiftId, deviceId);
    const cashIn = await writer.tx.get<{ total: number }>(
      `SELECT coalesce(sum(amount), 0) AS total FROM payments
        WHERE shift_id = ? AND method = 'CASH' AND status = 'CONFIRMED'`,
      [shift.id],
    );
    const movements = await writer.tx.all<{ type: string; total: number }>(
      `SELECT type, coalesce(sum(amount), 0) AS total FROM cash_movements
        WHERE shift_id = ? GROUP BY type`,
      [shift.id],
    );
    const moved = (type: string) => pesewas(movements.find((m) => m.type === type)?.total ?? 0);
    const expected = sub(
      add(shift.float_amount, pesewas(cashIn?.total ?? 0), moved('PAY_IN')),
      add(moved('PAYOUT'), moved('DROP')),
    );
    await writer.update('shifts', shift.id, {
      status: 'CLOSED',
      closed_by: command.staffId,
      closed_at: command.deviceTs,
      expected_cash: expected,
      counted_cash: p.counted,
      variance: sub(p.counted, expected),
    });
  },

  'item.set_sold_out': async ({ writer, command }) => {
    const p = command.payload;
    if (!(await writer.tx.get('SELECT 1 AS found FROM items WHERE id = ?', [p.itemId]))) {
      throw new LocalRejection('UNKNOWN_ITEM', 'That item is not on the menu');
    }
    await writer.update('items', p.itemId, { sold_out_on: p.soldOut ? p.businessDate : null });
  },

  'stock.prep_count': async ({ writer, command }) => {
    const p = command.payload;
    const stock = await loadStockItem(writer.tx, p.stockItemId, 'SELLABLE');
    const onHand = stock.on_hand_date === p.businessDate ? stock.on_hand + p.quantity : p.quantity;
    await writer.update('stock_items', stock.id, { on_hand: onHand, on_hand_date: p.businessDate });
    if (stock.item_id && onHand > 0) await clearSoldOut(writer, stock.item_id, p.businessDate);
  },

  'stock.raw_count': async ({ writer, command }) => {
    const p = command.payload;
    const stock = await loadStockItem(writer.tx, p.stockItemId, 'RAW');
    await writer.update('stock_items', stock.id, { on_hand: p.counted });
  },

  'customer.upsert': async (ctx) => {
    await upsertCustomer(ctx, { ...ctx.command.payload, overwrite: true });
  },
};

async function loadStockItem(tx: Sql, stockItemId: string, kind: 'SELLABLE' | 'RAW') {
  const stock = await tx.get<StockItemRow>('SELECT * FROM stock_items WHERE id = ?', [stockItemId]);
  if (!stock) throw new LocalRejection('UNKNOWN_STOCK_ITEM', 'That stock item no longer exists');
  if (stock.kind !== kind) {
    throw new LocalRejection(
      'WRONG_STOCK_KIND',
      kind === 'SELLABLE'
        ? "That isn't a menu item's daily count"
        : "That isn't a raw ingredient count",
    );
  }
  return stock;
}

export function applyCommand(ctx: ApplyContext<SyncCommand['type']>): Promise<void> {
  const handler = HANDLERS[ctx.command.type] as (ctx: ApplyContext) => Promise<void>;
  return handler(ctx);
}
