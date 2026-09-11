import type { OrderSource, OrderStatus, OrderType, PaymentLinkStatus } from '@plateraa/shared';
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
