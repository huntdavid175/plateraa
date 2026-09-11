import {
  amountDue,
  businessDateOf,
  nextStatus,
  type DeliveryFeeCollector,
  type OrderSource,
  type OrderStatus,
  type OrderType,
  type Pesewas,
} from '@plateraa/shared';
import type { SyncEngine } from '../offline/engine';
import type { Sql } from '../offline/sql';
import { nextDisplayNumber } from './numbers';
import { payloadLines, priceTicket, type TicketLine } from './ticket';

/**
 * What the counter does, as sync commands. Each is saved on the tablet at once and uploaded in
 * the background; the screens only call these.
 */

/** Who is doing it, on which tablet. */
export interface Counter {
  engine: SyncEngine;
  staffId: string;
  deviceId: string;
  deviceCode: string;
  timezone?: string;
  now?: () => Date;
}

export interface OrderDraft {
  source: OrderSource;
  type: OrderType;
  lines: TicketLine[];
  customer?: { phone: string; name?: string };
  delivery?: {
    address: string;
    zoneId?: string;
    fee: Pesewas;
    feeCollectedBy?: DeliveryFeeCollector;
  };
  externalReference?: string;
  note?: string;
}

export interface PlacedOrder {
  orderId: string;
  displayNumber: string;
  total: Pesewas;
  /** What the vendor collects: the total, less a delivery fee the rider kept. */
  due: Pesewas;
}

export function businessDate(counter: Pick<Counter, 'timezone' | 'now'>): string {
  return businessDateOf(counter.now?.() ?? new Date(), counter.timezone ?? 'Africa/Accra');
}

export async function placeOrder(counter: Counter, draft: OrderDraft): Promise<PlacedOrder> {
  const date = businessDate(counter);
  const displayNumber = await nextDisplayNumber(counter.engine.db, counter.deviceCode, date);
  const orderId = counter.engine.newId();
  await counter.engine.record(
    'order.create',
    {
      orderId,
      displayNumber,
      businessDate: date,
      source: draft.source,
      type: draft.type,
      ...(draft.externalReference ? { externalReference: draft.externalReference } : {}),
      ...(draft.customer ? { customer: draft.customer } : {}),
      ...(draft.delivery ? { delivery: draft.delivery } : {}),
      ...(draft.note ? { note: draft.note } : {}),
      lines: payloadLines(draft.lines),
    },
    counter.staffId,
  );
  const priced = priceTicket(draft.lines, draft.delivery?.fee);
  return {
    orderId,
    displayNumber,
    total: priced.total,
    due: amountDue({
      total: priced.total,
      deliveryFee: priced.deliveryFee,
      deliveryFeeCollectedBy: draft.delivery?.feeCollectedBy ?? null,
    }),
  };
}

/** Replaces an order's items before the kitchen starts on it. */
export function updateItems(counter: Counter, orderId: string, lines: TicketLine[]) {
  return counter.engine.record(
    'order.update_items',
    { orderId, lines: payloadLines(lines) },
    counter.staffId,
  );
}

/** This tablet's open cash drawer, given the tablet's id. */
export const OPEN_SHIFT_SQL = `SELECT id FROM shifts WHERE device_id = ? AND status = 'OPEN' LIMIT 1`;

/** This tablet's open cash drawer, if any. */
export async function openShiftOf(db: Sql, deviceId: string): Promise<string | null> {
  const shift = await db.get<{ id: string }>(OPEN_SHIFT_SQL, [deviceId]);
  return shift?.id ?? null;
}

/** Opens the drawer with the float counted into it. */
export async function openDrawer(counter: Counter, float: Pesewas): Promise<string> {
  const shiftId = counter.engine.newId();
  await counter.engine.record('shift.open', { shiftId, float }, counter.staffId);
  return shiftId;
}

/**
 * Texts the customer a payment link for what's still owed. Saved at once, even offline; the
 * server makes and sends the link once this reaches it.
 */
export function requestLink(counter: Counter, orderId: string, phone: string) {
  return counter.engine.record(
    'payment.request_link',
    { linkId: counter.engine.newId(), orderId, phone },
    counter.staffId,
  );
}

/** Marks an item sold out for the rest of today, or back on sale. */
export function setSoldOut(counter: Counter, itemId: string, soldOut: boolean) {
  return counter.engine.record(
    'item.set_sold_out',
    { itemId, soldOut, businessDate: businessDate(counter) },
    counter.staffId,
  );
}

/** "Made 20 more": adds to today's portion count, and takes the item off sold out. */
export function addPortions(counter: Counter, stockItemId: string, quantity: number) {
  return counter.engine.record(
    'stock.prep_count',
    {
      movementId: counter.engine.newId(),
      stockItemId,
      quantity,
      businessDate: businessDate(counter),
    },
    counter.staffId,
  );
}

/** Cash taken out of the drawer (to the safe or the owner) or put into it. */
export function moveCash(
  counter: Counter,
  input: { shiftId: string; type: 'DROP' | 'PAY_IN'; amount: Pesewas; note?: string },
) {
  const { note, ...rest } = input;
  return counter.engine.record(
    'shift.cash_movement',
    { movementId: counter.engine.newId(), ...rest, ...(note ? { note } : {}) },
    counter.staffId,
  );
}

/** Closes the drawer with the cash counted; the tablet works out what it expected. */
export function closeDrawer(counter: Counter, shiftId: string, counted: Pesewas) {
  return counter.engine.record('shift.close', { shiftId, counted }, counter.staffId);
}

export function payCash(
  counter: Counter,
  input: { orderId: string; shiftId: string; amount: Pesewas; tendered?: Pesewas },
) {
  return counter.engine.record(
    'payment.record_cash',
    { paymentId: counter.engine.newId(), ...input },
    counter.staffId,
  );
}

/** Bolt Food or Chowdeck took the money; they pay the vendor later. */
export function markPaidOnPlatform(counter: Counter, input: { orderId: string; amount: Pesewas }) {
  return counter.engine.record(
    'payment.record_platform',
    { paymentId: counter.engine.newId(), ...input },
    counter.staffId,
  );
}

/** One tap on the queue: the order moves to its next step. */
export async function advance(
  counter: Counter,
  order: { id: string; status: OrderStatus; type: OrderType },
): Promise<OrderStatus | null> {
  const next = nextStatus(order.status, order.type);
  if (!next || next === 'NEW') return null;
  await counter.engine.record(
    'order.set_status',
    { orderId: order.id, status: next as Exclude<OrderStatus, 'NEW' | 'CANCELLED' | 'REFUNDED'> },
    counter.staffId,
  );
  return next;
}

export function setOnHold(counter: Counter, orderId: string, onHold: boolean) {
  return counter.engine.record(
    onHold ? 'order.hold' : 'order.resume',
    { orderId },
    counter.staffId,
  );
}

/** Anyone can cancel; money already taken shows as a refund owed for a manager to record. */
export function cancelOrder(counter: Counter, orderId: string, reason: string) {
  return counter.engine.record('order.cancel', { orderId, reason }, counter.staffId);
}
