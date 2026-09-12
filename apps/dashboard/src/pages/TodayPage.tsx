import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cedis, longDate } from '../lib/money';
import {
  fetchOrders,
  fetchRefundsOwed,
  orderLine,
  paymentState,
  type OrderRow,
} from '../lib/orders';
import { fetchDay, type DaySummary } from '../lib/reports';
import { useSession } from '../lib/session';
import { SOURCE_WORDS } from '../lib/words';
import { useMe } from '../shell/Shell';
import { Badge, Card, ErrorNote, Spinner, Tag, cx } from '../ui/controls';
import { Page } from '../ui/Page';

const MoneyInChart = lazy(() => import('./MoneyInChart'));

/** The four order sources every vendor has; storefront and other show only when used. */
const MAIN_SOURCES = ['POS', 'PHONE', 'BOLT_FOOD', 'CHOWDECK'] as const;

export function TodayPage() {
  const me = useMe();
  const { tenantId } = useSession();
  const seesMoney = me.capabilities.includes('reports.revenue.view');
  const recordsRefunds = me.capabilities.includes('refunds.record');

  const day = useQuery({
    queryKey: ['day', tenantId],
    queryFn: () => fetchDay(),
    enabled: seesMoney,
  });
  const recent = useQuery({
    queryKey: ['orders', tenantId, { limit: 5 }],
    queryFn: () => fetchOrders({ limit: 5 }),
  });
  const owed = useQuery({
    queryKey: ['refunds-owed', tenantId],
    queryFn: fetchRefundsOwed,
    enabled: recordsRefunds,
  });

  const date = day.data?.date ?? recent.data?.[0]?.businessDate;

  return (
    <Page title="Today" subtitle={date ? longDate(date) : undefined}>
      {owed.data && owed.data.length > 0 && <RefundsBanner orders={owed.data} />}

      {seesMoney ? (
        <>
          {day.isPending && (
            <div className="mb-6 flex justify-center py-10">
              <Spinner />
            </div>
          )}
          {day.isError && (
            <div className="mb-6">
              <ErrorNote>{day.error.message}</ErrorNote>
            </div>
          )}
          {day.data && <Figures day={day.data} />}
        </>
      ) : (
        <Card className="mb-6 px-5 py-4">
          <p className="text-sm font-medium">Sales totals are hidden for you</p>
          <p className="mt-0.5 text-sm text-muted">
            The owner decides who sees them, on the Staff page.
          </p>
        </Card>
      )}

      <RecentOrders
        orders={recent.data}
        total={day.data?.orders}
        loading={recent.isPending}
        error={recent.error?.message}
      />
    </Page>
  );
}

function RefundsBanner({ orders }: { orders: OrderRow[] }) {
  const [first] = orders;
  if (!first) return null;
  return (
    <Link
      to="/refunds"
      className="mb-5 flex items-start gap-3 rounded-xl border border-red/20 bg-red-bg p-4"
    >
      <span className="text-red" aria-hidden="true">
        ⚠
      </span>
      <div className="flex-1 text-red">
        <p className="text-sm font-semibold">
          {orders.length === 1 ? '1 refund needs action' : `${orders.length} refunds need action`}
        </p>
        <p className="mt-0.5 text-xs">
          {orders.length === 1
            ? `${first.displayNumber} · ${cedis(first.refundOwed)} to give back to the customer`
            : 'Give the money back to each customer, then record it on the Refunds page.'}
        </p>
      </div>
    </Link>
  );
}

function Figures({ day }: { day: DaySummary }) {
  const others = day.bySource.filter(
    (row) => !(MAIN_SOURCES as readonly string[]).includes(row.source),
  );
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric
          accent
          label="Money in"
          value={cedis(day.moneyIn)}
          sub={day.orders === 1 ? '1 order' : `${day.orders} orders`}
        />
        <Metric
          label="Not yet collected"
          value={cedis(day.notYetCollected)}
          sub={
            day.platformOwed > 0
              ? `${cedis(day.platformOwed)} from Bolt and Chowdeck`
              : day.unpaid > 0
                ? 'Unpaid orders'
                : undefined
          }
        />
        <Metric
          label="Money out"
          value={cedis(day.moneyOut)}
          sub={`What's left: ${cedis(day.left)}`}
        />
        <Metric
          label="Profit today"
          value={cedis(day.profit)}
          sub={day.commissionEstimate > 0 ? 'After expenses and commission' : 'After expenses'}
        />
      </div>

      <Card className="mb-6 p-5">
        <div className="mb-4">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Money in today</p>
          <p className="mt-1 font-mono text-2xl font-semibold">{cedis(day.moneyIn)}</p>
        </div>
        {day.byHour.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No money in yet today.</p>
        ) : (
          <Suspense fallback={<div className="h-[150px]" />}>
            <MoneyInChart byHour={day.byHour} />
          </Suspense>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {MAIN_SOURCES.map((source) => {
          const row = day.bySource.find((r) => r.source === source);
          return (
            <SourceCard
              key={source}
              label={SOURCE_WORDS[source]}
              sales={row?.sales ?? 0}
              orders={row?.orders ?? 0}
            />
          );
        })}
        {others.map((row) => (
          <SourceCard
            key={row.source}
            label={SOURCE_WORDS[row.source]}
            sales={row.sales}
            orders={row.orders}
          />
        ))}
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-xl border p-4',
        accent ? 'border-brand/25 bg-brand-subtle' : 'border-border bg-surface',
      )}
    >
      <p className="mb-2 text-xs font-medium text-muted">{label}</p>
      <p className={cx('font-mono text-lg font-semibold', accent ? 'text-brand' : 'text-text')}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function SourceCard({ label, sales, orders }: { label: string; sales: number; orders: number }) {
  return (
    <Card className="p-4">
      <p className="mb-1 text-xs text-muted">{label}</p>
      <p className="font-mono font-medium">{cedis(sales)}</p>
      <p className="mt-0.5 text-xs text-muted">{orders === 1 ? '1 order' : `${orders} orders`}</p>
    </Card>
  );
}

function RecentOrders({
  orders,
  total,
  loading,
  error,
}: {
  orders: OrderRow[] | undefined;
  total: number | undefined;
  loading: boolean;
  error: string | undefined;
}) {
  let body: ReactNode;
  if (loading) {
    body = (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  } else if (error) {
    body = (
      <div className="p-4">
        <ErrorNote>{error}</ErrorNote>
      </div>
    );
  } else if (!orders || orders.length === 0) {
    body = <p className="px-5 py-8 text-center text-sm text-muted">No orders yet today.</p>;
  } else {
    body = orders.map((order) => {
      const state = paymentState(order);
      return (
        <Link
          key={order.id}
          to={`/orders/${order.id}`}
          className="flex items-center gap-4 border-b border-border px-5 py-3.5 transition-colors last:border-b-0 hover:bg-tile/40"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted">{order.displayNumber}</span>
              <Tag>{SOURCE_WORDS[order.source]}</Tag>
            </div>
            <p className="mt-0.5 truncate text-sm">{orderLine(order.items)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-sm font-semibold">{cedis(order.total)}</p>
            <div className="mt-0.5">
              <Badge tone={state.tone}>{state.label}</Badge>
            </div>
          </div>
        </Link>
      );
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-semibold">Recent orders</h2>
        <Link to="/orders" className="text-xs font-medium text-brand">
          {total !== undefined ? `All ${total} today` : 'See all'}
        </Link>
      </div>
      {body}
    </Card>
  );
}
