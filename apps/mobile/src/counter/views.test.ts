import { pesewas } from '@plateraa/shared';
import { describe, expect, it } from 'vitest';
import type { LaneOrder } from './lanes';
import { upcomingNumber } from './numbers';
import { byUrgency, filterOf, stillToPay } from './views';

const NOW = new Date('2026-09-17T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

function order(id: string, ageMinutes: number, changes: Partial<LaneOrder> = {}) {
  return {
    id,
    status: 'CONFIRMED' as const,
    on_hold: 0,
    total: pesewas(4500),
    delivery_fee: pesewas(0),
    delivery_fee_collected_by: null,
    amount_paid: pesewas(4500),
    created_at_device: minutesAgo(ageMinutes),
    prepMinutes: 10,
    ...changes,
  };
}

describe('the Orders screen', () => {
  it('puts late unpaid orders first, then unpaid ones, then the rest, oldest first', () => {
    const unpaid = { amount_paid: pesewas(0) };
    const sorted = byUrgency(
      [
        order('paid-old', 30),
        order('unpaid-new', 2, unpaid),
        order('unpaid-late', 20, unpaid),
        order('paid-new', 1),
        order('unpaid-older', 5, unpaid),
      ],
      NOW,
    );
    expect(sorted.map((o) => o.id)).toEqual([
      'unpaid-late',
      'unpaid-older',
      'unpaid-new',
      'paid-old',
      'paid-new',
    ]);
  });

  it('sorts orders into Active, Held, Completed and Cancelled', () => {
    expect(filterOf({ status: 'PREPARING', on_hold: 0 })).toBe('active');
    expect(filterOf({ status: 'CONFIRMED', on_hold: 1 })).toBe('held');
    expect(filterOf({ status: 'COMPLETED', on_hold: 0 })).toBe('completed');
    expect(filterOf({ status: 'CANCELLED', on_hold: 1 })).toBe('cancelled');
  });

  it('works out what is still to pay, leaving out a fee the rider kept', () => {
    expect(stillToPay(order('a', 1, { amount_paid: pesewas(1000) }))).toBe(3500);
    expect(
      stillToPay(
        order('b', 1, {
          total: pesewas(6000),
          delivery_fee: pesewas(1500),
          delivery_fee_collected_by: 'RIDER',
          amount_paid: pesewas(0),
        }),
      ),
    ).toBe(4500);
  });
});

describe('the next order number', () => {
  it('shows what the next order will be called, starting again each day', () => {
    const stored = JSON.stringify({ date: '2026-09-17', n: 13 });
    expect(upcomingNumber(stored, 'A', '2026-09-17')).toBe('A14');
    expect(upcomingNumber(stored, 'A', '2026-09-18')).toBe('A1');
    expect(upcomingNumber(undefined, 'B', '2026-09-17')).toBe('B1');
  });
});
