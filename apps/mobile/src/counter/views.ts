import { amountDue, sub, type Pesewas } from '@plateraa/shared';
import { urgency, type LaneOrder } from './lanes';

/** The Orders screen's tabs. */
export type OrderFilter = 'unpaid' | 'active' | 'held' | 'completed' | 'cancelled';

export const ORDER_FILTERS: readonly { value: OrderFilter; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'active', label: 'Active' },
  { value: 'held', label: 'Held' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** What's still to be paid on an order: the total less anything paid (and a fee the rider kept). */
export function stillToPay(order: LaneOrder): Pesewas {
  return sub(
    amountDue({
      total: order.total,
      deliveryFee: order.delivery_fee,
      deliveryFeeCollectedBy: order.delivery_fee_collected_by,
    }),
    order.amount_paid,
  );
}

/** The tabs holding orders that are still going: what the counter is working on today. */
export const isOpenFilter = (filter: OrderFilter) =>
  filter === 'unpaid' || filter === 'active' || filter === 'held';

/**
 * Which tab an order belongs to. An order still owing money has its own tab (16 Sep, user
 * request), so Active is what has been paid for and is on its way.
 */
export function filterOf(order: LaneOrder): OrderFilter {
  if (order.status === 'CANCELLED') return 'cancelled';
  if (order.status === 'COMPLETED' || order.status === 'REFUNDED') return 'completed';
  if (order.on_hold) return 'held';
  return stillToPay(order) > 0 ? 'unpaid' : 'active';
}

/** Kitchen time runs from when the order was paid for (pay before prep), or from when it came in. */
export const kitchenSince = (order: { paid_at: string | null; created_at_device: string }) =>
  order.paid_at && order.paid_at > order.created_at_device
    ? order.paid_at
    : order.created_at_device;

export const minutesSince = (iso: string, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));

type Sortable = LaneOrder & { created_at_device: string; prepMinutes: number };

/**
 * Most urgent first: orders that are late and still unpaid, then unpaid ones, then the rest.
 * Within each, the one waiting longest comes first.
 */
export function byUrgency<T extends Sortable>(orders: readonly T[], now: Date): T[] {
  const rank = (order: T) => {
    const unpaid = filterOf(order) !== 'completed' && stillToPay(order) > 0;
    const late = urgency(order.created_at_device, order.prepMinutes, now) === 'red';
    return unpaid && late ? 0 : unpaid ? 1 : 2;
  };
  return [...orders].sort(
    (a, b) => rank(a) - rank(b) || a.created_at_device.localeCompare(b.created_at_device),
  );
}
