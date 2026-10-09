import { ORDER_TYPES } from '@plateraa/shared';
import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { fetchDrawers, type Drawer } from '../lib/manager';
import { cedis, clock, hourRange, longDate, shortDate, todayHere } from '../lib/money';
import {
  fetchOrders,
  fetchRefundsOwed,
  orderLine,
  paymentState,
  type BackTo,
  type OrderRow,
} from '../lib/orders';
import { busiestHour, fetchDay, type DaySummary } from '../lib/reports';
import { alertTone, tabletAlertWords } from '../lib/tablet-alerts';
import { fetchTablets, type Tablet } from '../lib/team';
import { useSession } from '../lib/session';
import { TYPE_WORDS, kindWords } from '../lib/words';
import { useMe } from '../shell/Shell';
import { Badge, Button, Card, ErrorNote, Spinner, Tag, cx } from '../ui/controls';
import { Page } from '../ui/Page';
import { PayoutDialog } from './money-dialogs';

const OrdersByHourChart = lazy(() => import('./OrdersByHourChart'));

/** Today, or any past day picked with `?date=` (so a day can be shared). */
export function TodayPage() {
  const me = useMe();
  const { tenantId } = useSession();
  const [params, setParams] = useSearchParams();
  const here = todayHere();
  const picked = params.get('date');
  const isToday = !picked || picked >= here;
  const seesMoney = me.capabilities.includes('reports.revenue.view');
  const recordsRefunds = me.capabilities.includes('refunds.record');
  const recordsPayouts = me.capabilities.includes('payouts.record');
  // Is every tablet keeping up? Checked again every minute while Today is open.
  const tablets = useQuery({
    queryKey: ['tablets', tenantId],
    queryFn: fetchTablets,
    enabled: me.capabilities.includes('devices.manage'),
    refetchInterval: 60_000,
  });
  const drawers = useQuery({
    queryKey: ['drawers', tenantId],
    queryFn: fetchDrawers,
    enabled: recordsPayouts && isToday,
  });

  // Today is left to the server, which knows the business's own trading day.
  const day = useQuery({
    queryKey: ['day', tenantId, isToday ? 'today' : picked],
    queryFn: () => fetchDay(isToday ? undefined : picked!),
    enabled: seesMoney,
  });
  const recent = useQuery({
    queryKey: ['orders', tenantId, { date: isToday ? undefined : picked, limit: 5 }],
    queryFn: () => fetchOrders({ ...(isToday ? {} : { date: picked! }), limit: 5 }),
  });
  const owed = useQuery({
    queryKey: ['refunds-owed', tenantId],
    queryFn: fetchRefundsOwed,
    enabled: recordsRefunds,
  });

  const date = isToday ? (day.data?.date ?? recent.data?.[0]?.businessDate ?? here) : picked!;
  const pick = (value: string) =>
    setParams(value && value < here ? { date: value } : {}, { replace: true });

  return (
    <Page
      title={isToday ? 'Today' : shortDate(date)}
      subtitle={longDate(date)}
      actions={
        <>
          {!isToday && (
            <Button variant="secondary" small onClick={() => pick('')}>
              Today
            </Button>
          )}
          <input
            type="date"
            aria-label="Day"
            value={date}
            max={here}
            onChange={(event) => pick(event.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted-foreground outline-none focus:border-brand"
          />
        </>
      }
    >
      {tablets.data && <TabletAlerts tablets={tablets.data} />}
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
          {day.data && <Figures day={day.data} isToday={isToday} offersDineIn={me.offersDineIn} />}
        </>
      ) : (
        <Card className="mb-6 px-5 py-4">
          <p className="text-sm font-medium">Sales totals are hidden for you</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The owner decides who sees them, on the Staff page.
          </p>
        </Card>
      )}

      {isToday && drawers.data && drawers.data.length > 0 && <OpenDrawers drawers={drawers.data} />}

      <RecentOrders
        orders={recent.data}
        total={day.data?.orders}
        loading={recent.isPending}
        error={recent.error?.message}
        date={isToday ? null : date}
      />
    </Page>
  );
}

