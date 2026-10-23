import { createApiClient, type paths } from '@brixx/api-client';
import { cache } from 'react';

/**
 * The Brixx API. Only the storefront's own server talks to it: customers' browsers talk to the
 * storefront, so the API's address and any future secrets stay on the server.
 */
const API_URL = process.env.BRIXX_API_URL || 'https://plateraa-api.onrender.com';
export const api = createApiClient(API_URL);

type JsonOf<T> = T extends { content: { 'application/json': infer Body } } ? Body : never;

export type Store = JsonOf<paths['/api/public/stores/{slug}']['get']['responses'][200]>;
export type StoreItem = Store['items'][number];
export type StoreGroup = StoreItem['groups'][number];
export type TrackedOrder = JsonOf<paths['/api/public/orders/{token}']['get']['responses'][200]>;
export type PlaceOrderBody = JsonOf<
  NonNullable<paths['/api/public/stores/{slug}/orders']['post']['requestBody']>
>;

export const OFFLINE = "We can't reach the store right now. Check your connection and try again.";

/** The API's own words for what went wrong, or plain ones. */
export function messageOf(body: unknown, status: number): string {
  const message = (body as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  if (status === 429) return 'Too many tries in a short time. Wait a few minutes and try again.';
  if (status >= 500) return 'Something went wrong on our side. Try again in a moment.';
  return 'That didn’t work. Try again.';
}

/** A store by its link, or null when there's no such store (shared by the page and its title). */
export const fetchStore = cache(async (slug: string): Promise<Store | null> => {
  const { data, response } = await api.GET('/api/public/stores/{slug}', {
    params: { path: { slug } },
  });
  if (response.status === 404) return null;
  if (!data) throw new Error(`The store couldn't be loaded (${response.status})`);
  return data;
});

/** An order by its status-page key, or null when there's no such order. */
export const fetchOrder = cache(async (token: string): Promise<TrackedOrder | null> => {
  const { data, response } = await api.GET('/api/public/orders/{token}', {
    params: { path: { token } },
  });
  if (response.status === 404) return null;
  if (!data) throw new Error(`The order couldn't be loaded (${response.status})`);
  return data;
});
