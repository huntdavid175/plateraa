import type {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentLinkStatus,
  PaymentMethod,
} from '@plateraa/shared';
import type { Lane } from './lanes';

export const SOURCE_LABELS: Record<OrderSource, string> = {
  POS: 'Counter',
  PHONE: 'Phone',
  STOREFRONT: 'Online',
  BOLT_FOOD: 'Bolt',
  CHOWDECK: 'Chowdeck',
  OTHER: 'Other',
};

export const TYPE_LABELS: Record<OrderType, string> = {
  DINE_IN: 'Dine-in',
  PICKUP: 'Pickup',
  DELIVERY: 'Delivery',
};

/**
 * What kind of order it is, as its card says it: "Dine-in", or "Bolt · Pickup" for one that didn't
 * come in at the counter (older phone orders, and later the platforms' own).
 */
export function kindLabel(order: { source: OrderSource; type: OrderType }): string {
  return order.source === 'POS'
    ? TYPE_LABELS[order.type]
    : `${SOURCE_LABELS[order.source]} · ${TYPE_LABELS[order.type]}`;
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  LINK: 'Payment links',
  PLATFORM: 'Paid on the platform',
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
      return type === 'DELIVERY'
        ? 'Out for delivery'
        : type === 'DINE_IN'
          ? 'Served'
          : 'Handed over';
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

/** How a payment link goes out, for the sheets where one is chosen. */
export const LINK_NOTE =
  "The link is texted to the customer as soon as the tablet is online. The order waits under “Awaiting payment”, and goes to the kitchen once it's paid.";

/** "+233241234567" as people write it: "024 123 4567". */
export function phoneWords(phone: string): string {
  if (!/^\+233\d{9}$/.test(phone)) return phone;
  const national = `0${phone.slice(4)}`;
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/** A payment link's state, in words, with the colour that goes with it. */
export function linkWords(link: {
  status: PaymentLinkStatus;
  phone: string;
  failure: string | null;
}): { text: string; tone: 'info' | 'good' | 'amber' | 'red' } {
  switch (link.status) {
    case 'QUEUED':
      return {
        text: `Payment link to ${phoneWords(link.phone)} goes out as soon as the tablet is online.`,
        tone: 'info',
      };
    case 'SENT':
      return {
        text: `Payment link texted to ${phoneWords(link.phone)}. Waiting for them to pay.`,
        tone: 'info',
      };
    case 'PAID':
      return { text: 'Paid by payment link.', tone: 'good' };
    case 'FAILED':
      return {
        text: `The payment link didn't go. ${link.failure ?? 'Send it again.'}`,
        tone: 'red',
      };
    case 'EXPIRED':
      return { text: 'The payment link expired unpaid. Send a new one.', tone: 'amber' };
  }
}
