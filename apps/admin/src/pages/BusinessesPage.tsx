import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { SearchField } from '@/components/arc/search-field/search-field';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import {
  SortableDataTable,
  type DataColumn,
} from '@/components/arc/sortable-data-table/sortable-data-table';
import { Loading, TableScroll } from '@/components/app/admin';
import { Panel } from '@/components/app/panel';
import { api, call, type BusinessRow } from '@/lib/api';
import { cedis, dayAgo, daysSince } from '@/lib/format';
import { BusinessStatus } from '@/shell/Shell';
import { Page } from '@/ui/Page';

type Filter = 'ALL' | 'ACTIVE' | 'QUIET' | 'SUSPENDED' | 'PENDING';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Open' },
  { value: 'QUIET', label: 'Gone quiet' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'PENDING', label: 'Waiting' },
];

function tablets(row: BusinessRow) {
  if (!row.tablets) return <Badge>None</Badge>;
  if (row.tabletAlerts) {
    return (
      <Badge tone="danger">
        {row.tabletAlerts} of {row.tablets} need help
      </Badge>
    );
  }
  return <Badge tone="success">{row.tablets === 1 ? 'Syncing' : `${row.tablets} syncing`}</Badge>;
}

const COLUMNS: DataColumn<BusinessRow>[] = [
  {
    key: 'name',
    label: 'Business',
    sortable: true,
    render: (_, row) => (
      <span className="flex min-w-48 flex-col">
        <Link
          to={`/businesses/${row.id}`}
          className="font-medium hover:text-accent-strong hover:underline"
        >
          {row.name}
        </Link>
        <span className="text-xs text-muted-foreground">
          {row.area ?? 'No area'} · {row.ownerName ?? 'No owner'}
        </span>
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    render: (_, row) => <BusinessStatus status={row.status} />,
  },
  { key: 'orders7d', label: 'Orders, 7 days', sortable: true, numeric: true },
  {
    key: 'value7d',
    label: 'Worth, 7 days',
    sortable: true,
    numeric: true,
    render: (value) => <span className="whitespace-nowrap">{cedis(value as number)}</span>,
  },
  {
    key: 'lastOrderOn',
    label: 'Last order',
    sortable: true,
    render: (value) => {
      const days = daysSince(value as string | null);
      return (
        <span className={days !== null && days >= 7 ? 'text-warning' : 'text-text-secondary'}>
          {value ? dayAgo(value as string) : 'None yet'}
        </span>
      );
    },
  },
  { key: 'tabletAlerts', label: 'Tablets', sortable: true, render: (_, row) => tablets(row) },
  {
    key: 'paymentConnected',
    label: 'Payments',
    render: (value) => (value ? <Badge tone="success">Connected</Badge> : <Badge>Not yet</Badge>),
  },
];

export function BusinessesPage() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filter') as Filter | null) ?? 'ALL';
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);

  // Typing settles for a moment before the address, and the search, change.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (text.trim() === q) return;
      const next = new URLSearchParams(params);
      if (text.trim()) next.set('q', text.trim());
      else next.delete('q');
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [text, q, params, setParams]);

  const list = useQuery({
    queryKey: ['businesses', filter, q],
    queryFn: () =>
      call<BusinessRow[]>(
        api.GET('/api/platform/businesses', {
          params: { query: { filter, search: q || undefined, limit: 500 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <Page title="Businesses" subtitle="Every vendor on Brixx. Figures are the last 7 trading days.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SegmentedControl
            label="Which businesses"
            value={filter}
            options={FILTERS}
            onValueChange={(value) => {
              const next = new URLSearchParams(params);
              if (value === 'ALL') next.delete('filter');
              else next.set('filter', value);
              setParams(next, { replace: true });
            }}
          />
          <div className="w-full sm:w-80">
            <SearchField
              label="Search businesses"
              placeholder="Name, area, phone or owner’s email"
              value={text}
              onValueChange={setText}
            />
          </div>
        </div>

        {list.error ? (
          <Alert tone="danger" title="Businesses couldn’t load">
            {list.error.message}
          </Alert>
        ) : (
          <Panel
            title={list.data ? `${list.data.length} businesses` : 'Businesses'}
            description={q ? `Matching “${q}”` : undefined}
          >
            {!list.data ? (
              <Loading lines={10} />
            ) : (
              <TableScroll>
                <SortableDataTable
                  rows={list.data}
                  columns={COLUMNS}
                  rowKey="id"
                  caption="Businesses on Brixx"
                  emptyMessage={q ? `Nothing matches “${q}”.` : 'No businesses here.'}
                  defaultSort={{ key: 'orders7d', direction: 'desc' }}
                />
              </TableScroll>
            )}
          </Panel>
        )}
      </div>
    </Page>
  );
}
