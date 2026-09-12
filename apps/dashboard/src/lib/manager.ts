import type { ExpenseCategory } from '@plateraa/shared';
import { api, call } from './api';
import { queryClient } from './query';

/** After money changes, every screen showing orders, the day or drawers loads again. */
export function refreshMoney() {
  for (const key of ['orders', 'order', 'refunds-owed', 'day', 'drawers']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** The id is made when the form opens, so pressing Save again after a lost reply records it once. */
export const recordRefund = (
  orderId: string,
  body: { refundId: string; amount: number; method: 'CASH' | 'LINK'; reason: string },
) => call(api.POST('/api/orders/{orderId}/refunds', { params: { path: { orderId } }, body }));

export const setDiscount = (
  orderId: string,
  body: { kind: 'none' } | { kind: 'percent'; bps: number } | { kind: 'amount'; amount: number },
) => call(api.PUT('/api/orders/{orderId}/discount', { params: { path: { orderId } }, body }));

export const fetchDrawers = () => call(api.GET('/api/drawers'));
export type Drawer = Awaited<ReturnType<typeof fetchDrawers>>[number];

export const recordPayout = (
  shiftId: string,
  body: { payoutId: string; amount: number; category: ExpenseCategory; note?: string },
) => call(api.POST('/api/drawers/{shiftId}/payouts', { params: { path: { shiftId } }, body }));
