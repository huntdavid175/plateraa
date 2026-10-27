import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { BarChart } from '@/components/arc/bar-chart/bar-chart';
import { LineChart } from '@/components/arc/line-chart/line-chart';
import { MetricCard } from '@/components/arc/metric-card/metric-card';
import { Progress } from '@/components/arc/progress/progress';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import {
  SortableDataTable,
  type DataColumn,
} from '@/components/arc/sortable-data-table/sortable-data-table';
import { Loading, ShareDonut, TableScroll, TrendLine } from '@/components/app/admin';
import { Panel } from '@/components/app/panel';
import { api, call, type Analytics } from '@/lib/api';
import {
  cedis,
  change,
  count,
  dayAgo,
  orderWord,
  percent,
  shortDay,
  vendorType,
  wholeCedis,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { Page } from '@/ui/Page';

type Row = Analytics['businesses'][number] & { growth: number };
type Item = Analytics['topItems'][number] & { id: string };

const growthOf = (b: { orders: number; previousOrders: number }) =>
  b.previousOrders === 0 ? (b.orders ? 1 : 0) : (b.orders - b.previousOrders) / b.previousOrders;

const METHOD_WORDS: Record<string, string> = {
  CASH: 'Cash',
  LINK: 'Payment link or online',
  PLATFORM: 'Paid on a delivery app',
};
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A metric card's slot while the figures load. */
function CardSkeleton() {
  return (
    <div className="rounded-(--radius-surface) border bg-card p-5">
      <Skeleton lines={2} />
    </div>
  );
}

function ChangeText({ now, before }: { now: number; before: number }) {
  const words = change(now, before);
  return (
    <span
      className={cn(
        'font-mono',
        words.startsWith('−')
          ? 'text-danger'
          : words.startsWith('+') || words === 'new'
            ? 'text-success'
            : 'text-muted-foreground',
      )}
    >
      {words}
    </span>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <div className="border-t px-5 py-4">{children}</div>;
}

const ITEM_COLUMNS: DataColumn<Item>[] = [
  { key: 'name', label: 'Item', sortable: true },
  { key: 'quantity', label: 'Sold', sortable: true, numeric: true },
  {
    key: 'value',
    label: 'Worth',
    sortable: true,
    numeric: true,
    render: (v) => <span className="whitespace-nowrap">{wholeCedis(v as number)}</span>,
  },
  { key: 'businesses', label: 'Places', sortable: true, numeric: true },
];

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const days = params.get('days') ?? '30';

  const analytics = useQuery({
    queryKey: ['analytics', days],
    queryFn: () =>
      call<Analytics>(
        api.GET('/api/platform/analytics', { params: { query: { days: Number(days) } } }),
      ),
    placeholderData: keepPreviousData,
  });
  const a = analytics.data;

  const columns: DataColumn<Row>[] = [
    {
      key: 'name',
      label: 'Business',
      sortable: true,
      render: (_, b) => (
        <span className="flex min-w-40 flex-col">
          <Link
            to={`/businesses/${b.id}`}
            className="font-medium hover:text-accent-strong hover:underline"
          >
            {b.name}
          </Link>
          <span className="text-xs text-muted-foreground">{b.area ?? '—'}</span>
        </span>
      ),
    },
    { key: 'orders', label: 'Orders', sortable: true, numeric: true },
    {
      key: 'growth',
      label: 'Change',
      sortable: true,
      numeric: true,
      render: (_, b) => <ChangeText now={b.orders} before={b.previousOrders} />,
    },
    {
      key: 'value',
      label: 'Worth',
      sortable: true,
      numeric: true,
      render: (v) => <span className="whitespace-nowrap">{wholeCedis(v as number)}</span>,
    },
    {
      key: 'averageOrder',
      label: 'Average',
      sortable: true,
      numeric: true,
      render: (v) => <span className="whitespace-nowrap">{cedis(v as number)}</span>,
    },
    {
      key: 'onlineShare',
      label: 'Online',
      sortable: true,
      numeric: true,
      render: (v) => percent(v as number),
    },
    { key: 'cancelled', label: 'Cancelled', sortable: true, numeric: true },
    {
      key: 'activeDays',
      label: 'Days open',
      sortable: true,
      numeric: true,
      render: (v) => `${v as number}/${a?.days ?? 0}`,
    },
    {
      key: 'spark',
      label: 'Each day',
      render: (_, b) => <TrendLine values={b.spark} label={`${b.name}: orders each day`} />,
    },
    {
      key: 'lastOrderOn',
      label: 'Last order',
      sortable: true,
      render: (v) => (v ? dayAgo(v as string) : 'None yet'),
    },
  ];

  const period = (
    <SegmentedControl
      label="Period"
      value={days}
      onValueChange={(value) => setParams({ days: value }, { replace: true })}
      options={[
        { value: '7', label: '7 days' },
        { value: '30', label: '30 days' },
        { value: '90', label: '90 days' },
      ]}
    />
  );

  if (analytics.error) {
    return (
      <Page title="Analytics" actions={period}>
        <Alert tone="danger" title="Analytics couldn’t load">
          {analytics.error.message}
        </Alert>
      </Page>
    );
  }

  const f = a?.funnel;
  const steps = f
    ? [
        { label: 'Asked to join', value: f.requested },
        { label: 'Approved', value: f.approved },
        { label: 'Menu set up', value: f.menu },
        { label: 'Tablet set up', value: f.tablet },
        { label: 'First order', value: f.firstOrder },
        { label: 'Ordered this week', value: f.activeThisWeek },
      ]
    : [];
  const rows: Row[] = (a?.businesses ?? []).map((b) => ({ ...b, growth: growthOf(b) }));
  const previousAverage =
    a && a.previous.orders ? Math.round(a.previous.value / a.previous.orders) : 0;
  const busiestHour = a ? a.byHour.indexOf(Math.max(...a.byHour)) : 0;
  const busiestDay = a ? a.byWeekday.indexOf(Math.max(...a.byWeekday)) : 0;
  const maxArea = Math.max(1, ...(a?.byArea.map((r) => r.orders) ?? [0]));
  const maxKind = Math.max(1, ...(a?.byVendorType.map((r) => r.orders) ?? [0]));

  return (
    <Page
      title="Analytics"
      subtitle={
        a
          ? `${shortDay(a.from)} to ${shortDay(a.to)}, against the ${a.days} days before. Orders that went ahead, at every business on Brixx.`
          : undefined
      }
      actions={period}
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {a ? (
            <>
              <MetricCard
                label="Orders"
                value={a.totals.orders}
                context="vs the period before"
                change={change(a.totals.orders, a.previous.orders)}
              />
              <MetricCard
                label="Worth, in cedis"
                value={Math.round(a.totals.value / 100)}
                context="vs the period before"
                change={change(a.totals.value, a.previous.value)}
              />
              <MetricCard
                label="Businesses taking orders"
                value={a.totals.activeBusinesses}
                context="vs the period before"
                change={change(a.totals.activeBusinesses, a.previous.activeBusinesses)}
              />
              <MetricCard
                label="Average order, in cedis"
                value={Math.round(a.totals.averageOrder / 100)}
                context={`was ${cedis(previousAverage)}`}
                change={change(a.totals.averageOrder, previousAverage)}
              />
              <MetricCard
                label="New customers"
                value={a.newCustomers}
                context="gave a number for the first time"
              />
              <MetricCard
                label="Ordered online"
                value={Math.round(a.totals.onlineShare * 100)}
                suffix="%"
                context="through the online stores"
              />
              <MetricCard
                label="Cancelled"
                value={a.losses.cancelled}
                context={`${percent(a.losses.cancelledShare)} of all orders`}
              />
              <MetricCard
                label="Refunded, in cedis"
                value={Math.round(a.losses.refunds / 100)}
                context={`on ${a.losses.refunded} order${a.losses.refunded === 1 ? '' : 's'}`}
              />
            </>
          ) : (
            [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <CardSkeleton key={i} />)
          )}
        </section>

        <Panel
          title="Orders per day"
          description={
            a ? `This period, with the ${a.days} days before dashed for comparison` : undefined
          }
        >
          <Body>
            {a ? (
              <LineChart
                label="Orders per day"
                height={260}
                loading={analytics.isPlaceholderData}
                categoryLabel="Day"
                series={[
                  { key: 'orders', label: 'This period' },
                  { key: 'previous', label: 'Period before', dashed: true },
                ]}
                formatValue={(v) => `${count(v)} orders`}
                data={a.daily.map((d, i) => ({
                  key: d.date,
                  label: shortDay(d.date),
                  axisLabel: i % Math.ceil(a.daily.length / 6) === 0 ? shortDay(d.date) : undefined,
                  values: { orders: d.orders, previous: a.previousDaily[i] ?? 0 },
                }))}
              />
            ) : (
              <Skeleton lines={7} />
            )}
          </Body>
        </Panel>

        <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-2">
          <Panel
            title="Busiest hours"
            description={
              a
                ? `Most orders come in around ${String(busiestHour).padStart(2, '0')}:00`
                : undefined
            }
          >
            <Body>
              {a ? (
                <BarChart
                  label="Orders by hour of the day"
                  period="Ghana time, all days added up"
                  unit="orders"
                  averageLabel="Average an hour"
                  valueLabel="Orders"
                  categoryLabel="Hour"
                  height={180}
                  data={a.byHour.slice(6).map((value, i) => {
                    const hour = String(i + 6).padStart(2, '0');
                    return {
                      key: hour,
                      label: `${hour}:00`,
                      axisLabel: (i + 6) % 3 === 0 ? hour : undefined,
                      value,
                    };
                  })}
                />
              ) : (
                <Skeleton lines={6} />
              )}
            </Body>
          </Panel>
          <Panel
            title="Busiest days"
            description={a ? `${WEEKDAYS[busiestDay]} is the busiest` : undefined}
          >
            <Body>
              {a ? (
                <BarChart
                  label="Orders by day of the week"
                  period="All weeks added up"
                  unit="orders"
                  averageLabel="Average a day"
                  valueLabel="Orders"
                  categoryLabel="Day"
                  height={180}
                  showAverage
                  data={a.byWeekday.map((value, i) => ({
                    key: WEEKDAYS[i]!,
                    label: WEEKDAYS[i]!,
                    axisLabel: WEEKDAYS[i]!.slice(0, 3),
                    value,
                  }))}
                />
              ) : (
                <Skeleton lines={6} />
              )}
            </Body>
          </Panel>
        </div>

        <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-2">
          <Panel title="How customers pay" description="Confirmed payments, by orders">
            <Body>
              {a ? (
                <ShareDonut
                  label="Payments by how they were made"
                  totalLabel="Orders"
                  unit="orders"
                  emptyLabel="No payments in this period"
                  data={a.byMethod.map((m) => ({
                    key: m.key,
                    label: METHOD_WORDS[m.key] ?? m.key,
                    note: wholeCedis(m.value),
                    value: m.orders,
                  }))}
                />
              ) : (
                <Skeleton lines={5} />
              )}
            </Body>
          </Panel>
          <Panel title="Dine-in, pickup and delivery">
            <Body>
              {a ? (
                <ShareDonut
                  label="Orders by kind"
                  totalLabel="Orders"
                  unit="orders"
                  emptyLabel="No orders in this period"
                  data={a.byType.map((t) => ({
                    key: t.key,
                    label: orderWord(t.key),
                    note: wholeCedis(t.value),
                    value: t.orders,
                  }))}
                />
              ) : (
                <Skeleton lines={5} />
              )}
            </Body>
          </Panel>
          <Panel title="Where orders come from">
            <Body>
              {a ? (
                <ShareDonut
                  label="Orders by where they came from"
                  totalLabel="Orders"
                  unit="orders"
                  emptyLabel="No orders in this period"
                  data={a.bySource.map((t) => ({
                    key: t.key,
                    label: orderWord(t.key),
                    note: wholeCedis(t.value),
                    value: t.orders,
                  }))}
                />
              ) : (
                <Skeleton lines={5} />
              )}
            </Body>
          </Panel>
          <Panel
            title="Kinds of business"
            description="Orders, and how many businesses of each kind"
          >
            <Body>
              {a ? (
                <div className="flex flex-col gap-4">
                  {a.byVendorType.map((k) => (
                    <Progress
                      key={k.key}
                      label={`${vendorType(k.key)} · ${k.businesses} business${k.businesses === 1 ? '' : 'es'} · ${count(k.orders)} orders`}
                      value={k.orders}
                      max={maxKind}
                    />
                  ))}
                </div>
              ) : (
                <Skeleton lines={5} />
              )}
            </Body>
          </Panel>
        </div>

        <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-2">
          <Panel title="Top items" description="The ten most sold, across every business">
            {!a ? (
              <Loading lines={8} />
            ) : (
              <TableScroll>
                <SortableDataTable
                  rows={a.topItems.map((item) => ({ ...item, id: item.name }))}
                  columns={ITEM_COLUMNS}
                  rowKey="id"
                  caption="Top items"
                  emptyMessage="No items sold in this period."
                  defaultSort={{ key: 'quantity', direction: 'desc' }}
                />
              </TableScroll>
            )}
          </Panel>
          <Panel title="Areas" description="Where the orders are, by the businesses’ areas">
            <Body>
              {a ? (
                <div className="flex flex-col gap-4">
                  {a.byArea.map((r) => (
                    <Progress
                      key={r.key}
                      label={`${r.key} · ${r.businesses} business${r.businesses === 1 ? '' : 'es'} · ${count(r.orders)} orders`}
                      value={r.orders}
                      max={maxArea}
                    />
                  ))}
                </div>
              ) : (
                <Skeleton lines={6} />
              )}
            </Body>
          </Panel>
        </div>

        <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-2">
          <Panel title="From sign-up to trading" description="Every business, all time">
            <div className="flex flex-col gap-4 border-t px-5 py-5">
              {f ? (
                steps.map((step) => (
                  <Progress
                    key={step.label}
                    label={`${step.label}: ${step.value}`}
                    value={step.value}
                    max={Math.max(1, f.requested)}
                    showValue
                  />
                ))
              ) : (
                <Skeleton lines={6} />
              )}
            </div>
          </Panel>
          <Panel
            title="Joining Brixx"
            description={
              a
                ? `${a.signups.reduce((s, w) => s + w.requested, 0)} asked and ${a.signups.reduce((s, w) => s + w.approved, 0)} approved, week by week`
                : undefined
            }
          >
            <Body>
              {a ? (
                <LineChart
                  label="Requests and approvals each week"
                  height={220}
                  categoryLabel="Week of"
                  curve="linear"
                  series={[
                    { key: 'requested', label: 'Asked to join' },
                    { key: 'approved', label: 'Approved', color: 'var(--success)', area: false },
                  ]}
                  data={a.signups.map((w) => ({
                    key: w.week,
                    label: `Week of ${shortDay(w.week)}`,
                    axisLabel: shortDay(w.week),
                    values: { requested: w.requested, approved: w.approved },
                  }))}
                />
              ) : (
                <Skeleton lines={6} />
              )}
            </Body>
          </Panel>
        </div>

        <Panel
          title="Each business"
          description="Sort by Change to see who is falling or growing, or by Cancelled to see who struggles."
        >
          {!a ? (
            <Loading lines={8} />
          ) : (
            <TableScroll>
              <SortableDataTable
                rows={rows}
                columns={columns}
                rowKey="id"
                caption="Each business over the period"
                emptyMessage="No open businesses yet."
                defaultSort={{ key: 'orders', direction: 'desc' }}
              />
            </TableScroll>
          )}
        </Panel>
      </div>
    </Page>
  );
}
