import { api, call } from './api';
import { queryClient } from './query';

export const fetchStorefront = () => call(api.GET('/api/storefront/settings'));
export type Storefront = Awaited<ReturnType<typeof fetchStorefront>>;
export type SaveStorefront = Omit<
  Storefront,
  'url' | 'moolreConnected' | 'deliveryZones' | 'area' | 'phone' | 'hours'
> & { area: string; phone: string; hours: string };

export const saveStorefront = (body: SaveStorefront) =>
  call(api.PUT('/api/storefront/settings', { body }));

export function refreshStorefront() {
  void queryClient.invalidateQueries({ queryKey: ['storefront'] });
}
