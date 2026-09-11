import type { OrderSource, OrderStatus, OrderType } from '@plateraa/shared';
import type { Lane } from './lanes';

export const SOURCE_LABELS: Record<OrderSource, string> = {
  POS: 'Walk-in',
  PHONE: 'Phone',
  STOREFRONT: 'Online',
  BOLT_FOOD: 'Bolt',
  CHOWDECK: 'Chowdeck',
  OTHER: 'Other',
};

export const LANE_LABELS: Record<Lane, string> = {
  'awaiting-payment': 'Awaiting payment',
  kitchen: 'Kitchen',
  ready: 'Ready',
  'on-hold': 'On hold',
  done: 'Done today',
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'New',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

/** The button that moves an order to its next step, or null when there's none. */
export function nextStepLabel(status: OrderStatus, type: OrderType): string | null {
  switch (status) {
    case 'NEW':
      return 'Accept';
    case 'CONFIRMED':
      return 'Start preparing';
    case 'PREPARING':
      return 'Ready';
    case 'READY':
      return type === 'DELIVERY' ? 'Out for delivery' : 'Handed over';
    case 'OUT_FOR_DELIVERY':
      return 'Delivered';
    default:
      return null;
  }
}

export const CANCEL_REASONS = [
  'Customer left',
  'Customer changed their mind',
  'Out of stock',
  'Entered by mistake',
];

/** Until Moolre is connected (plan.md §2.5), links can't go out yet. */
export const LINKS_NOT_ON = 'Sending payment links is switched on once Moolre is connected.';
