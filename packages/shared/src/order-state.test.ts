import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUSES,
  ORDER_TYPES,
  OrderStateError,
  assertTransition,
  canEditItems,
  canTransition,
  initialStatus,
  isActive,
  nextStatus,
  type OrderStatus,
  type OrderType,
} from './order-state.js';

function tapThrough(start: OrderStatus, type: OrderType): OrderStatus[] {
  const path: OrderStatus[] = [start];
  let current: OrderStatus | null = start;
  while ((current = nextStatus(current, type))) {
    expect(canTransition(path[path.length - 1]!, current, type)).toBe(true);
    path.push(current);
  }
  return path;
}

describe('order state machine', () => {
  it('starts manual orders confirmed and API orders new', () => {
    expect(initialStatus('MANUAL')).toBe('CONFIRMED');
    expect(initialStatus('API')).toBe('NEW');
  });

  it('taps a walk-in order through to completed without going out for delivery', () => {
    expect(tapThrough('NEW', 'WALK_IN')).toEqual([
      'NEW',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'COMPLETED',
    ]);
  });

  it('taps a delivery order out for delivery before completing', () => {
    expect(tapThrough('CONFIRMED', 'DELIVERY')).toEqual([
      'CONFIRMED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
      'COMPLETED',
    ]);
  });

  it('blocks impossible jumps', () => {
    expect(canTransition('READY', 'COMPLETED', 'DELIVERY')).toBe(false);
    expect(canTransition('READY', 'OUT_FOR_DELIVERY', 'PICKUP')).toBe(false);
    expect(canTransition('NEW', 'READY', 'WALK_IN')).toBe(false);
    expect(canTransition('CONFIRMED', 'REFUNDED', 'WALK_IN')).toBe(false);
    expect(() => assertTransition('COMPLETED', 'PREPARING', 'PICKUP')).toThrow(OrderStateError);
  });

  it('lets every active order be cancelled and nothing leave a terminal state', () => {
    for (const type of ORDER_TYPES) {
      for (const status of ORDER_STATUSES) {
        if (isActive(status)) {
          expect(canTransition(status, 'CANCELLED', type)).toBe(true);
        }
        if (status === 'CANCELLED' || status === 'REFUNDED') {
          for (const to of ORDER_STATUSES) expect(canTransition(status, to, type)).toBe(false);
          expect(nextStatus(status, type)).toBeNull();
        }
      }
    }
  });

  it('only allows editing items before prep starts', () => {
    expect(ORDER_STATUSES.filter(canEditItems)).toEqual(['NEW', 'CONFIRMED']);
  });
});
