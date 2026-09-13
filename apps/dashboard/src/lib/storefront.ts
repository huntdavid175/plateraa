import { api, call } from './api';
import { queryClient } from './query';

export const fetchStorefront = () => call(api.GET('/api/storefront/settings'));
export type Storefront = Awaited<ReturnType<typeof fetchStorefront>>;
export type SaveStorefront = Omit<
  Storefront,
  | 'url'
  | 'moolreConnected'
  | 'deliveryZones'
  | 'area'
  | 'phone'
  | 'hours'
  | 'coverUrl'
  | 'logoUrl'
  | 'photosReady'
> & { area: string; phone: string; hours: string };

export const saveStorefront = (body: SaveStorefront) =>
  call(api.PUT('/api/storefront/settings', { body }));

/**
 * Reloads the store's settings. A mutation's onSuccess returns this, so it stays pending (and
 * keeps showing the new choice) until the fresh copy is in, instead of flicking back to the old.
 */
export const refreshStorefront = () => queryClient.invalidateQueries({ queryKey: ['storefront'] });
