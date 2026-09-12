import { describe, expect, it } from 'vitest';
import { pesewas } from './money.js';
import {
  amountDue,
  isAwaitingPayment,
  paymentStartsPrep,
  refundOwed,
  type PayableOrder,
} from './order-payment.js';

const order = (overrides: Partial<PayableOrder> = {}): PayableOrder => ({
  status: 'CONFIRMED',
  total: pesewas(9000),
  deliveryFee: pesewas(0),
  deliveryFeeCollectedBy: null,
  amountPaid: pesewas(0),
  ...overrides,
});

describe('order payment rules', () => {
  it('leaves out a delivery fee the rider kept', () => {
    const delivered = { total: pesewas(10_000), deliveryFee: pesewas(1500) };
    expect(amountDue({ ...delivered, deliveryFeeCollectedBy: 'RIDER' })).toBe(8500);
    expect(amountDue({ ...delivered, deliveryFeeCollectedBy: 'VENDOR' })).toBe(10_000);
  });

  it('keeps an unpaid order off the prep queue while pay-first is on', () => {
    expect(isAwaitingPayment(order(), true)).toBe(true);
    expect(isAwaitingPayment(order({ status: 'NEW' }), true)).toBe(true);
    expect(isAwaitingPayment(order({ amountPaid: pesewas(9000) }), true)).toBe(false);
    expect(isAwaitingPayment(order(), false)).toBe(false);
    expect(isAwaitingPayment(order({ status: 'PREPARING' }), true)).toBe(false);
  });

  it('sends a confirmed order to the kitchen when the payment clears it', () => {
    const paid = order({ amountPaid: pesewas(9000) });
    expect(paymentStartsPrep(paid, true)).toBe(true);
    expect(paymentStartsPrep({ ...paid, status: 'NEW' }, true)).toBe(false);
    expect(paymentStartsPrep(paid, false)).toBe(false);
    expect(paymentStartsPrep(order({ amountPaid: pesewas(4500) }), true)).toBe(false);
  });

  it('owes back what was paid on a cancelled order', () => {
    expect(refundOwed(order({ status: 'CANCELLED', amountPaid: pesewas(9000) }))).toBe(9000);
    expect(
      refundOwed(order({ status: 'COMPLETED', total: pesewas(9000), amountPaid: pesewas(9000) })),
    ).toBe(0);
    // Paid twice (cash, then an old payment link): the extra is owed back.
    expect(
      refundOwed(order({ status: 'COMPLETED', total: pesewas(4500), amountPaid: pesewas(9000) })),
    ).toBe(4500);
  });
});
