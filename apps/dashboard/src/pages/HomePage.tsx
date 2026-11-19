import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Clock, ReceiptText } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { BarChart } from '@/components/arc/bar-chart/bar-chart';
import { Button } from '@/components/arc/button/button';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { Timeline, type TimelineEvent } from '@/components/arc/timeline/timeline';
import { Cedis, Tile } from '@/components/app/bento';
import { DayPicker } from '@/components/app/day-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fetchDrawers, type Drawer } from '../lib/manager';
import {
  clock,
  hourLabel,
  hourRange,
  longDate,
  plainCedis,
  shortDate,
  todayHere,
} from '../lib/money';
import {
  FEED_TONES,
  fetchOrders,
  fetchRefundsOwed,
  itemWords,
  orderLine,
  PAYMENT_ICONS,
  paymentState,
  type OrderRow,
} from '../lib/orders';
import { busiestHour, fetchDay, type DaySummary } from '../lib/reports';
import { useSession } from '../lib/session';
import { alertTone, tabletAlertWords } from '../lib/tablet-alerts';
import { fetchTablets, type Tablet } from '../lib/team';
import { useNow } from '../lib/use-now';
import { kindWords } from '../lib/words';
import { useMe } from '../shell/Shell';
import { Page } from '../ui/Page';
import { PayoutDialog } from './money-dialogs';
import { SetupChecklist } from './SetupChecklist';

/** How many of the day's latest orders the feed shows. */
const FEED_SIZE = 8;

/**
 * Home: the day at a glance, kept clean (user request, 10 Oct: "too many charts"). What needs
 * someone comes first; then money in as the one big figure, plain-number tiles that each open
 * the rows behind them, the one chart that changes what you do today (orders by hour), and the
 * latest orders. Trends and shares live in Reports. Today, or any past day with `?date=`.
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
  const chart = seesMoney && day.data ? <OrdersByHour day={day.data} isToday={isToday} /> : null;

  return (
    <Page
      title={isToday ? 'Home' : shortDate(date)}
      subtitle={longDate(date)}
      actions={<DayPicker date={date} today={here} onPick={pick} />}
    >
      <div className="flex flex-col gap-6">
        <NeedsYou tablets={tablets.data} owed={owed.data} />
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

        {me.role === 'OWNER' && (
          // As wide as "Money in today", sitting right above it (user request, 24 Oct): the
          // bento's two of four columns on a laptop, less half its 1rem gap.
          <SetupChecklist
            staffId={me.staffId}
            tablets={tablets.data}
            className="lg:w-[calc(50%-0.5rem)]"
          />
        )}
        {seesMoney && day.isPending && <MoneySkeleton />}
        {seesMoney && day.data && (
          <>
            <MoneyIn day={day.data} isToday={isToday} />
            <Figures day={day.data} isToday={isToday} />
          </>
        )}

        {/* The chart and the drawers share a column beside the feed, so neither leaves a hole. */}
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          {(chart || openDrawers.length > 0) && (
            <div className="flex min-w-0 flex-col gap-4">
              {chart}
              {openDrawers.length > 0 && <OpenDrawers drawers={openDrawers} />}
            </div>
          )}
          <Feed
            orders={recent.data}
            loading={recent.isPending}
            error={recent.error?.message}
            date={isToday ? null : date}
            total={day.data?.orders}
            className={chart || openDrawers.length > 0 ? undefined : 'lg:col-span-2'}
          />
        </div>
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

/** How money in came: cash and mobile money (paying online counts as mobile money). */
const MONEY_IN = [
  { method: 'CASH', words: 'Cash', swatch: 'bg-foreground' },
  { method: 'LINK', words: 'Mobile money', swatch: 'bg-primary' },
] as const;

/**
 * The one big figure, standing on the page rather than in a card: money in, and how it came
 * (cash and mobile money) as a single bar beside it.
 */
