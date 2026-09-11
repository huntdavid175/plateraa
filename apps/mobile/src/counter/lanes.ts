import {
  isActive,
  isAwaitingPayment,
  type DeliveryFeeCollector,
  type OrderStatus,
  type Pesewas,
} from '@plateraa/shared';

/** Where an order shows in the orders list on the counter screen. */
export type Lane = 'awaiting-payment' | 'kitchen' | 'ready' | 'on-hold' | 'done';

export const LANES: readonly Lane[] = ['awaiting-payment', 'kitchen', 'ready', 'on-hold', 'done'];

export interface LaneOrder {
  status: OrderStatus;
  on_hold: number;
  total: Pesewas;
  delivery_fee: Pesewas;
  delivery_fee_collected_by: DeliveryFeeCollector | null;
  amount_paid: Pesewas;
}

/**
 * Pay before prep (on by default): an unpaid order waits under "Awaiting payment" and never
 * reaches the kitchen. With it off, a new order goes straight to the kitchen lane.
 */
export function laneOf(order: LaneOrder, requirePaymentBeforePrep: boolean): Lane {
  if (!isActive(order.status)) return 'done';
  if (order.on_hold) return 'on-hold';
  const payable = {
    status: order.status,
    total: order.total,
    deliveryFee: order.delivery_fee,
    deliveryFeeCollectedBy: order.delivery_fee_collected_by,
    amountPaid: order.amount_paid,
  };
  if (isAwaitingPayment(payable, requirePaymentBeforePrep)) return 'awaiting-payment';
  if (order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY') return 'ready';
  return 'kitchen';
}

export type Urgency = 'normal' | 'amber' | 'red';

/** How late an order is running: amber once it has taken its prep time, red at half as long again. */
export function urgency(sinceIso: string, targetMinutes: number, now: Date): Urgency {
  const minutes = (now.getTime() - new Date(sinceIso).getTime()) / 60_000;
  if (minutes >= targetMinutes * 1.5) return 'red';
  if (minutes >= targetMinutes) return 'amber';
  return 'normal';
}

/** "4 min", "1 h 05" — how long an order has been waiting. */
export function waitingFor(sinceIso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(sinceIso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}
