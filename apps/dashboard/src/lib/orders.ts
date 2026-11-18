import type { paths } from '@brixx/api-client';
import { Check, Clock, Undo2, X, type LucideIcon } from 'lucide-react';
import { api, call } from './api';

/** A day (`date`) or a range (`from`, `to`), and the filters figures link to. */
export type OrdersQuery = NonNullable<paths['/api/orders']['get']['parameters']['query']>;

export const fetchOrders = (query: OrdersQuery) =>
  call(api.GET('/api/orders', { params: { query } }));

export const fetchRefundsOwed = () => call(api.GET('/api/orders/refunds-owed'));

export const fetchOrder = (orderId: string) =>
  call(api.GET('/api/orders/{orderId}', { params: { path: { orderId } } }));

/** One order as the dashboard lists it. Money is in pesewas. */
export type OrderRow = Awaited<ReturnType<typeof fetchOrders>>[number];

/** One order in full: its lines, payments, links, refunds and history. */
export type OrderDetail = Awaited<ReturnType<typeof fetchOrder>>;

/** "Jollof rice (Large) × 2 +1": the first item, and how many more. */
export function orderLine(items: OrderRow['items']): string {
  const [first, ...rest] = items;
  if (!first) return 'No items';
  const name = first.variantName ? `${first.name} (${first.variantName})` : first.name;
  const quantity = first.quantity > 1 ? ` × ${first.quantity}` : '';
  return `${name}${quantity}${rest.length > 0 ? ` +${rest.length}` : ''}`;
}

export type PaymentKey = 'PAID' | 'UNPAID' | 'REFUND_OWED' | 'CANCELLED' | 'REFUNDED';

export interface PaymentState {
  key: PaymentKey;
  label: string;
  tone: 'green' | 'amber' | 'red' | 'neutral';
}

/** Paid, Unpaid, Refund owed or Cancelled, as the badge on an order says it. */
export function paymentState(
  order: Pick<OrderRow, 'status' | 'amountDue' | 'amountPaid' | 'refundOwed'>,
): PaymentState {
  if (order.refundOwed > 0) return { key: 'REFUND_OWED', label: 'Refund owed', tone: 'red' };
  if (order.status === 'CANCELLED')
    return { key: 'CANCELLED', label: 'Cancelled', tone: 'neutral' };
  if (order.status === 'REFUNDED') return { key: 'REFUNDED', label: 'Refunded', tone: 'neutral' };
  if (order.amountPaid >= order.amountDue) return { key: 'PAID', label: 'Paid', tone: 'green' };
  return { key: 'UNPAID', label: 'Unpaid', tone: 'amber' };
}

/** A payment state's tone as a feed's circle takes it. */
export const FEED_TONES = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
  neutral: 'neutral',
} as const;

/** The icon in an order's circle in a feed, so its state never rests on colour alone. */
export const PAYMENT_ICONS: Record<PaymentKey, LucideIcon> = {
  PAID: Check,
  UNPAID: Clock,
  REFUND_OWED: Undo2,
  CANCELLED: X,
  REFUNDED: Undo2,
};

/** One line of an order in full: "2 × Jollof rice (Large)". */
export function itemWords(item: OrderRow['items'][number]): string {
  const name = item.variantName ? `${item.name} (${item.variantName})` : item.name;
  return item.quantity > 1 ? `${item.quantity} × ${name}` : name;
}

/** Where a link to an order came from, so its page can offer the way back. */
export interface BackTo {
  back: string;
  label: string;
}