function MoneyIn({ day, isToday }: { day: DaySummary; isToday: boolean }) {
  const links = dayLinks(day.date);
  const parts = MONEY_IN.map((part) => ({
    ...part,
    amount: day.byMethod.find((row) => row.method === part.method)?.amount ?? 0,
  }));
  const partsTotal = parts.reduce((sum, part) => sum + part.amount, 0);

  return (
    <section
      aria-labelledby="money-in"
      className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-10"
    >
      <div className="flex flex-col gap-3">
        <h2 id="money-in" className="text-sm text-text-secondary">
          <Link
            to={links.orders({ method: 'CASH,LINK' })}
            className="group inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground"
          >
            {isToday ? 'Money in today' : 'Money in'}
            <ArrowUpRight
              size={14}
              strokeWidth={1.75}
              aria-hidden
              className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </Link>
        </h2>
        <Cedis amount={day.moneyIn} big />
        <span className="text-sm text-muted-foreground">
          From {day.orders === 1 ? '1 order' : `${day.orders} orders`}
        </span>
      </div>
      {partsTotal > 0 && (
        <div className="flex w-full flex-col gap-3 md:max-w-sm md:pb-1">
          <div
            role="img"
            aria-label={parts.map((part) => `${part.words} ${plainCedis(part.amount)}`).join(', ')}
            className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted"
          >
            {parts
              .filter((part) => part.amount > 0)
              .map((part) => (
                <div
                  key={part.method}
                  className={part.swatch}
                  style={{ width: `${(part.amount / partsTotal) * 100}%` }}
                />
              ))}
          </div>
          <ul className="flex flex-wrap justify-between gap-x-6 gap-y-2">
            {parts.map((part) => (
              <li key={part.method}>
                <Link
                  to={links.orders({ method: part.method })}
                  className="flex items-center gap-2 text-sm hover:underline"
                >
                  <span className={cn('size-2 rounded-full', part.swatch)} aria-hidden />
                  <span className="text-text-secondary">{part.words}</span>
                  <span className="font-mono">{plainCedis(part.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * The day's other figures in one strip, split by hairlines rather than boxed one by one. Each
 * opens the rows behind it; its arrow shows on hover. Nothing in it is a chart, so a whole
 * figure can be the link.
 */
function Figures({ day, isToday }: { day: DaySummary; isToday: boolean }) {
  const links = dayLinks(day.date);
  const takings = day.moneyIn + day.notYetCollected;
  const collected = takings > 0 ? Math.round((day.moneyIn / takings) * 100) : null;

  return (
    <section
      aria-label="The day’s figures"
      // The 1px gaps over a border-coloured back are the hairlines, on a phone's 2×2 as well.
      className="grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-surface) border bg-border lg:grid-cols-4"
    >
      <Figure label="Orders" to={links.orders()} toLabel="Open the day’s orders">
        <span className="font-heading text-xl leading-none tracking-[-0.03em] tabular-nums sm:text-2xl">
          {day.orders}
        </span>
        <FigureNote>{isToday ? 'So far today' : 'That day'}</FigureNote>
      </Figure>
      <Figure
        label={isToday ? 'Profit today' : 'Profit'}
        to={links.reports}
        toLabel="Open the day’s report"
      >
        <Cedis amount={day.profit} />
        <FigureNote>
          {day.commissionEstimate > 0 ? 'After expenses and commission' : 'After expenses'}
        </FigureNote>
      </Figure>
      <Figure
        label="Not yet collected"
        to={
          day.platformOwed > 0 && day.unpaid === 0
            ? links.orders({ method: 'PLATFORM' })
            : links.orders({ paid: 'UNPAID' })
        }
        toLabel="Open the unpaid orders"
        attention={day.unpaid > 0}
      >
        <Cedis amount={day.notYetCollected} />
        <FigureNote>
          {day.platformOwed > 0
            ? `${plainCedis(day.platformOwed)} from Bolt and Chowdeck`
            : collected === null
              ? 'Nothing to collect yet'
              : `${collected}% of the day’s takings is in`}
        </FigureNote>
      </Figure>
      <Figure label="Money out" to={links.expenses} toLabel="Open the day’s expenses">
        <Cedis amount={day.moneyOut} />
        <FigureNote>{plainCedis(day.left)} left after it</FigureNote>
      </Figure>
    </section>
  );
}

function Figure({
  label,
  to,
  toLabel,
  attention,
  children,
}: {
  label: string;
  to: string;
  toLabel: string;
  /** Something here needs chasing: a small amber dot by the label, not a coloured box. */
  attention?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={`${label}. ${toLabel}`}
      className="group flex min-w-0 flex-col gap-3 bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:relative focus-visible:z-10 sm:p-5"
    >
      <span className="flex items-center justify-between gap-2 text-sm text-text-secondary">
        <span className="flex items-center gap-2">
          {attention && <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />}
          {label}
        </span>
        <ArrowUpRight
          size={14}
          strokeWidth={1.75}
          aria-hidden
          className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </span>
      <span className="flex flex-col gap-1.5">{children}</span>
    </Link>
  );
}

function FigureNote({ children }: { children: ReactNode }) {
  return <span className="truncate text-xs text-muted-foreground">{children}</span>;
}

function MoneySkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Loading the day’s figures">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-32 rounded-(--radius-surface) lg:h-28" />
    </div>
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
    <Tile title="Orders by hour">
      {bars.length > 0 ? (
        // The chart's own header is its readout (it follows the bar under the pointer), so the
        // tile's title names the chart and the busiest hour rests under the average.
        <BarChart
          data={bars}
          label="Orders"
          period={busiest ? `Busiest ${hourRange(busiest.hour)}` : isToday ? 'Today' : 'This day'}
          unit="orders"
          averageLabel="An hour, on average"
          valueLabel="Orders"
          categoryLabel="Hour"
          height={160}
        />
      ) : (
        <EmptyState
          icon={<Clock size={24} strokeWidth={1.75} />}
          title={isToday ? 'No orders yet today' : 'No orders on this day'}
          description={
            isToday
              ? 'Your busiest hours show here as orders come in.'
              : 'Nothing was ordered on this day.'
          }
        />
      )}
    </Tile>
  );
}

/** The day's latest orders as a feed, newest first; each opens to its items and a link. */
function Feed({
  orders,
  loading,
  error,
  date,
  total,
  className,
}: {
  orders: OrderRow[] | undefined;
  loading: boolean;
  error: string | undefined;
  date: string | null;
  total: number | undefined;
  className?: string | undefined;
}) {
  const now = useNow();
  const back = date
    ? { back: `/?date=${date}`, label: shortDate(date) }
    : { back: '/', label: 'Home' };
  const events: TimelineEvent[] = (orders ?? []).map((order) => {
    const state = paymentState(order);
    const Icon = PAYMENT_ICONS[state.key];
    return {
      id: order.id,
      at: order.takenAt,
      title: `${order.displayNumber}, ${kindWords(order).toLowerCase()}: ${plainCedis(order.total)}, ${state.label.toLowerCase()}`,
      ...(order.takenBy ? { actor: order.takenBy } : {}),
      // The time is already on the right; this line says what was ordered.
      meta: orderLine(order.items),
      tone: FEED_TONES[state.tone],
      icon: <Icon />,
      detail: (
        <div className="flex flex-col items-start gap-2 text-sm">
          <ul className="flex flex-col gap-0.5">
            {order.items.map((item, index) => (
              <li key={index}>{itemWords(item)}</li>
            ))}
          </ul>
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
      {...(className ? { className } : {})}
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
 * What needs someone, at the very top: refunds to give back and tablets that aren't keeping up.
 * Nothing shows when nothing needs anyone.
 */
function NeedsYou({
  tablets,
  owed,
}: {
  tablets?: Tablet[] | undefined;
  owed?: OrderRow[] | undefined;
}) {
  const alerts = (tablets ?? []).flatMap((tablet) =>
    tablet.alerts.map((alert) => ({ key: `${tablet.id}-${alert.kind}`, tablet, alert })),
  );
  const refunds = owed ?? [];
  const [first] = refunds;
  if (!first && alerts.length === 0) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {first && (
        <Alert
          tone="danger"
          title={refunds.length === 1 ? '1 refund owed' : `${refunds.length} refunds owed`}
        >
          <p>
            {refunds.length === 1
              ? `${plainCedis(first.refundOwed)} back for order ${first.displayNumber}. `
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
    </div>
  );
}

/** The tablets' open drawers. Payouts are recorded here: the tablet can't record them. */
function OpenDrawers({ drawers }: { drawers: Drawer[] }) {
  const [paying, setPaying] = useState<Drawer | null>(null);
  return (
    <Tile title="Open drawers">
      <ul className="flex flex-col gap-3">
        {drawers.map((drawer) => (
          <li key={drawer.shiftId} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{drawer.deviceName}</span>
              <span className="text-xs text-muted-foreground">
                Since {clock(drawer.openedAt)}
                {drawer.openedBy ? ` by ${drawer.openedBy}` : ''}
                {drawer.expectedCash !== null ? `, ${plainCedis(drawer.expectedCash)} in it` : ''}
              </span>
            </span>
            <Button variant="secondary" size="sm" onClick={() => setPaying(drawer)}>
              Record payout
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Cash paid out of a drawer is recorded here. The tablet can’t record it.
      </p>
      {paying && <PayoutDialog drawer={paying} onClose={() => setPaying(null)} />}
    </Tile>
  );
}
