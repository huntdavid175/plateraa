import type { Capability, VendorType } from '@brixx/shared';
import { api, call } from './api';
import { queryClient } from './query';

/**
 * The Settings page's sections a person may open, in order. The chosen one lives in the address
 * (`/settings?tab=orders`; Business has none), so the Online store can link straight to one.
 */
export function settingsTabs(capabilities: readonly Capability[]) {
  const isOwner = capabilities.includes('settings.manage');
  const setsUpMenu = capabilities.includes('catalog.manage');
  return [
    { value: 'business', label: 'Business' },
    ...(isOwner ? [{ value: 'orders', label: 'Orders' }] : []),
    ...(setsUpMenu ? [{ value: 'delivery', label: 'Delivery' }] : []),
    ...(isOwner ? [{ value: 'payments', label: 'Payments' }] : []),
    { value: 'appearance', label: 'Appearance' },
  ];
}

export const fetchSettings = () => call(api.GET('/api/settings'));
export type Settings = Awaited<ReturnType<typeof fetchSettings>>;
export type OrderSettings = Settings['orders'];

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

/**
 * After a change, settings load again, and so does the business name in the sidebar. A
 * mutation's onSuccess returns this, so switches keep showing the new choice until it's in.
 */
export const refreshSettings = () =>
  Promise.all(
    ['settings', 'me', 'businesses'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  );
