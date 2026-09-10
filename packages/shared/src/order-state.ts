export const ORDER_STATUSES = [
  'NEW',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TYPES = ['WALK_IN', 'PICKUP', 'DELIVERY'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ARRIVAL_METHODS = ['API', 'MANUAL'] as const;
export type ArrivalMethod = (typeof ARRIVAL_METHODS)[number];

export class OrderStateError extends Error {
  override name = 'OrderStateError';
}

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/**
 * Orders typed in by a person are already confirmed. Orders that arrive by API
 * (Bolt, storefront) start as NEW and wait for someone to accept them.
 */
export function initialStatus(arrival: ArrivalMethod): OrderStatus {
  return arrival === 'API' ? 'NEW' : 'CONFIRMED';
}

export function canTransition(from: OrderStatus, to: OrderStatus, type: OrderType): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  if (to === 'OUT_FOR_DELIVERY') return type === 'DELIVERY';
  // A delivery order is only complete once it has gone out.
  if (from === 'READY' && to === 'COMPLETED') return type !== 'DELIVERY';
  return true;
}

export function assertTransition(from: OrderStatus, to: OrderStatus, type: OrderType): void {
  if (!canTransition(from, to, type)) {
    throw new OrderStateError(`A ${type} order can't go from ${from} to ${to}`);
  }
}

/** The status one tap on the prep queue moves an order to, or null if there's no next step. */
export function nextStatus(from: OrderStatus, type: OrderType): OrderStatus | null {
  switch (from) {
    case 'NEW':
      return 'CONFIRMED';
    case 'CONFIRMED':
      return 'PREPARING';
    case 'PREPARING':
      return 'READY';
    case 'READY':
      return type === 'DELIVERY' ? 'OUT_FOR_DELIVERY' : 'COMPLETED';
    case 'OUT_FOR_DELIVERY':
      return 'COMPLETED';
    default:
      return null;
  }
}

/** Items can be edited until the kitchen starts on the order. */
export function canEditItems(status: OrderStatus): boolean {
  return status === 'NEW' || status === 'CONFIRMED';
}

export function isActive(status: OrderStatus): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED' && status !== 'REFUNDED';
}
