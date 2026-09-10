import { describe, expect, it } from 'vitest';
import {
  MAX_COMMANDS_PER_PUSH,
  syncCommandSchema,
  syncPushRequestSchema,
  type SyncCommandInput,
} from './sync-commands.js';

// Fixed, valid ULIDs for readable tests.
const ID = {
  cmd: '01JZ0000000000000000000001',
  staff: '01JZ0000000000000000000002',
  order: '01JZ0000000000000000000003',
  line: '01JZ0000000000000000000004',
  item: '01JZ0000000000000000000005',
  shift: '01JZ0000000000000000000006',
  payment: '01JZ0000000000000000000007',
  approval: '01JZ0000000000000000000008',
};

function envelope<T extends SyncCommandInput['type']>(type: T) {
  return {
    id: ID.cmd,
    deviceSeq: 1,
    deviceTs: '2026-09-10T12:00:00+00:00',
    staffId: ID.staff,
    type,
  };
}

const walkIn = {
  ...envelope('order.create'),
  payload: {
    orderId: ID.order,
    displayNumber: '014',
    businessDate: '2026-09-10',
    source: 'POS',
    type: 'WALK_IN',
    lines: [{ lineId: ID.line, itemId: ID.item, quantity: 2, unitPrice: 4500 }],
  },
} satisfies SyncCommandInput;

const parse = (value: unknown) => syncCommandSchema.safeParse(value);

describe('sync commands', () => {
  it('accepts a walk-in cash order and fills defaults', () => {
    const result = parse(walkIn);
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'order.create') {
      expect(result.data.payload.lines[0]?.modifiers).toEqual([]);
    }
  });

  it('normalises customer phone numbers', () => {
    const result = parse({
      ...walkIn,
      payload: {
        ...walkIn.payload,
        type: 'PICKUP',
        customer: { phone: '024 123 4567', name: 'Ama' },
      },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'order.create') {
      expect(result.data.payload.customer?.phone).toBe('+233241234567');
    }
  });

  it('requires a phone for pickup and an address for delivery', () => {
    expect(parse({ ...walkIn, payload: { ...walkIn.payload, type: 'PICKUP' } }).success).toBe(
      false,
    );
    expect(
      parse({
        ...walkIn,
        payload: { ...walkIn.payload, type: 'DELIVERY', customer: { phone: '0241234567' } },
      }).success,
    ).toBe(false);
    expect(
      parse({
        ...walkIn,
        payload: {
          ...walkIn.payload,
          type: 'DELIVERY',
          customer: { phone: '0241234567' },
          delivery: { address: 'Osu, near the Shell', fee: 1500 },
        },
      }).success,
    ).toBe(true);
  });

  it('rejects fractional or negative money', () => {
    const line = walkIn.payload.lines[0];
    for (const unitPrice of [45.5, -100]) {
      expect(
        parse({ ...walkIn, payload: { ...walkIn.payload, lines: [{ ...line, unitPrice }] } })
          .success,
      ).toBe(false);
    }
  });

  it('rejects cash tendered below the amount', () => {
    const payment = {
      ...envelope('payment.record_cash'),
      payload: { paymentId: ID.payment, orderId: ID.order, shiftId: ID.shift, amount: 9000 },
    };
    expect(parse({ ...payment, payload: { ...payment.payload, tendered: 10_000 } }).success).toBe(
      true,
    );
    expect(parse({ ...payment, payload: { ...payment.payload, tendered: 5000 } }).success).toBe(
      false,
    );
  });

  it('requires an approval on every refund', () => {
    const refund = {
      ...envelope('refund.create_cash'),
      payload: {
        refundId: ID.payment,
        orderId: ID.order,
        shiftId: ID.shift,
        amount: 4500,
        reason: 'Wrong order',
      },
    };
    expect(parse(refund).success).toBe(false);
    expect(
      parse({ ...refund, payload: { ...refund.payload, approvalId: ID.approval } }).success,
    ).toBe(true);
  });

  it('requires an expense category on a drawer payout', () => {
    const payout = {
      ...envelope('shift.cash_movement'),
      payload: { movementId: ID.payment, shiftId: ID.shift, type: 'PAYOUT', amount: 20_000 },
    };
    expect(parse(payout).success).toBe(false);
    expect(parse({ ...payout, payload: { ...payout.payload, category: 'GAS' } }).success).toBe(
      true,
    );
    expect(parse({ ...payout, payload: { ...payout.payload, type: 'DROP' } }).success).toBe(true);
  });

  it("won't set NEW, CANCELLED or REFUNDED through set_status", () => {
    for (const status of ['NEW', 'CANCELLED', 'REFUNDED']) {
      expect(
        parse({ ...envelope('order.set_status'), payload: { orderId: ID.order, status } }).success,
      ).toBe(false);
    }
    expect(
      parse({ ...envelope('order.set_status'), payload: { orderId: ID.order, status: 'READY' } })
        .success,
    ).toBe(true);
  });

  it('rejects unknown command types and malformed ids', () => {
    expect(parse({ ...walkIn, type: 'order.delete' }).success).toBe(false);
    expect(parse({ ...walkIn, id: 'not-a-ulid' }).success).toBe(false);
  });

  it('limits a push to 50 commands', () => {
    const batch = (n: number) => ({ commands: Array.from({ length: n }, () => walkIn) });
    expect(syncPushRequestSchema.safeParse(batch(MAX_COMMANDS_PER_PUSH)).success).toBe(true);
    expect(syncPushRequestSchema.safeParse(batch(MAX_COMMANDS_PER_PUSH + 1)).success).toBe(false);
    expect(syncPushRequestSchema.safeParse(batch(0)).success).toBe(false);
  });
});
