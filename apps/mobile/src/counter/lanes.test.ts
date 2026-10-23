import { pesewas } from '@brixx/shared';
import { describe, expect, it } from 'vitest';
import { laneOf, type LaneOrder } from './lanes';

const order = (changes: Partial<LaneOrder> = {}): LaneOrder => ({
  status: 'CONFIRMED',
  on_hold: 0,
  total: pesewas(4500),
  delivery_fee: pesewas(0),
  delivery_fee_collected_by: null,
  amount_paid: pesewas(0),
  pay_on_collection: 0,
  ...changes,
});

describe('which lane an order is in', () => {
  it('keeps an unpaid order out of the kitchen when the store takes payment first', () => {
    expect(laneOf(order(), true)).toBe('awaiting-payment');
    expect(laneOf(order({ amount_paid: pesewas(4500) }), true)).toBe('kitchen');
    expect(laneOf(order(), false)).toBe('kitchen');
  });

  it('sends an online order paid in cash when collected to the kitchen before it’s paid', () => {
    expect(laneOf(order({ pay_on_collection: 1 }), true)).toBe('kitchen');
    expect(laneOf(order({ pay_on_collection: 1, status: 'NEW' }), true)).toBe('kitchen');
  });
});
