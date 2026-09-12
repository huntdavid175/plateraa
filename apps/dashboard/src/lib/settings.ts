import type { VendorType } from '@plateraa/shared';
import { api, call } from './api';
import { queryClient } from './query';

export const fetchSettings = () => call(api.GET('/api/settings'));
export type Settings = Awaited<ReturnType<typeof fetchSettings>>;
export type OrderSettings = Settings['orders'];
export type Commissions = Settings['commissions'];

export const saveBusiness = (body: { name: string; vendorType: VendorType }) =>
  call(api.PUT('/api/settings/business', { body }));

export const saveOrderSettings = (body: OrderSettings) =>
  call(api.PUT('/api/settings/orders', { body }));

export const saveMoolre = (body: {
  apiUser: string;
  publicKey: string;
  accountNumber: string;
  email: string;
}) => call(api.PUT('/api/settings/moolre', { body }));

export const saveCommissions = (body: Commissions) =>
  call(api.PUT('/api/settings/commissions', { body }));

/** After a change, settings load again, and so does the business name in the sidebar. */
export function refreshSettings() {
  void queryClient.invalidateQueries({ queryKey: ['settings'] });
  void queryClient.invalidateQueries({ queryKey: ['me'] });
  void queryClient.invalidateQueries({ queryKey: ['businesses'] });
}
