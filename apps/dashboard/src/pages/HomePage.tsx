import { ORDER_TYPES } from '@plateraa/shared';
import { useQuery } from '@tanstack/react-query';
import { ReceiptText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { BarChart } from '@/components/arc/bar-chart/bar-chart';
import { Button } from '@/components/arc/button/button';
import { DonutChart } from '@/components/arc/donut-chart/donut-chart';
import { Gauge } from '@/components/arc/gauge/gauge';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { Sparkline } from '@/components/arc/sparkline/sparkline';
import { Timeline, type TimelineEvent } from '@/components/arc/timeline/timeline';
import { Bento, Cedis, Tile } from '@/components/app/bento';
import { DayPicker } from '@/components/app/day-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { shiftDays } from '../lib/expenses';
import { fetchDrawers, type Drawer } from '../lib/manager';
import {
  cedis,
  clock,
  hourLabel,
  hourRange,
  longDate,
  shortDate,
  todayHere,
  wholeCedis,
} from '../lib/money';
import {
  fetchOrders,
  fetchRefundsOwed,
  orderLine,
  paymentState,
  type OrderRow,
} from '../lib/orders';
import { busiestHour, fetchDay, fetchPeriod, type DaySummary, type Period } from '../lib/reports';
import { useSession } from '../lib/session';
import { alertTone, tabletAlertWords } from '../lib/tablet-alerts';
import { fetchTablets, type Tablet } from '../lib/team';
import { TYPE_WORDS, kindWords } from '../lib/words';
import { useMe } from '../shell/Shell';
import { Page } from '../ui/Page';
import { PayoutDialog } from './money-dialogs';

/** How many of the day's latest orders the feed shows. */
const FEED_SIZE = 8;

/**
 * Home: the day at a glance, as a bento grid. Today, or any past day picked with `?date=` (so a
 * day can be shared). Money in is the one big tile; the small tiles carry the last seven days as a
 * trend; every tile's arrow opens the orders or expenses behind it.
 */
export function HomePage() {
  const me = useMe();
  const { tenantId } = useSession();
  const [params, setParams] = useSearchParams();
  const here = todayHere();
  const picked = params.get('date');
  const isToday = !picked || picked >= here;
  const seesMoney = me.capabilities.includes('reports.revenue.view');
  const recordsRefunds = me.capabilities.includes('refunds.record');
  const recordsPayouts = me.capabilities.includes('payouts.record');
  // Is every tablet keeping up? Checked again every minute while Home is open.
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
  const date = isToday ? (day.data?.date ?? here) : picked!;
  // The week up to the day shown, for the trend lines (the same query Reports makes).
  const weekFrom = shiftDays(date, -6);
  const week = useQuery({
    queryKey: ['period', tenantId, weekFrom, date],
    queryFn: () => fetchPeriod(weekFrom, date),
    enabled: seesMoney,
  });
  const recent = useQuery({
    queryKey: ['orders', tenantId, { date: isToday ? undefined : picked, limit: FEED_SIZE }],
    queryFn: () => fetchOrders({ ...(isToday ? {} : { date: picked! }), limit: FEED_SIZE }),
  });
  const owed = useQuery({
    queryKey: ['refunds-owed', tenantId],
    queryFn: fetchRefundsOwed,
    enabled: recordsRefunds,
  });

  const pick = (value: string) =>
    setParams(value && value < here ? { date: value } : {}, { replace: true });
  const openDrawers = isToday ? (drawers.data ?? []) : [];

  return (
    <Page
      title={isToday ? 'Home' : shortDate(date)}
      subtitle={longDate(date)}
      actions={<DayPicker date={date} today={here} onPick={pick} />}
    >
      <div className="flex flex-col gap-4">
        {!seesMoney && (
          <Alert tone="info" title="Sales totals are hidden for you">
            The owner decides who sees them, on the Staff page.
          </Alert>
        )}
        {seesMoney && day.isError && (
          <Alert tone="danger" title="Couldn’t load the day’s figures">
            <div className="flex flex-col items-start gap-3">
              <p>{day.error.message}</p>
              <Button variant="secondary" size="sm" onClick={() => day.refetch()}>
                Try again
              </Button>
            </div>
          </Alert>
        )}

        <Bento>
          {seesMoney && day.isPending && <MoneySkeleton />}
          {seesMoney && day.data && (
            <MoneyTiles day={day.data} week={week.data} isToday={isToday} />
          )}

          {seesMoney && day.data && (
            <>
              <OrdersByHour day={day.data} isToday={isToday} />
              <ByType day={day.data} offersDineIn={me.offersDineIn} />
            </>
          )}

          <Feed
            orders={recent.data}
            loading={recent.isPending}
            error={recent.error?.message}
            date={isToday ? null : date}
            total={day.data?.orders}
          />
          <NeedsYou tablets={tablets.data} owed={owed.data} drawers={openDrawers} />
        </Bento>
      </div>
    </Page>
  );
}

/** The day's figures each open the rows behind them, for that day. */
function dayLinks(date: string) {
  const oneDay = new URLSearchParams({ range: 'pick', from: date, to: date });
  return {
    orders: (filters: Record<string, string> = {}) =>
      `/orders?${new URLSearchParams({ date, ...filters })}`,
    expenses: `/expenses?${oneDay}`,
    reports: `/reports?${oneDay}`,
  };
}

/** One value per day of the week, oldest first, with the day names for scrubbing and the total. */
function trend(week: Period | undefined, pick: (day: Period['byDay'][number]) => number) {
  if (!week || week.byDay.length < 2) return null;
  const data = week.byDay.map(pick);
  return {
    data,
    labels: week.byDay.map((day) => shortDate(day.date)),
    total: data.reduce((sum, value) => sum + value, 0),
  };
}

function MoneyTiles({
  day,
  week,
  isToday,
}: {
  day: DaySummary;
  week: Period | undefined;
  isToday: boolean;
}) {
  const links = dayLinks(day.date);
  const cash = day.byMethod.find((row) => row.method === 'CASH')?.amount ?? 0;
  const mobile = day.byMethod.find((row) => row.method === 'LINK')?.amount ?? 0;
  const moneyInWeek = trend(week, (d) => d.moneyIn);
  const ordersWeek = trend(week, (d) => d.orders);
  const moneyOutWeek = trend(week, (d) => d.moneyOut);
  const leftWeek = trend(week, (d) => d.moneyIn - d.moneyOut);
  // How much of the day's takings is already in hand.
  const owedTotal = day.moneyIn + day.notYetCollected;
  const collected = owedTotal > 0 ? Math.round((day.moneyIn / owedTotal) * 100) : null;

  return (
    <>
      {/* The one big tile. */}
      <Tile
        title={isToday ? 'Money in today' : 'Money in'}
        to={links.orders({ method: 'CASH,LINK' })}
        toLabel="Open the orders that paid"
        className="col-span-2 lg:row-span-2"
      >
        <div className="flex flex-col gap-1">
          <Cedis amount={day.moneyIn} big />
          <span className="text-sm text-muted-foreground">
            From {day.orders === 1 ? '1 order' : `${day.orders} orders`}
          </span>
        </div>
        {cash + mobile > 0 ? (
          <DonutChart
            label="How the money came in"
            size={224}
            thickness={18}
            formatValue={wholeCedis}
            totalLabel="Money in"
            data={[
              { key: 'cash', label: 'Cash', value: cash },
              { key: 'mobile', label: 'Mobile money', value: mobile },
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {isToday ? 'No money in yet today.' : 'No money came in on this day.'}
          </p>
        )}
        {moneyInWeek && (
          <div className="mt-auto border-t pt-3">
            <Sparkline
              label="Last 7 days"
              data={moneyInWeek.data}
              labels={moneyInWeek.labels}
              formatValue={cedis}
              value={cedis(moneyInWeek.total)}
              width={420}
              height={44}
            />
          </div>
        )}
      </Tile>

      <Tile title="Orders" to={links.orders()} toLabel="Open the day’s orders">
        <span className="font-heading text-xl leading-none tracking-[-0.03em] tabular-nums sm:text-2xl">
          {day.orders}
        </span>
        {ordersWeek && (
          <div className="mt-auto">
            <Sparkline
              label="Last 7 days"
              data={ordersWeek.data}
              labels={ordersWeek.labels}
              value={String(ordersWeek.total)}
              width={200}
              height={56}
            />
          </div>
        )}
      </Tile>

      <Tile
        title={isToday ? 'Profit today' : 'Profit'}
        to={links.reports}
        toLabel="Open the day’s report"
      >
        <Cedis amount={day.profit} />
        <span className="text-xs text-muted-foreground">
          {day.commissionEstimate > 0 ? 'After expenses and commission' : 'After expenses'}
        </span>
        {leftWeek && (
          <div className="mt-auto">
            <Sparkline
              label="Last 7 days"
              data={leftWeek.data}
              labels={leftWeek.labels}
              formatValue={cedis}
              value={wholeCedis(leftWeek.total)}
              tone={leftWeek.total < 0 ? 'danger' : 'success'}
              width={200}
              height={56}
            />
          </div>
        )}
      </Tile>

      <Tile
        title="Not yet collected"
        to={
          day.platformOwed > 0 && day.unpaid === 0
            ? links.orders({ method: 'PLATFORM' })
            : links.orders({ paid: 'UNPAID' })
        }
        toLabel="Open the unpaid orders"
        tone={day.unpaid > 0 ? 'warning' : undefined}
      >
        <Cedis amount={day.notYetCollected} />
        <span className="text-xs text-muted-foreground">
          {day.platformOwed > 0
            ? `${cedis(day.platformOwed)} from Bolt and Chowdeck`
            : day.unpaid > 0
              ? 'Orders still to be paid'
              : 'Every order is paid'}
        </span>
        {collected !== null && (
          <div className="mt-auto flex justify-center">
            <Gauge
              label="Collected"
              value={collected}
              detail="Of the day’s takings, in hand"
              thresholds={[
                { from: 0, tone: 'warning', label: 'Still to collect' },
                { from: 95, tone: 'success', label: 'Nearly all in' },
              ]}
            />
          </div>
        )}
      </Tile>

      <Tile title="Money out" to={links.expenses} toLabel="Open the day’s expenses">
        <Cedis amount={day.moneyOut} />
        <span className="text-xs text-muted-foreground">{cedis(day.left)} left after it</span>
        {moneyOutWeek && (
          <div className="mt-auto">
            <Sparkline
              label="Last 7 days"
              data={moneyOutWeek.data}
              labels={moneyOutWeek.labels}
              formatValue={cedis}
              value={wholeCedis(moneyOutWeek.total)}
              width={200}
              height={56}
            />
          </div>
        )}
      </Tile>
    </>
  );
}

function MoneySkeleton() {
  return (
    <>
      <Skeleton
        className="h-80 rounded-(--radius-surface) col-span-2 lg:row-span-2 lg:h-auto"
        aria-label="Loading the day’s figures"
      />
      {[0, 1, 2, 3].map((tile) => (
        <Skeleton key={tile} className="h-36 rounded-(--radius-surface)" />
      ))}
    </>
  );
}

/** Orders in each hour, from the first to the last, with the busiest named above. */
function OrdersByHour({ day, isToday }: { day: DaySummary; isToday: boolean }) {
  const busiest = busiestHour(day.byHour);
  const bars = useMemo(() => {
    const counts = new Map(day.byHour.filter((r) => r.orders > 0).map((r) => [r.hour, r.orders]));
    if (counts.size === 0) return [];
    const hours = [...counts.keys()];
    const out = [];
    for (let hour = Math.min(...hours); hour <= Math.max(...hours); hour++) {
      out.push({
        key: String(hour),
        label: hourRange(hour),
        axisLabel: hourLabel(hour),
        value: counts.get(hour) ?? 0,
      });
    }
    return out;
  }, [day.byHour]);

  return (
    <Tile
      title={busiest ? `Busiest ${hourRange(busiest.hour)}` : 'Orders by hour'}
      className="col-span-2"
    >
      {bars.length > 0 ? (
        <BarChart
          data={bars}
          label="Orders"
          period={isToday ? 'Today, by hour' : 'By hour'}
          unit="orders"
          averageLabel="An hour, on average"
          valueLabel="Orders"
          categoryLabel="Hour"
          height={160}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {isToday ? 'No orders yet today.' : 'No orders on this day.'}
        </p>
      )}
    </Tile>
  );
}

/** Dine-in (where the owner offers it, or on a day that had some), pickup and delivery. */
function ByType({ day, offersDineIn }: { day: DaySummary; offersDineIn: boolean }) {
  const types = ORDER_TYPES.filter(
    (type) =>
      type !== 'DINE_IN' || offersDineIn || day.byType.some((row) => row.type === 'DINE_IN'),
  );
  const data = types.map((type) => ({
    key: type,
    label: TYPE_WORDS[type],
    value: day.byType.find((row) => row.type === type)?.sales ?? 0,
  }));
  return (
    <Tile
      title="Dine-in, pickup and delivery"
      to={dayLinks(day.date).orders()}
      className="col-span-2"
    >
      {data.some((part) => part.value > 0) ? (
        <DonutChart
          label="Sales by order type"
          size={224}
          thickness={16}
          formatValue={wholeCedis}
          totalLabel="Sales"
          data={data}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No sales yet.</p>
      )}
    </Tile>
  );
}

/** The time now, a minute at a time, for the feed's "5 min ago". */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const FEED_TONES = {
  green: 'success',
  red: 'danger',
  amber: 'neutral',
  neutral: 'neutral',
} as const;

/** The day's latest orders as a feed, newest first; each opens to its items and a link. */
function Feed({
  orders,
  loading,
  error,
  date,
  total,
}: {
  orders: OrderRow[] | undefined;
  loading: boolean;
  error: string | undefined;
  date: string | null;
  total: number | undefined;
}) {
  const now = useNow();
  const back = date
    ? { back: `/?date=${date}`, label: shortDate(date) }
    : { back: '/', label: 'Home' };
  const events: TimelineEvent[] = (orders ?? []).map((order) => {
    const state = paymentState(order);
    return {
      id: order.id,
      at: order.takenAt,
      title: `${order.displayNumber}, ${kindWords(order).toLowerCase()}: ${cedis(order.total)}, ${state.label.toLowerCase()}`,
      ...(order.takenBy ? { actor: order.takenBy } : {}),
      meta: clock(order.takenAt),
      tone: FEED_TONES[state.tone],
      detail: (
        <div className="flex flex-col items-start gap-2 text-sm">
          <span>{orderLine(order.items)}</span>
          <Link
            to={`/orders/${order.id}`}
            state={back}
            className="font-medium text-accent-strong underline-offset-2 hover:underline"
          >
            Open order {order.displayNumber}
          </Link>
        </div>
      ),
    };
  });

  return (
    <Tile
      title={date ? 'Latest orders' : 'What’s happening'}
      to={date ? `/orders?date=${date}` : '/orders'}
      toLabel={total !== undefined ? `Open all ${total} orders` : 'Open the orders'}
      className="col-span-2 lg:col-span-3"
    >
      {loading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      )}
      {error && (
        <Alert tone="danger" title="Couldn’t load the orders">
          {error}
        </Alert>
      )}
      {orders && orders.length === 0 && (
        <EmptyState
          icon={<ReceiptText size={24} strokeWidth={1.75} />}
          title={date ? 'No orders on this day' : 'No orders yet today'}
          description="Orders from the tablet and your online store show here as they come in."
        />
      )}
      {events.length > 0 && (
        <Timeline
          events={events}
          now={now}
          label="The day’s latest orders"
          timeZone="Africa/Accra"
          locale="en-GB"
          maxHeight={420}
          headingLevel={3}
        />
      )}
    </Tile>
  );
}

/**
 * What needs someone: refunds to give back, tablets that aren't keeping up, and the open drawers
 * (payouts are recorded from here: the tablet can't record them).
 */
function NeedsYou({
  tablets,
  owed,
  drawers,
}: {
  tablets?: Tablet[] | undefined;
  owed?: OrderRow[] | undefined;
  drawers: Drawer[];
}) {
  const [paying, setPaying] = useState<Drawer | null>(null);
  const alerts = (tablets ?? []).flatMap((tablet) =>
    tablet.alerts.map((alert) => ({ key: `${tablet.id}-${alert.kind}`, tablet, alert })),
  );
  const refunds = owed ?? [];
  const [first] = refunds;
  const calm = alerts.length === 0 && refunds.length === 0;

  return (
    <Tile
      title="Needs you"
      className="col-span-2 lg:col-span-1"
      tone={refunds.length > 0 ? 'danger' : alerts.length > 0 ? 'warning' : undefined}
    >
      {calm && <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>}
      {first && (
        <Alert
          tone="danger"
          title={refunds.length === 1 ? '1 refund owed' : `${refunds.length} refunds owed`}
        >
          <p>
            {refunds.length === 1
              ? `${cedis(first.refundOwed)} back for order ${first.displayNumber}. `
              : 'Give the money back, then record it. '}
            <Link to="/refunds" className="font-medium underline underline-offset-2">
              Open refunds
            </Link>
          </p>
        </Alert>
      )}
      {alerts.map(({ key, tablet, alert }) => (
        <Alert
          key={key}
          tone={alertTone(alert) === 'red' ? 'danger' : 'warning'}
          title={`${tablet.name} needs a look`}
        >
          <p>
            {tabletAlertWords(tablet.name, alert)}{' '}
            <Link to="/staff" className="font-medium underline underline-offset-2">
              See tablets
            </Link>
          </p>
        </Alert>
      ))}
      {drawers.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <h3 className="text-sm font-medium">Open drawers</h3>
          <ul className="flex flex-col gap-2">
            {drawers.map((drawer) => (
              <li key={drawer.shiftId} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{drawer.deviceName}</span>
                  <span className="text-xs text-muted-foreground">
                    Since {clock(drawer.openedAt)}
                    {drawer.expectedCash !== null ? `, ${cedis(drawer.expectedCash)} in it` : ''}
                  </span>
                </span>
                <Button variant="secondary" size="sm" onClick={() => setPaying(drawer)}>
                  Payout
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Cash paid out of a drawer is recorded here. The tablet can’t record it.
          </p>
        </div>
      )}
      {paying && <PayoutDialog drawer={paying} onClose={() => setPaying(null)} />}
    </Tile>
  );
}
