import { ORDER_TYPES, type PaymentMethod } from '@plateraa/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ReceiptText } from 'lucide-react';
import { Suspense, lazy, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { DayPicker } from '@/components/app/day-picker';
import { Panel, PanelLink, PanelRows } from '@/components/app/panel';
import { StatusBadge } from '@/components/app/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
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
import { useSession } from '../lib/session';
import { alertTone, tabletAlertWords } from '../lib/tablet-alerts';
import { fetchTablets, type Tablet } from '../lib/team';
import { TYPE_WORDS, kindWords } from '../lib/words';
import { useMe } from '../shell/Shell';
import { Page } from '../ui/Page';
import { PayoutDialog } from './money-dialogs';

const OrdersByHourChart = lazy(() => import('./OrdersByHourChart'));

/**
 * Home: the day at a glance. Today, or any past day picked with `?date=` (so a day can be
 * shared). The day's money in is the one big figure; everything else is quiet rows that open the
 * orders or expenses behind them.
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
      title={isToday ? 'Home' : shortDate(date)}
      subtitle={longDate(date)}
      actions={<DayPicker date={date} today={here} onPick={pick} />}
    >
      <div className="flex flex-col gap-6">
        <NeedsYou tablets={tablets.data} owed={owed.data} />

        {seesMoney ? (
          <>
            {day.isPending && <MoneySkeleton />}
            {day.isError && (
              <Alert tone="danger" title="Couldn’t load the day’s figures">
                <div className="flex flex-col items-start gap-3">
                  <p>{day.error.message}</p>
                  <Button variant="secondary" size="sm" onClick={() => day.refetch()}>
                    Try again
                  </Button>
                </div>
              </Alert>
            )}
            {day.data && <DayMoney day={day.data} isToday={isToday} />}
          </>
        ) : (
          <Alert tone="info" title="Sales totals are hidden for you">
            The owner decides who sees them, on the Staff page.
          </Alert>
        )}

        {seesMoney && day.data && (
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <OrdersByHour day={day.data} isToday={isToday} />
            <ByType day={day.data} offersDineIn={me.offersDineIn} />
          </div>
        )}

        {isToday && drawers.data && drawers.data.length > 0 && (
          <OpenDrawers drawers={drawers.data} />
        )}

        <RecentOrders
          orders={recent.data}
          total={day.data?.orders}
          loading={recent.isPending}
          error={recent.error?.message}
          date={isToday ? null : date}
        />
      </div>
    </Page>
  );
}

/** What needs someone: refunds to give back, tablets that aren't keeping up. */
function NeedsYou({ tablets, owed }: { tablets?: Tablet[]; owed?: OrderRow[] }) {
  const alerts = (tablets ?? []).flatMap((tablet) =>
    tablet.alerts.map((alert) => ({ key: `${tablet.id}-${alert.kind}`, tablet, alert })),
  );
  const refunds = owed ?? [];
  if (alerts.length === 0 && refunds.length === 0) return null;
  const [first] = refunds;
  return (
    <div className="flex flex-col gap-3">
      {first && (
        <Alert
          tone="danger"
          title={refunds.length === 1 ? '1 refund owed' : `${refunds.length} refunds owed`}
        >
          <p>
            {refunds.length === 1
              ? `${cedis(first.refundOwed)} to give back for order ${first.displayNumber}. `
              : 'Give the money back to each customer, then record it. '}
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

/** The day's figures each open the rows behind them, for that day. */
function dayLinks(date: string) {
  const oneDay = new URLSearchParams({ range: 'pick', from: date, to: date });
  return {
    orders: (filters: Record<string, string>) =>
      `/orders?${new URLSearchParams({ date, ...filters })}`,
    expenses: `/expenses?${oneDay}`,
    reports: `/reports?${oneDay}`,
  };
}

/** The money that came in (CASH, LINK) split by how it was paid. Paid online counts as LINK. */
const MONEY_IN: { method: PaymentMethod; words: string; swatch: string }[] = [
  { method: 'CASH', words: 'Cash', swatch: 'bg-foreground' },
  { method: 'LINK', words: 'Mobile money', swatch: 'bg-primary' },
];

/** The one big figure: money in, how it came in, and where the rest of the day stands. */
function DayMoney({ day, isToday }: { day: DaySummary; isToday: boolean }) {
  const links = dayLinks(day.date);
  const parts = MONEY_IN.map((part) => ({
    ...part,
    amount: day.byMethod.find((row) => row.method === part.method)?.amount ?? 0,
  }));
  const partsTotal = parts.reduce((sum, part) => sum + part.amount, 0);
  return (
    <section
      aria-label="The day’s money"
      className="grid overflow-hidden rounded-(--radius-surface) border bg-card md:grid-cols-[3fr_2fr]"
    >
      <div className="flex flex-col gap-6 p-6 md:p-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">{isToday ? 'Money in today' : 'Money in'}</p>
          <BigMoney amount={day.moneyIn} />
          <Link
            to={links.orders({ method: 'CASH,LINK' })}
            className="self-start text-sm text-muted-foreground hover:text-foreground"
          >
            From {day.orders === 1 ? '1 order' : `${day.orders} orders`}
          </Link>
        </div>

        {partsTotal > 0 && (
          <div className="flex flex-col gap-3">
            <div
              role="img"
              aria-label={parts.map((part) => `${part.words} ${cedis(part.amount)}`).join(', ')}
              className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted"
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
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {parts.map((part) => (
                <li key={part.method}>
                  <Link
                    to={links.orders({ method: part.method })}
                    className="flex items-center gap-2 text-sm hover:underline"
                  >
                    <span className={cn('size-2 rounded-full', part.swatch)} aria-hidden />
                    <span className="text-text-secondary">{part.words}</span>
                    <span className="font-mono">{cedis(part.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ul className="flex flex-col divide-y border-t md:border-t-0 md:border-l">
        <LedgerRow
          label="Not yet collected"
          note={
            day.platformOwed > 0
              ? `${cedis(day.platformOwed)} from Bolt and Chowdeck`
              : day.unpaid > 0
                ? 'Orders still to be paid'
                : 'Every order is paid'
          }
          amount={day.notYetCollected}
          to={
            day.platformOwed > 0 && day.unpaid === 0
              ? links.orders({ method: 'PLATFORM' })
              : links.orders({ paid: 'UNPAID' })
          }
        />
        <LedgerRow
          label="Money out"
          note={`${cedis(day.left)} left after it`}
          amount={day.moneyOut}
          to={links.expenses}
        />
        <LedgerRow
          label={isToday ? 'Profit today' : 'Profit'}
          note={day.commissionEstimate > 0 ? 'After expenses and commission' : 'After expenses'}
          amount={day.profit}
          to={links.reports}
          loss={day.profit < 0}
        />
      </ul>
    </section>
  );
}

/** A big cedi figure, the sign smaller than the number. */
function BigMoney({ amount }: { amount: number }) {
  const text = cedis(amount);
  const negative = text.startsWith('-');
  const number = text.replace('-', '').replace('GH₵', '');
  return (
    <p className="flex items-baseline gap-1.5 font-heading tabular-nums">
      <span className="text-2xl text-muted-foreground">{negative ? '-GH₵' : 'GH₵'}</span>
      <span className="text-4xl leading-none font-medium tracking-[-0.03em] md:text-5xl">
        {number}
      </span>
    </p>
  );
}

function LedgerRow({
  label,
  note,
  amount,
  to,
  loss,
}: {
  label: string;
  note: string;
  amount: number;
  /** Where the rows behind the figure are. */
  to: string;
  loss?: boolean;
}) {
  return (
    <li className="flex flex-1">
      <Link
        to={to}
        className="flex flex-1 items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-muted/60"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-sm">{label}</span>
          <span className="truncate text-xs text-muted-foreground">{note}</span>
        </span>
        <span className={cn('font-mono text-lg', loss && 'text-danger')}>{cedis(amount)}</span>
      </Link>
    </li>
  );
}

function MoneySkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading the day’s figures"
      className="grid overflow-hidden rounded-(--radius-surface) border bg-card md:grid-cols-[3fr_2fr]"
    >
      <div className="flex flex-col gap-4 p-6 md:p-8">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-2 w-full" />
      </div>
      <div className="flex flex-col divide-y border-t md:border-t-0 md:border-l">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center justify-between px-6 py-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function OrdersByHour({ day, isToday }: { day: DaySummary; isToday: boolean }) {
  const busiest = busiestHour(day.byHour);
  return (
    <Panel
      title="Orders by hour"
      description={
        busiest
          ? `Busiest ${hourRange(busiest.hour)}, with ${busiest.orders === 1 ? '1 order' : `${busiest.orders} orders`}`
          : undefined
      }
    >
      {busiest ? (
        <div className="px-3 pb-4">
          <Suspense fallback={<div className="h-[160px]" />}>
            <OrdersByHourChart byHour={day.byHour} />
          </Suspense>
        </div>
      ) : (
        <p className="px-5 pb-6 text-sm text-muted-foreground">
          {isToday ? 'No orders yet today.' : 'No orders on this day.'}
        </p>
      )}
    </Panel>
  );
}

/** Dine-in (where the owner offers it, or on a day that had some), pickup and delivery. */
function ByType({ day, offersDineIn }: { day: DaySummary; offersDineIn: boolean }) {
  const links = dayLinks(day.date);
  const types = ORDER_TYPES.filter(
    (type) =>
      type !== 'DINE_IN' || offersDineIn || day.byType.some((row) => row.type === 'DINE_IN'),
  );
  return (
    <Panel title="By order type">
      <PanelRows>
        {types.map((type) => {
          const row = day.byType.find((r) => r.type === type);
          const orders = row?.orders ?? 0;
          return (
            <li key={type}>
              <Link
                to={links.orders({ type })}
                className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/60"
              >
                <span className="flex flex-col">
                  <span className="text-sm">{TYPE_WORDS[type]}</span>
                  <span className="text-xs text-muted-foreground">
                    {orders === 1 ? '1 order' : `${orders} orders`}
                  </span>
                </span>
                <span className="font-mono">{cedis(row?.sales ?? 0)}</span>
              </Link>
            </li>
          );
        })}
      </PanelRows>
    </Panel>
  );
}

/** The tablets' open drawers. Payouts are recorded here: the tablet can't record them. */
function OpenDrawers({ drawers }: { drawers: Drawer[] }) {
  const [paying, setPaying] = useState<Drawer | null>(null);
  return (
    <Panel
      title="Open drawers"
      description="Cash paid out of a drawer is recorded here. The tablet can’t record it."
    >
      <PanelRows>
        {drawers.map((drawer) => (
          <li key={drawer.shiftId} className="flex items-center gap-4 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{drawer.deviceName}</p>
              <p className="text-xs text-muted-foreground">
                Opened {clock(drawer.openedAt)}
                {drawer.openedBy ? ` by ${drawer.openedBy}` : ''}
                {drawer.expectedCash !== null
                  ? `, ${cedis(drawer.expectedCash)} expected in it`
                  : ''}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setPaying(drawer)}>
              Record payout
            </Button>
          </li>
        ))}
      </PanelRows>
      {paying && <PayoutDialog drawer={paying} onClose={() => setPaying(null)} />}
    </Panel>
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
    : { back: '/', label: 'Home' };
  let body: ReactNode;
  if (loading) {
    body = (
      <PanelRows>
        {[0, 1, 2].map((row) => (
          <li key={row} className="flex items-center justify-between gap-4 px-5 py-4">
            <span className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-48" />
            </span>
            <Skeleton className="h-4 w-16" />
          </li>
        ))}
      </PanelRows>
    );
  } else if (error) {
    body = (
      <div className="px-5 pb-5">
        <Alert tone="danger" title="Couldn’t load the orders">
          {error}
        </Alert>
      </div>
    );
  } else if (!orders || orders.length === 0) {
    body = (
      <EmptyState
        icon={<ReceiptText size={24} strokeWidth={1.75} />}
        title={date ? 'No orders on this day' : 'No orders yet today'}
        description="Orders from the tablet and your online store show here as they come in."
      />
    );
  } else {
    body = (
      <PanelRows>
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              to={`/orders/${order.id}`}
              state={back}
              className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/60"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-medium">{order.displayNumber}</span>
                  <span className="text-muted-foreground">{kindWords(order)}</span>
                </span>
                <span className="truncate text-sm text-text-secondary">
                  {orderLine(order.items)}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-sm">{cedis(order.total)}</span>
                <StatusBadge state={paymentState(order)} />
              </span>
              <ChevronRight
                size={16}
                strokeWidth={1.75}
                className="hidden shrink-0 text-muted-foreground sm:block"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </PanelRows>
    );
  }

  return (
    <Panel
      title={date ? 'Latest orders' : 'Recent orders'}
      action={
        <PanelLink to={date ? `/orders?date=${date}` : '/orders'}>
          {total !== undefined ? `All ${total}${date ? '' : ' today'}` : 'See all'}
        </PanelLink>
      }
    >
      {body}
    </Panel>
  );
}
