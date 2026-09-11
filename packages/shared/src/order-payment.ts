import type { DeliveryFeeCollector } from './enums.js';
import { ZERO, sub, type Pesewas } from './money.js';
import type { OrderStatus } from './order-state.js';

export interface PayableOrder {
  status: OrderStatus;
  total: Pesewas;
  deliveryFee: Pesewas;
  deliveryFeeCollectedBy: DeliveryFeeCollector | null;
  amountPaid: Pesewas;
}

/** What the vendor collects on an order: the total, less the delivery fee when the rider kept it. */
export function amountDue(
  order: Pick<PayableOrder, 'total' | 'deliveryFee' | 'deliveryFeeCollectedBy'>,
): Pesewas {
  return order.deliveryFeeCollectedBy === 'RIDER'
    ? sub(order.total, order.deliveryFee)
    : order.total;
}

export function isFullyPaid(order: Omit<PayableOrder, 'status'>): boolean {
  return order.amountPaid >= amountDue(order);
}

/**
 * Pay before prep (a vendor setting, on by default): an order doesn't go to the kitchen until
 * it's fully paid. Until then it waits as "awaiting payment" and stays off the prep queue.
 */
export function isAwaitingPayment(order: PayableOrder, requirePaymentBeforePrep: boolean): boolean {
  return (
    requirePaymentBeforePrep &&
    (order.status === 'NEW' || order.status === 'CONFIRMED') &&
    !isFullyPaid(order)
  );
}

/** Whether the payment that just landed should send the order to the kitchen, with no extra tap. */
export function paymentStartsPrep(order: PayableOrder, requirePaymentBeforePrep: boolean): boolean {
  return requirePaymentBeforePrep && order.status === 'CONFIRMED' && isFullyPaid(order);
}

/** Money taken on a cancelled order that a manager still has to give back and record. */
export function refundOwed(order: Pick<PayableOrder, 'status' | 'amountPaid'>): Pesewas {
  return order.status === 'CANCELLED' ? order.amountPaid : ZERO;
}
