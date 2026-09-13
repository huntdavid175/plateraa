import { api, call } from './api';
import { queryClient } from './query';

/** Customers, most recent first; `search` is part of a name or a number. */
export const fetchCustomers = (query: { search?: string }) =>
  call(api.GET('/api/customers', { params: { query } }));
export type CustomerRow = Awaited<ReturnType<typeof fetchCustomers>>[number];

/** How many customers one list shows; searching finds anyone else. */
export const CUSTOMER_LIST_SIZE = 100;

export const fetchCustomer = (customerId: string) =>
  call(api.GET('/api/customers/{customerId}', { params: { path: { customerId } } }));
export type CustomerDetail = Awaited<ReturnType<typeof fetchCustomer>>;

/** A blank name or notes clears it. Needs `customers.manage`. */
export const saveCustomer = (customerId: string, body: { name: string; notes: string }) =>
  call(api.PUT('/api/customers/{customerId}', { params: { path: { customerId } }, body }));

export function refreshCustomers() {
  void queryClient.invalidateQueries({ queryKey: ['customers'] });
  void queryClient.invalidateQueries({ queryKey: ['customer'] });
}
