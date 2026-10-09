import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CUSTOMER_LIST_SIZE, fetchCustomers, type CustomerRow } from '../lib/customers';
import { cedis, shortDate } from '../lib/money';
import { useSession } from '../lib/session';
import { phoneWords } from '../lib/words';
import { useMe } from '../shell/Shell';
import { Card, ErrorNote, Spinner, TextInput, cx } from '../ui/controls';
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
  const columns = seesMoney
    ? 'md:grid-cols-[1.5fr_1.2fr_0.6fr_0.9fr_0.9fr]'
    : 'md:grid-cols-[1.5fr_1.2fr_0.6fr_0.9fr]';

  return (
    <Page title="Customers" subtitle="Everyone whose number was taken with an order">
      <div className="mb-5 md:max-w-sm">
        <TextInput
          type="search"
          aria-label="Search customers"
          placeholder="Search by name or number"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>

      <Card className="overflow-hidden">
        <div
          className={cx(
            'hidden gap-4 border-b border-border px-5 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:grid',
            columns,
          )}
        >
          <span>Customer</span>
          <span>Phone</span>
          <span className="text-right">Orders</span>
          <span>Last order</span>
          {seesMoney && <span className="text-right">Spent</span>}
        </div>
        {list.isPending && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {list.isError && (
          <div className="p-4">
            <ErrorNote>{list.error.message}</ErrorNote>
          </div>
        )}
        {list.data?.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {search
              ? `No one matches “${search}”.`
              : 'No customers yet. The tablet adds one whenever an order is taken with the customer’s number: phone orders and deliveries.'}
          </p>
        )}
        {list.data?.map((customer) => (
          <CustomerLink
            key={customer.id}
            customer={customer}
            columns={columns}
            seesMoney={seesMoney}
          />
        ))}
      </Card>
      {list.data?.length === CUSTOMER_LIST_SIZE && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Showing the {CUSTOMER_LIST_SIZE} who ordered most recently. Search to find anyone else.
        </p>
      )}
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
  const last = customer.lastOrderOn ? shortDate(customer.lastOrderOn) : '—';
  return (
    <Link
      to={`/customers/${customer.id}`}
      className="block border-b border-border transition-colors last:border-b-0 hover:bg-tile/40"
    >
      <div className={cx('hidden items-center gap-4 px-5 py-3.5 md:grid', columns)}>
        <p
          className={cx('truncate text-sm font-medium', !customer.name && 'text-muted-foreground')}
        >
          {customer.name ?? 'No name'}
        </p>
        <p className="font-mono text-sm text-muted-foreground">{phoneWords(customer.phone)}</p>
        <p className="text-right font-mono text-sm">{customer.orders}</p>
        <p className="text-sm text-muted-foreground">{last}</p>
        {seesMoney && <p className="text-right font-mono text-sm">{cedis(customer.spent ?? 0)}</p>}
      </div>
      <div className="flex items-center gap-4 px-4 py-3.5 md:hidden">
        <div className="min-w-0 flex-1">
          <p
            className={cx(
              'truncate text-sm font-medium',
              !customer.name && 'text-muted-foreground',
            )}
          >
            {customer.name ?? 'No name'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {phoneWords(customer.phone)} · {orderWords(customer.orders)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {seesMoney && (
            <p className="font-mono text-sm font-semibold">{cedis(customer.spent ?? 0)}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{last}</p>
        </div>
      </div>
    </Link>
  );
}
