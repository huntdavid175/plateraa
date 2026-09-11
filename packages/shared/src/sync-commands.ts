import { z } from 'zod';
import type { Capability } from './capabilities.js';
import { DELIVERY_FEE_COLLECTORS, ORDER_SOURCES } from './enums.js';
import type { Pesewas } from './money.js';
import { ORDER_STATUSES, ORDER_TYPES } from './order-state.js';
import { normalizeGhanaPhone } from './phone.js';

/**
 * Commands a tablet pushes to POST /sync/push. The tablet applies them to its own SQLite
 * straight away; the server validates them with these schemas, applies each one idempotently
 * (keyed by the command id) and returns the authoritative result.
 *
 * Money never leaves the drawer through the tablet: refunds, payouts and discounts are recorded
 * by a manager on the dashboard, so there are no commands for them here.
 */

const ulid = z.ulid();
const money = z.int().transform((value) => value as Pesewas);
const nonNegativeMoney = z
  .int()
  .nonnegative()
  .transform((value) => value as Pesewas);
const positiveMoney = z
  .int()
  .positive()
  .transform((value) => value as Pesewas);
const businessDate = z.iso.date();
const text = (max: number) => z.string().trim().min(1).max(max);

export const phoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizeGhanaPhone(value);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'Not a Ghanaian phone number' });
    return z.NEVER;
  }
  return phone;
});

const orderLineSchema = z.object({
  lineId: ulid,
  itemId: ulid,
  variantId: ulid.optional(),
  quantity: z.int().min(1).max(999),
  /** Price snapshot from the tablet's catalog; the server checks it against price history. */
  unitPrice: nonNegativeMoney,
  modifiers: z
    .array(
      z.object({
        modifierId: ulid,
        unitPriceDelta: money,
        quantity: z.int().min(1).max(99),
      }),
    )
    .max(20)
    .default([]),
  note: text(200).optional(),
});

/** Strict: anything extra (a discount, say) is refused rather than quietly dropped. */
const orderCreate = z
  .strictObject({
    orderId: ulid,
    displayNumber: z.string().regex(/^[A-Z]?\d{1,4}$/),
    businessDate,
    source: z.enum(ORDER_SOURCES),
    type: z.enum(ORDER_TYPES),
    externalReference: text(100).optional(),
    customer: z.object({ phone: phoneSchema, name: text(80).optional() }).optional(),
    delivery: z
      .object({
        address: text(300),
        zoneId: ulid.optional(),
        fee: nonNegativeMoney,
        feeCollectedBy: z.enum(DELIVERY_FEE_COLLECTORS).optional(),
      })
      .optional(),
    note: text(300).optional(),
    lines: z.array(orderLineSchema).min(1).max(100),
  })
  .superRefine((order, ctx) => {
    if (order.type === 'DELIVERY' && !order.delivery) {
      ctx.addIssue({
        code: 'custom',
        path: ['delivery'],
        message: 'Delivery orders need an address and fee',
      });
    }
    if (order.type !== 'DELIVERY' && order.delivery) {
      ctx.addIssue({
        code: 'custom',
        path: ['delivery'],
        message: 'Only delivery orders take delivery details',
      });
    }
    if (order.type !== 'WALK_IN' && !order.customer) {
      ctx.addIssue({
        code: 'custom',
        path: ['customer'],
        message: 'Pickup and delivery orders need a phone number',
      });
    }
  });

/** Edit before prep: replaces the lines wholesale. Any discount a manager applied is kept. */
const orderUpdateItems = z.strictObject({
  orderId: ulid,
  lines: z.array(orderLineSchema).min(1).max(100),
});

const orderSetStatus = z.object({
  orderId: ulid,
  status: z.enum(ORDER_STATUSES).exclude(['NEW', 'CANCELLED', 'REFUNDED']),
});

const orderRef = z.object({ orderId: ulid });

/** A cancelled paid order leaves a refund owed; a manager records it on the dashboard. */
const orderCancel = z.object({
  orderId: ulid,
  reason: text(200),
});

const paymentRecordCash = z
  .object({
    paymentId: ulid,
    orderId: ulid,
    shiftId: ulid,
    amount: positiveMoney,
    tendered: nonNegativeMoney.optional(),
  })
  .refine((p) => p.tendered === undefined || p.tendered >= p.amount, {
    path: ['tendered'],
    message: 'Cash handed over is less than the amount paid',
  });

