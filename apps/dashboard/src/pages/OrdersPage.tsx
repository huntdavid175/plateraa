import type { OrderSource, PaymentMethod } from '@plateraa/shared';
import { ORDER_SOURCES } from '@plateraa/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ReceiptText } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { FilterToolbar } from '@/components/arc/filter-toolbar/filter-toolbar';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { DayPicker } from '@/components/app/day-picker';
import { StatusBadge } from '@/components/app/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cedis, clock, longDate, shortDate, todayHere } from '../lib/money';
import {
  fetchOrders,
  orderLine,
  paymentState,
  type BackTo,
  type OrderRow,
  type OrdersQuery,
} from '../lib/orders';
import { useSession } from '../lib/session';
import { fetchTeam } from '../lib/team';
import { METHOD_WORDS, SOURCE_WORDS, kindWords } from '../lib/words';
import { useMe } from '../shell/Shell';
import { Page } from '../ui/Page';

const TYPE_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'DINE_IN', label: 'Dine-in' },
  { value: 'PICKUP', label: 'Pickup' },
  { value: 'DELIVERY', label: 'Delivery' },
] as const;

const PAID_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'PAID', label: 'Paid' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'REFUND_OWED', label: 'Refund owed' },
] as const;

/** A busy day is a few hundred orders; a longer range shows its latest this many. */
const LIMIT = 500;

/** Wide screens: when, items, kind, paid, amount. */
const COLUMNS = 'md:grid md:grid-cols-[7rem_minmax(0,1fr)_9rem_7rem_7rem_1rem] md:items-center';

function oneOf<T extends string>(
  value: string | null,
  options: readonly { value: T }[],
  fallback: T,
): T {
  return options.find((option) => option.value === value)?.value ?? fallback;
}

/**
 * Orders for a day (`?date=`) or a range of days (`?from=&to=`), filtered by dine-in, pickup or
 * delivery, payment state, method (`?method=CASH,LINK`), item (`?item=`), who took them
 * (`?staff=`) or where they came from (`?source=`). Everything lives in the address, so the
 * figures on Home and Reports link straight to the orders behind them, and a filtered list can be
 * shared. The server does the filtering.
 */
