import type { paths } from '@plateraa/api-client';
import type { Station } from '@plateraa/shared';
import { api, call } from './api';
import { queryClient } from './query';

export const fetchMenu = () => call(api.GET('/api/menu'));

/** The whole menu, as the editor works with it. Money is in pesewas. */
export type Menu = Awaited<ReturnType<typeof fetchMenu>>;
export type MenuItem = Menu['items'][number];

export type ItemInput =
  paths['/api/menu/items/{itemId}']['put']['requestBody']['content']['application/json'];

export const saveItem = (itemId: string, body: ItemInput) =>
  call(api.PUT('/api/menu/items/{itemId}', { params: { path: { itemId } }, body }));

export const removeItem = (itemId: string) =>
  call(api.DELETE('/api/menu/items/{itemId}', { params: { path: { itemId } } }));

export const setSoldOut = (itemId: string, soldOut: boolean) =>
  call(
    api.PUT('/api/menu/items/{itemId}/sold-out', {
      params: { path: { itemId } },
      body: { soldOut },
    }),
  );

export const addCategory = (id: string, name: string) =>
  call(api.POST('/api/menu/categories', { body: { id, name } }));

export const STATION_WORDS: Record<Station, string> = { KITCHEN: 'Kitchen', DRINKS: 'Drinks' };

/** After a menu change, the menu loads again. */
export const refreshMenu = () => queryClient.invalidateQueries({ queryKey: ['menu'] });

/** Whole-percent margin on a price, or null when either is missing. */
export function marginOf(price: number, cost: number | null): number | null {
  if (cost === null || price <= 0) return null;
  return Math.round(((price - cost) * 100) / price);
}

/** The colour a margin shows in: 50% and up is healthy, under 30% is a worry. */
export function marginTone(margin: number): 'green' | 'amber' | 'red' {
  return margin >= 50 ? 'green' : margin >= 30 ? 'amber' : 'red';
}
