import { z } from 'zod';
import {
  APPROVAL_ACTIONS,
  CASH_MOVEMENT_TYPES,
  DELIVERY_FEE_COLLECTORS,
  EXPENSE_CATEGORIES,
  ORDER_SOURCES,
} from './enums.js';
import type { Pesewas } from './money.js';
import { ORDER_STATUSES, ORDER_TYPES } from './order-state.js';
import { normalizeGhanaPhone } from './phone.js';

/**
 * Commands a device pushes to POST /sync/push. The device applies them to its own SQLite
 * straight away; the server validates them with these schemas, applies each one idempotently
 * (keyed by the command id) and returns the authoritative result.
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

const discountSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('percent'), bps: z.int().min(1).max(10_000) }),
  z.object({ kind: z.literal('amount'), amount: positiveMoney }),
]);

const orderLineSchema = z.object({
  lineId: ulid,
  itemId: ulid,
  variantId: ulid.optional(),
  quantity: z.int().min(1).max(999),
  /** Price snapshot from the device's catalog; the server checks it against price history. */
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

const orderCreate = z
  .object({
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
    discount: discountSchema.optional(),
    /** Needed when the discount is above the owner's threshold or a price was overridden. */
    approvalId: ulid.optional(),
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

/** Edit before prep: replaces the lines and discount wholesale. */
const orderUpdateItems = z.object({
  orderId: ulid,
  lines: z.array(orderLineSchema).min(1).max(100),
  discount: discountSchema.nullable().optional(),
  approvalId: ulid.optional(),
});

const orderSetStatus = z.object({
  orderId: ulid,
  status: z.enum(ORDER_STATUSES).exclude(['NEW', 'CANCELLED', 'REFUNDED']),
});

const orderRef = z.object({ orderId: ulid });

/** Cancelling a paid order is a refund, so the server requires an approval if money was taken. */
const orderCancel = z.object({
  orderId: ulid,
  reason: text(200),
  approvalId: ulid.optional(),
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

/** Refunds always need a Manager/Owner approval. */
const refundCreateCash = z.object({
  refundId: ulid,
  orderId: ulid,
  paymentId: ulid.optional(),
  shiftId: ulid,
  amount: positiveMoney,
  reason: text(200),
  approvalId: ulid,
});

const shiftOpen = z.object({ shiftId: ulid, float: nonNegativeMoney });

const shiftCashMovement = z
  .object({
    movementId: ulid,
    shiftId: ulid,
    type: z.enum(CASH_MOVEMENT_TYPES),
    amount: positiveMoney,
    /** Payouts become expenses, so they need a category. */
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    note: text(200).optional(),
    approvalId: ulid.optional(),
  })
  .refine((m) => m.type !== 'PAYOUT' || m.category !== undefined, {
    path: ['category'],
    message: 'A payout needs an expense category',
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

const receiptCreateLink = z.object({ receiptId: ulid, orderId: ulid });

/** An owner's offline approval code, checked on the device and again by the server on sync. */
const approvalRecordOfflineCode = z.object({
  approvalId: ulid,
  action: z.enum(APPROVAL_ACTIONS),
  approverId: ulid,
  code: z.string().regex(/^\d{6}$/),
  codeWindow: z.int().nonnegative(),
  amount: positiveMoney.optional(),
  discountBps: z.int().min(1).max(10_000).optional(),
  orderId: ulid.optional(),
});

const envelope = {
  /** The command's own ULID: the idempotency key. */
  id: ulid,
  /** Per-device counter, so the server can apply commands in the order they happened. */
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
  command('refund.create_cash', refundCreateCash),
  command('shift.open', shiftOpen),
  command('shift.cash_movement', shiftCashMovement),
  command('shift.close', shiftClose),
  command('item.set_sold_out', itemSetSoldOut),
  command('stock.prep_count', stockPrepCount),
  command('stock.raw_count', stockRawCount),
  command('customer.upsert', customerUpsert),
  command('receipt.create_link', receiptCreateLink),
  command('approval.record_offline_code', approvalRecordOfflineCode),
]);

export const MAX_COMMANDS_PER_PUSH = 50;

export const syncPushRequestSchema = z.object({
  commands: z.array(syncCommandSchema).min(1).max(MAX_COMMANDS_PER_PUSH),
});

/** What the server works with, after validation (phones normalised, money branded). */
export type SyncCommand = z.output<typeof syncCommandSchema>;
/** What a device sends. */
export type SyncCommandInput = z.input<typeof syncCommandSchema>;
export type SyncCommandType = SyncCommand['type'];
export type SyncCommandOf<T extends SyncCommandType> = Extract<SyncCommand, { type: T }>;