/** A tablet that isn't keeping up: its sales may be missing from the figures below. */
function TabletAlerts({ tablets }: { tablets: Tablet[] }) {
  const alerts = tablets.flatMap((tablet) =>
    tablet.alerts.map((alert) => ({ key: `${tablet.id}-${alert.kind}`, tablet, alert })),
  );
  if (alerts.length === 0) return null;
  return (
    <div className="mb-5 space-y-2">
      {alerts.map(({ key, tablet, alert }) => (
        <Link
          key={key}
          to="/staff"
          className={cx(
            'flex items-start gap-3 rounded-xl border p-4',
            alertTone(alert) === 'red'
              ? 'border-red/20 bg-red-bg text-red'
              : 'border-amber/25 bg-amber-bg text-amber',
          )}
        >
          <span aria-hidden="true">⚠</span>
          <p className="text-sm font-medium">{tabletAlertWords(tablet.name, alert)}</p>
        </Link>
      ))}
    </div>
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

/** The tablets' open drawers. Payouts are recorded here: the tablet can't record them. */
function OpenDrawers({ drawers }: { drawers: Drawer[] }) {
  const [paying, setPaying] = useState<Drawer | null>(null);
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-semibold">Open drawers</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cash paid out of a drawer is recorded here. The tablet can’t record it.
        </p>
      </div>
      {drawers.map((drawer) => (
        <div
          key={drawer.shiftId}
          className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{drawer.deviceName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Opened {clock(drawer.openedAt)}
              {drawer.openedBy ? ` by ${drawer.openedBy}` : ''}
              {drawer.expectedCash !== null
                ? ` · ${cedis(drawer.expectedCash)} expected in it`
                : ''}
            </p>
          </div>
          <Button variant="secondary" small onClick={() => setPaying(drawer)}>
            Record payout
          </Button>
        </div>
      ))}
      {paying && <PayoutDialog drawer={paying} onClose={() => setPaying(null)} />}
    </Card>
  );
}

function Figures({
  day,
  isToday,
  offersDineIn,
}: {
  day: DaySummary;
  isToday: boolean;
  offersDineIn: boolean;
}) {
  // Dine-in shows where the owner offers it, or on a day that had some.
  const types = ORDER_TYPES.filter(
    (type) =>
      type !== 'DINE_IN' || offersDineIn || day.byType.some((row) => row.type === 'DINE_IN'),
  );
  // Each figure opens the rows behind it, for this day.
  const orders = (filters: Record<string, string>) =>
    `/orders?${new URLSearchParams({ date: day.date, ...filters })}`;
  const oneDay = new URLSearchParams({ range: 'pick', from: day.date, to: day.date });
  const busiest = busiestHour(day.byHour);
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric
          accent
          label="Money in"
          value={cedis(day.moneyIn)}
          sub={day.orders === 1 ? '1 order' : `${day.orders} orders`}
          to={orders({ method: 'CASH,LINK' })}
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
          to={
            day.platformOwed > 0 && day.unpaid === 0
              ? orders({ method: 'PLATFORM' })
              : orders({ paid: 'UNPAID' })
          }
        />
        <Metric
          label="Money out"
          value={cedis(day.moneyOut)}
          sub={`What's left: ${cedis(day.left)}`}
          to={`/expenses?${oneDay}`}
        />
        <Metric
          label={isToday ? 'Profit today' : 'Profit'}
          value={cedis(day.profit)}
          sub={day.commissionEstimate > 0 ? 'After expenses and commission' : 'After expenses'}
          to={`/reports?${oneDay}`}
        />
      </div>

      <Card className="mb-6 p-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Orders by hour
        </p>
        {busiest ? (
          <>
            <p className="mt-1 text-2xl font-semibold">{hourRange(busiest.hour)}</p>
            <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
              Busiest hour · {busiest.orders === 1 ? '1 order' : `${busiest.orders} orders`}
            </p>
            <Suspense fallback={<div className="h-[150px]" />}>
              <OrdersByHourChart byHour={day.byHour} />
            </Suspense>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {isToday ? 'No orders yet today.' : 'No orders on this day.'}
          </p>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {types.map((type) => {
          const row = day.byType.find((r) => r.type === type);
          return (
            <TypeCard
              key={type}
              label={TYPE_WORDS[type]}
              sales={row?.sales ?? 0}
              orders={row?.orders ?? 0}
              to={orders({ type })}
            />
          );
        })}
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
  to,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  /** Where the rows behind the figure are. */
  to: string;
}) {
  return (
    <Link
      to={to}
      className={cx(
        'block rounded-xl border p-4 transition-colors hover:border-brand/50',
        accent ? 'border-brand/25 bg-brand-subtle' : 'border-border bg-surface',
      )}
    >
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cx('font-mono text-lg font-semibold', accent ? 'text-brand' : 'text-text')}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Link>
  );
}

function TypeCard({
  label,
  sales,
  orders,
  to,
}: {
  label: string;
  sales: number;
  orders: number;
  /** The day's dine-in, pickup or delivery orders. */
  to: string;
}) {
  return (
    <Link
      to={to}
      className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand/50"
    >
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className="font-mono font-medium">{cedis(sales)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {orders === 1 ? '1 order' : `${orders} orders`}
      </p>
    </Link>
  );
}

/** The latest orders of the day; `date` is null for today. */
function RecentOrders({
  orders,
  total,
  loading,
  error,
  date,
}: {
  orders: OrderRow[] | undefined;
  total: number | undefined;
  loading: boolean;
  error: string | undefined;
  date: string | null;
}) {
  const back: BackTo = date
    ? { back: `/?date=${date}`, label: shortDate(date) }
    : { back: '/', label: 'Today' };
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
    body = (
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">
        {date ? 'No orders on this day.' : 'No orders yet today.'}
      </p>
    );
  } else {
    body = orders.map((order) => {
      const state = paymentState(order);
      return (
        <Link
          key={order.id}
          to={`/orders/${order.id}`}
          state={back}
          className="flex items-center gap-4 border-b border-border px-5 py-3.5 transition-colors last:border-b-0 hover:bg-tile/40"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{order.displayNumber}</span>
              <Tag>{kindWords(order)}</Tag>
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
        <h2 className="font-semibold">{date ? 'Latest orders' : 'Recent orders'}</h2>
        <Link
          to={date ? `/orders?date=${date}` : '/orders'}
          className="text-xs font-medium text-brand"
        >
          {total !== undefined ? `All ${total}${date ? '' : ' today'}` : 'See all'}
        </Link>
      </div>
      {body}
    </Card>
  );
}