export function OrdersPage() {
  const me = useMe();
  const { tenantId } = useSession();
  const { search } = useLocation();
  const [params, setParams] = useSearchParams();
  const seesMoney = me.capabilities.includes('reports.revenue.view');
  const here = todayHere();

  const from = params.get('from');
  const to = params.get('to');
  const range = from && to ? { from, to } : null;
  const date = params.get('date') ?? here;
  const type = oneOf(params.get('type'), TYPE_FILTERS, 'ALL');
  const paid = oneOf(params.get('paid'), PAID_FILTERS, 'ALL');
  const method = params.get('method');
  const item = params.get('item');
  const staff = params.get('staff');
  const sourceParam = params.get('source');
  const source = ORDER_SOURCES.find((value) => value === sourceParam) as OrderSource | undefined;
  // Dine-in shows where the owner offers it, or when a link asks for it.
  const typeFilters = TYPE_FILTERS.filter(
    (option) => option.value !== 'DINE_IN' || me.offersDineIn || type === 'DINE_IN',
  );

  const change = (patch: Record<string, string | null>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  const query: OrdersQuery = {
    ...(range ?? { date }),
    ...(type !== 'ALL' ? { type } : {}),
    ...(source ? { source } : {}),
    ...(paid !== 'ALL' ? { paid } : {}),
    ...(method ? { method } : {}),
    ...(item ? { item } : {}),
    ...(staff ? { staffId: staff } : {}),
    limit: LIMIT,
  };
  const orders = useQuery({
    queryKey: ['orders', tenantId, query],
    queryFn: () => fetchOrders(query),
  });
  const team = useQuery({
    queryKey: ['team', tenantId],
    queryFn: fetchTeam,
    enabled: Boolean(staff),
  });
  const staffName = team.data?.staff.find((person) => person.id === staff)?.displayName;

  const rows = orders.data ?? [];
  const sales = rows.filter((order) => order.status !== 'CANCELLED' && order.status !== 'REFUNDED');
  const salesTotal = sales.reduce((sum, order) => sum + order.amountDue, 0);
  const back: BackTo = { back: `/orders${search}`, label: 'Orders' };
  const filtered = type !== 'ALL' || source || paid !== 'ALL' || method || item || staff;

  // Filters that arrive from a figure elsewhere (Home, Reports), each one removable.
  const chips = [
    source && { id: 'source', label: 'From', value: SOURCE_WORDS[source] },
    method && {
      id: 'method',
      label: 'Paid by',
      value: method
        .split(',')
        .map((m) => METHOD_WORDS[m as PaymentMethod] ?? m)
        .join(' or '),
    },
    item && { id: 'item', label: 'With', value: item },
    staff && { id: 'staff', label: 'Taken by', value: staffName ?? 'one person' },
  ].filter((chip): chip is { id: string; label: string; value: string } => Boolean(chip));

  return (
    <Page
      title="Orders"
      subtitle={
        range
          ? range.from === range.to
            ? longDate(range.from)
            : `${longDate(range.from)} to ${longDate(range.to)}`
          : longDate(date)
      }
      actions={
        range ? (
          <Button
            variant="secondary"
            onClick={() => change({ from: null, to: null, date: range.to })}
          >
            One day
          </Button>
        ) : (
          <DayPicker
            date={date}
            today={here}
            onPick={(day) => change({ date: day && day < here ? day : null })}
          />
        )
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <SegmentedControl
              label="Dine-in, pickup or delivery"
              options={[...typeFilters]}
              value={type}
              onValueChange={(value) => change({ type: value === 'ALL' ? null : value })}
            />
            <SegmentedControl
              label="Paid or not"
              options={[...PAID_FILTERS]}
              value={paid}
              onValueChange={(value) => change({ paid: value === 'ALL' ? null : value })}
            />
          </div>
          {chips.length > 0 && (
            <FilterToolbar
              filters={chips}
              onRemove={(id) => change({ [id]: null })}
              onClearAll={() => change(Object.fromEntries(chips.map((chip) => [chip.id, null])))}
            />
          )}
        </div>

        <ul className="grid divide-y overflow-hidden rounded-(--radius-surface) border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat label="Orders" value={orders.data ? String(sales.length) : null} />
          {seesMoney && <Stat label="Sales" value={orders.data ? cedis(salesTotal) : null} />}
          {seesMoney && (
            <Stat
              label="Average"
              value={
                orders.data
                  ? sales.length
                    ? cedis(Math.round(salesTotal / sales.length))
                    : 'None yet'
                  : null
              }
            />
          )}
        </ul>

        <section
          aria-label="Orders"
          className="overflow-hidden rounded-(--radius-surface) border bg-card"
        >
          <div
            className={`hidden gap-4 border-b px-5 py-3 text-xs text-muted-foreground ${COLUMNS}`}
            aria-hidden
          >
            <span>{range ? 'Day and number' : 'Time and number'}</span>
            <span>Items</span>
            <span>Type</span>
            <span>Paid</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {orders.isPending && (
            <ul className="flex flex-col divide-y" aria-busy="true">
              {[0, 1, 2, 3, 4].map((row) => (
                <li key={row} className="flex items-center justify-between gap-4 px-5 py-4">
                  <span className="flex flex-col gap-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-56" />
                  </span>
                  <Skeleton className="h-4 w-16" />
                </li>
              ))}
            </ul>
          )}
          {orders.isError && (
            <div className="p-5">
              <Alert tone="danger" title="Couldn’t load the orders">
                <div className="flex flex-col items-start gap-3">
                  <p>{orders.error.message}</p>
                  <Button variant="secondary" size="sm" onClick={() => orders.refetch()}>
                    Try again
                  </Button>
                </div>
              </Alert>
            </div>
          )}
          {orders.data && rows.length === 0 && (
            <EmptyState
              icon={<ReceiptText size={24} strokeWidth={1.75} />}
              title={filtered ? 'No orders match' : 'No orders'}
              description={
                filtered
                  ? 'Try another filter, or clear them to see every order.'
                  : range
                    ? 'Nothing was ordered on these days.'
                    : 'Nothing was ordered on this day.'
              }
            />
          )}
          {rows.length > 0 && (
            <ul className="flex flex-col divide-y">
              {rows.map((order) => (
                <OrderRowLink key={order.id} order={order} back={back} showDay={Boolean(range)} />
              ))}
            </ul>
          )}
        </section>
        {rows.length === LIMIT && (
          <p className="text-sm text-muted-foreground">
            Showing the latest {LIMIT} orders. Narrow the days or the filters to see the rest.
          </p>
        )}
      </div>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <li className="flex items-center justify-between gap-1 px-5 py-3 sm:flex-col sm:items-start sm:py-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value === null ? (
        <Skeleton className="h-6 w-20" />
      ) : (
        <span className="font-mono text-lg sm:text-xl">{value}</span>
      )}
    </li>
  );
}

function OrderRowLink({
  order,
  back,
  showDay,
}: {
  order: OrderRow;
  back: BackTo;
  /** A range of days: say which day each order was on. */
  showDay: boolean;
}) {
  const when = showDay
    ? `${shortDate(order.businessDate)}, ${clock(order.takenAt)}`
    : clock(order.takenAt);
  return (
    <li>
      <Link
        to={`/orders/${order.id}`}
        state={back}
        className={`flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/60 md:gap-4 ${COLUMNS}`}
      >
        {/* Phones: number, kind and items on the left, amount and badge on the right. */}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:contents">
          <span className="flex items-center gap-2 text-sm md:flex-col md:items-start md:gap-0">
            <span className="font-mono font-medium">{order.displayNumber}</span>
            <span className="text-muted-foreground md:text-foreground">{when}</span>
          </span>
          <span className="truncate text-sm text-text-secondary md:text-foreground">
            {orderLine(order.items)}
          </span>
          <span className="text-xs text-muted-foreground md:text-sm md:text-foreground">
            {kindWords(order)}
            {order.takenBy && <span className="md:hidden">, taken by {order.takenBy}</span>}
          </span>
        </span>
        <span className="hidden md:block">
          <StatusBadge state={paymentState(order)} />
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 md:block md:text-right">
          <span className="font-mono text-sm">{cedis(order.total)}</span>
          <span className="md:hidden">
            <StatusBadge state={paymentState(order)} />
          </span>
        </span>
        <ChevronRight
          size={16}
          strokeWidth={1.75}
          className="hidden shrink-0 text-muted-foreground md:block"
          aria-hidden
        />
      </Link>
    </li>
  );
}