const paymentRecordPlatform = z.object({
  paymentId: ulid,
  orderId: ulid,
  amount: positiveMoney,
});

const shiftOpen = z.object({ shiftId: ulid, float: nonNegativeMoney });

/** Drops (cash taken out to the safe or the owner) and pay-ins. Payouts are dashboard-only. */
const shiftCashMovement = z.object({
  movementId: ulid,
  shiftId: ulid,
  type: z.enum(['DROP', 'PAY_IN']),
  amount: positiveMoney,
  note: text(200).optional(),
});

const shiftClose = z.object({ shiftId: ulid, counted: nonNegativeMoney });

const itemSetSoldOut = z.object({ itemId: ulid, soldOut: z.boolean(), businessDate });

/** "Made 40 more": adds to today's count for a sellable item. */
const stockPrepCount = z.object({
  movementId: ulid,
  stockItemId: ulid,
  quantity: z.int().min(1).max(9_999),
  businessDate,
});

/** A physical count of a raw item; the server records the difference as an adjustment. */
const stockRawCount = z.object({
  movementId: ulid,
  stockItemId: ulid,
  counted: z.int().min(0).max(999_999),
  businessDate,
});

const customerUpsert = z.object({
  customerId: ulid,
  phone: phoneSchema,
  name: text(80).optional(),
  notes: text(500).optional(),
});

const envelope = {
  /** The command's own ULID: the idempotency key. */
  id: ulid,
  /** Per-tablet counter, so the server can apply commands in the order they happened. */
  deviceSeq: z.int().nonnegative(),
  deviceTs: z.iso.datetime({ offset: true }),
  staffId: ulid,
};

function command<Type extends string, Payload extends z.ZodType>(type: Type, payload: Payload) {
  return z.object({ ...envelope, type: z.literal(type), payload });
}

export const syncCommandSchema = z.discriminatedUnion('type', [
  command('order.create', orderCreate),
  command('order.update_items', orderUpdateItems),
  command('order.set_status', orderSetStatus),
  command('order.hold', orderRef),
  command('order.resume', orderRef),
  command('order.cancel', orderCancel),
  command('payment.record_cash', paymentRecordCash),
  command('payment.record_platform', paymentRecordPlatform),
  command('shift.open', shiftOpen),
  command('shift.cash_movement', shiftCashMovement),
  command('shift.close', shiftClose),
  command('item.set_sold_out', itemSetSoldOut),
  command('stock.prep_count', stockPrepCount),
  command('stock.raw_count', stockRawCount),
  command('customer.upsert', customerUpsert),
]);

export const MAX_COMMANDS_PER_PUSH = 50;

export const syncPushRequestSchema = z.object({
  commands: z.array(syncCommandSchema).min(1).max(MAX_COMMANDS_PER_PUSH),
});

/** What the server works with, after validation (phones normalised, money branded). */
export type SyncCommand = z.output<typeof syncCommandSchema>;
/** What a tablet sends. */
export type SyncCommandInput = z.input<typeof syncCommandSchema>;
export type SyncCommandType = SyncCommand['type'];
export type SyncCommandOf<T extends SyncCommandType> = Extract<SyncCommand, { type: T }>;

/**
 * The permission the staff member who did a command needs. The server checks it per command,
 * against whoever did the action, not whoever happens to be logged in when the tablet syncs.
 */
export const COMMAND_CAPABILITY: Record<SyncCommandType, Capability> = {
  'order.create': 'orders.take',
  'order.update_items': 'orders.take',
  'order.set_status': 'orders.take',
  'order.hold': 'orders.take',
  'order.resume': 'orders.take',
  'order.cancel': 'orders.cancel',
  'payment.record_cash': 'payments.record',
  'payment.record_platform': 'payments.record',
  'shift.open': 'shift.operate',
  'shift.cash_movement': 'shift.operate',
  'shift.close': 'shift.operate',
  'item.set_sold_out': 'stock.count',
  'stock.prep_count': 'stock.count',
  'stock.raw_count': 'stock.count',
  'customer.upsert': 'orders.take',
};
