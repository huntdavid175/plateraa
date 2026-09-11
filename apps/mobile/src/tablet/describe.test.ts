import { describe, expect, it } from 'vitest';
import { describeCommand } from './describe';

describe('describeCommand', () => {
  it('says what a refused change was, in plain words', () => {
    expect(
      describeCommand({ type: 'order.create', payload: { displayNumber: 'A12', lines: [] } }),
    ).toBe('New order A12');
    expect(
      describeCommand({
        type: 'payment.record_cash',
        payload: { paymentId: 'p', orderId: 'o', shiftId: 's', amount: 4500 },
      }),
    ).toBe('Cash payment of GH₵45.00');
    expect(
      describeCommand({
        type: 'order.set_status',
        payload: { orderId: 'o', status: 'OUT_FOR_DELIVERY' },
      }),
    ).toBe('Order marked out for delivery');
    expect(
      describeCommand({
        type: 'shift.cash_movement',
        payload: { movementId: 'm', shiftId: 's', type: 'DROP', amount: 20000 },
      }),
    ).toBe('Cash drop of GH₵200.00');
  });
});
