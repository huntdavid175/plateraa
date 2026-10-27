import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { SearchField } from '@/components/arc/search-field/search-field';
import {
  SortableDataTable,
  type DataColumn,
} from '@/components/arc/sortable-data-table/sortable-data-table';
import { LinkBadge, Loading, TableScroll } from '@/components/app/admin';
import { Panel } from '@/components/app/panel';
import { api, call, type SearchResult } from '@/lib/api';
import { cedis, localPhone, orderWord, sentence, stamp } from '@/lib/format';
import { BusinessStatus } from '@/shell/Shell';
import { Page } from '@/ui/Page';

type Found = SearchResult;

const business = (id: string, name: string) => (
  <Link to={`/businesses/${id}`} className="font-medium hover:text-accent-strong hover:underline">
    {name}
  </Link>
);

const BUSINESS_COLUMNS: DataColumn<Found['businesses'][number]>[] = [
  {
    key: 'name',
    label: 'Business',
    render: (_, b) => (
      <span className="flex flex-col">
        {business(b.id, b.name)}
        <span className="text-xs text-muted-foreground">{b.ownerEmail}</span>
      </span>
    ),
  },
  { key: 'area', label: 'Area', render: (v) => (v as string) ?? '—' },
  {
    key: 'contactPhone',
    label: 'Phone',
    render: (v) => <span className="font-mono">{localPhone(v as string)}</span>,
  },
  { key: 'status', label: 'Status', render: (v) => <BusinessStatus status={v as string} /> },
];

const ORDER_COLUMNS: DataColumn<Found['orders'][number]>[] = [
  {
    key: 'displayNumber',
    label: 'Order',
    render: (v) => <span className="font-mono font-medium">{v as string}</span>,
  },
  {
    key: 'businessName',
    label: 'Business',
    render: (_, o) => business(o.tenantId, o.businessName),
  },
  { key: 'createdAt', label: 'When', sortable: true, render: (v) => stamp(v as string) },
  { key: 'type', label: 'Kind', render: (v) => orderWord(v as string) },
  {
    key: 'status',
    label: 'Status',
    render: (_, o) =>
      o.amountPaid < o.total && o.status !== 'CANCELLED' ? (
        <Badge tone="warning">
          {sentence(o.status)}, {cedis(o.total - o.amountPaid)} unpaid
        </Badge>
      ) : (
        sentence(o.status)
      ),
  },
  { key: 'total', label: 'Total', numeric: true, render: (v) => cedis(v as number) },
];

const CUSTOMER_COLUMNS: DataColumn<Found['customers'][number]>[] = [
  {
    key: 'phone',
    label: 'Phone',
    render: (v) => <span className="font-mono">{localPhone(v as string)}</span>,
  },
  { key: 'name', label: 'Name', render: (v) => (v as string) ?? 'No name' },
  {
    key: 'businessName',
    label: 'Business',
    render: (_, c) => business(c.tenantId, c.businessName),
  },
  { key: 'orders', label: 'Orders', numeric: true },
];

const LINK_COLUMNS: DataColumn<Found['links'][number]>[] = [
  {
    key: 'orderNumber',
    label: 'Order',
    render: (v) => <span className="font-mono font-medium">{v as string}</span>,
  },
  {
    key: 'businessName',
    label: 'Business',
    render: (_, l) => business(l.tenantId, l.businessName),
  },
  { key: 'createdAt', label: 'Sent', sortable: true, render: (v) => stamp(v as string) },
  {
    key: 'status',
    label: 'State',
    render: (_, l) => (
      <span className="flex flex-col items-start gap-0.5">
        <LinkBadge status={l.status} />
        {l.failure && <span className="text-xs text-muted-foreground">{l.failure}</span>}
      </span>
    ),
  },
  { key: 'amount', label: 'Amount', numeric: true, render: (v) => cedis(v as number) },
];

/** Where a support call starts: whatever the vendor says, in one box. */
export function SupportPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = text.trim();
      if (next === q || (next.length > 0 && next.length < 2)) return;
      setParams(next ? { q: next } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [text, q, setParams]);

  const result = useQuery({
    queryKey: ['search', q],
    queryFn: () =>
      call<SearchResult>(api.GET('/api/platform/search', { params: { query: { q } } })),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  });
  const r = result.data;
  const total = r ? r.businesses.length + r.orders.length + r.customers.length + r.links.length : 0;

  return (
    <Page
      title="Support"
      subtitle="Find the business, order or customer a vendor is calling about."
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="max-w-2xl">
          <SearchField
            label="Search everything"
            placeholder="Business, phone number, order number or email"
            value={text}
            onValueChange={setText}
            autoFocus
          />
        </div>

        {q.length < 2 ? (
          <div className="rounded-(--radius-surface) border bg-card">
            <EmptyState
              title="Type what the vendor tells you"
              description="A business’s name or area, a phone number like 024 123 4567, an order number like W12 or 14 from the last 7 days, or an owner’s email."
            />
          </div>
        ) : result.error ? (
          <Alert tone="danger" title="Search didn’t work">
            {result.error.message}
          </Alert>
        ) : !r ? (
          <Panel title="Searching">
            <Loading />
          </Panel>
        ) : total === 0 ? (
          <div className="rounded-(--radius-surface) border bg-card">
            <EmptyState
              title={`Nothing found for “${q}”`}
              description="Check the spelling, or try their phone number."
            />
          </div>
        ) : (
          <>
            {r.businesses.length > 0 && (
              <Panel title="Businesses" description={`${r.businesses.length} found`}>
                <TableScroll>
                  <SortableDataTable
                    rows={r.businesses}
                    columns={BUSINESS_COLUMNS}
                    rowKey="id"
                    caption="Businesses found"
                  />
                </TableScroll>
              </Panel>
            )}
            {r.orders.length > 0 && (
              <Panel title="Orders, last 7 days" description={`${r.orders.length} found`}>
                <TableScroll>
                  <SortableDataTable
                    rows={r.orders}
                    columns={ORDER_COLUMNS}
                    rowKey="id"
                    caption="Orders found"
                  />
                </TableScroll>
              </Panel>
            )}
            {r.customers.length > 0 && (
              <Panel title="Customers" description={`${r.customers.length} found`}>
                <TableScroll>
                  <SortableDataTable
                    rows={r.customers}
                    columns={CUSTOMER_COLUMNS}
                    rowKey="id"
                    caption="Customers found"
                  />
                </TableScroll>
              </Panel>
            )}
            {r.links.length > 0 && (
              <Panel title="Payment links, last 30 days" description={`${r.links.length} found`}>
                <TableScroll>
                  <SortableDataTable
                    rows={r.links}
                    columns={LINK_COLUMNS}
                    rowKey="id"
                    caption="Payment links found"
                  />
                </TableScroll>
              </Panel>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
