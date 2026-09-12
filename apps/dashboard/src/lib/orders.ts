import { api, call } from './api';

export const fetchOrders = (query: { date?: string; limit?: number }) =>
  call(api.GET('/api/orders', { params: { query } }));

export const fetchRefundsOwed = () => call(api.GET('/api/orders/refunds-owed'));

/** One order as the dashboard lists it. Money is in pesewas. */
export type OrderRow = Awaited<ReturnType<typeof fetchOrders>>[number];

/** "Jollof rice (Large) × 2 +1": the first item, and how many more. */
export function orderLine(items: OrderRow['items']): string {
  const [first, ...rest] = items;
  if (!first) return 'No items';
  const name = first.variantName ? `${first.name} (${first.variantName})` : first.name;
  const quantity = first.quantity > 1 ? ` × ${first.quantity}` : '';
  return `${name}${quantity}${rest.length > 0 ? ` +${rest.length}` : ''}`;
}

export type PaymentState = { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' };

/** Paid, Unpaid, Refund owed or Cancelled, as the badge on an order says it. */
export function paymentState(
  order: Pick<OrderRow, 'status' | 'amountDue' | 'amountPaid' | 'refundOwed'>,
): PaymentState {
  if (order.refundOwed > 0) return { label: 'Refund owed', tone: 'red' };
  if (order.status === 'CANCELLED') return { label: 'Cancelled', tone: 'neutral' };
  if (order.status === 'REFUNDED') return { label: 'Refunded', tone: 'neutral' };
  if (order.amountPaid >= order.amountDue) return { label: 'Paid', tone: 'green' };
  return { label: 'Unpaid', tone: 'amber' };
}
