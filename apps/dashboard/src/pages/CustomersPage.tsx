import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { SearchField } from '@/components/arc/search-field/search-field';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CUSTOMER_LIST_SIZE, fetchCustomers, type CustomerRow } from '../lib/customers';
import { cedis, shortDate } from '../lib/money';
import { useSession } from '../lib/session';
import { phoneWords } from '../lib/words';
import { useMe } from '../shell/Shell';
import { Page } from '../ui/Page';

/** `value`, once it has stopped changing for a moment, so each key typed doesn't ask the server. */
function useSettled<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const orderWords = (orders: number) => (orders === 1 ? '1 order' : `${orders} orders`);

/**
 * Everyone whose number was taken with an order: the tablet adds them for phone orders and
 * deliveries. The search stays in the address (`?q=`), so a search can be shared.
 */
export function CustomersPage() {
  const me = useMe();
  const { tenantId } = useSession();
  const [params, setParams] = useSearchParams();
  const [typed, setTyped] = useState(params.get('q') ?? '');
  const search = useSettled(typed.trim());
  const seesMoney = me.capabilities.includes('reports.revenue.view');

  useEffect(() => {
    setParams(search ? { q: search } : {}, { replace: true });
  }, [search, setParams]);

  const list = useQuery({
    queryKey: ['customers', tenantId, search],
    queryFn: () => fetchCustomers(search ? { search } : {}),
    placeholderData: (previous) => previous,
  });
  // Wide screens: name, phone, orders, last order, and what they spent for those who see money.
  const columns = seesMoney
    ? 'md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_5rem_7rem_7rem_1rem] md:items-center'
    : 'md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_5rem_7rem_1rem] md:items-center';

  return (
    <Page title="Customers" subtitle="Everyone whose number was taken with an order.">
      <div className="flex flex-col gap-6">
        <div className="md:max-w-sm">
          <SearchField
            label="Search customers"
            placeholder="Name or number"
            value={typed}
            onValueChange={setTyped}
          />
        </div>

        <section
          aria-label="Customers"
          className="overflow-hidden rounded-(--radius-surface) border bg-card"
        >
          <div
            className={cn('hidden gap-4 border-b px-5 py-3 text-xs text-muted-foreground', columns)}
            aria-hidden
          >
            <span>Customer</span>
            <span>Phone</span>
            <span className="text-right">Orders</span>
            <span>Last order</span>
            {seesMoney && <span className="text-right">Spent</span>}
            <span />
          </div>
          {list.isPending && (
            <ul className="flex flex-col divide-y" aria-busy="true">
              {[0, 1, 2, 3].map((row) => (
                <li key={row} className="flex items-center justify-between gap-4 px-5 py-4">
                  <span className="flex flex-col gap-2">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3.5 w-28" />
                  </span>
                  <Skeleton className="h-4 w-16" />
                </li>
              ))}
            </ul>
          )}
          {list.isError && (
            <div className="p-5">
              <Alert tone="danger" title="Couldn’t load your customers">
                {list.error.message}
              </Alert>
            </div>
          )}
          {list.data?.length === 0 && (
            <EmptyState
              icon={<Users size={24} strokeWidth={1.75} />}
              title={search ? 'No one matches' : 'No customers yet'}
              description={
                search
                  ? `No name or number has “${search}” in it.`
                  : 'The tablet adds a customer whenever an order is taken with their number: phone orders and deliveries.'
              }
            />
          )}
          {list.data && list.data.length > 0 && (
            <ul className="flex flex-col divide-y">
              {list.data.map((customer) => (
                <CustomerLink
                  key={customer.id}
                  customer={customer}
                  columns={columns}
                  seesMoney={seesMoney}
                />
              ))}
            </ul>
          )}
        </section>
        {list.data?.length === CUSTOMER_LIST_SIZE && (
          <p className="text-sm text-muted-foreground">
            Showing the {CUSTOMER_LIST_SIZE} who ordered most recently. Search to find anyone else.
          </p>
        )}
      </div>
    </Page>
  );
}

function CustomerLink({
  customer,
  columns,
  seesMoney,
}: {
  customer: CustomerRow;
  columns: string;
  seesMoney: boolean;
}) {
  const last = customer.lastOrderOn ? shortDate(customer.lastOrderOn) : 'No orders yet';
  const name = (
    <span className={cn('truncate text-sm font-medium', !customer.name && 'text-muted-foreground')}>
      {customer.name ?? 'No name'}
    </span>
  );
  return (
    <li>
      <Link
        to={`/customers/${customer.id}`}
        className={cn(
          'flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/60',
          columns,
        )}
      >
        {/* Phones */}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:hidden">
          {name}
          <span className="text-xs text-muted-foreground">
            {phoneWords(customer.phone)}, {orderWords(customer.orders)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 md:hidden">
          {seesMoney && <span className="font-mono text-sm">{cedis(customer.spent ?? 0)}</span>}
          <span className="text-xs text-muted-foreground">{last}</span>
        </span>
        {/* Wide screens */}
        <span className="hidden min-w-0 md:block">{name}</span>
        <span className="hidden font-mono text-sm text-text-secondary md:block">
          {phoneWords(customer.phone)}
        </span>
        <span className="hidden text-right font-mono text-sm md:block">{customer.orders}</span>
        <span className="hidden text-sm text-text-secondary md:block">{last}</span>
        {seesMoney && (
          <span className="hidden text-right font-mono text-sm md:block">
            {cedis(customer.spent ?? 0)}
          </span>
        )}
        <ChevronRight
          size={16}
          strokeWidth={1.75}
          className="hidden text-muted-foreground md:block"
          aria-hidden
        />
      </Link>
    </li>
  );
}
