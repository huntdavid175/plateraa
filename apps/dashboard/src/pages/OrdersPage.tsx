import type { PaymentMethod } from '@plateraa/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router';
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
import { METHOD_WORDS, SOURCE_WORDS } from '../lib/words';
import { useMe } from '../shell/Shell';
import { Badge, Button, Card, ErrorNote, PillFilter, Spinner, Tag } from '../ui/controls';
import { Page } from '../ui/Page';

const SOURCE_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'POS', label: 'Walk-in' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'BOLT_FOOD', label: 'Bolt' },
  { value: 'CHOWDECK', label: 'Chowdeck' },
] as const;

const PAID_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'PAID', label: 'Paid' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'REFUND_OWED', label: 'Refund owed' },
] as const;

type SourceFilter = (typeof SOURCE_FILTERS)[number]['value'];
type PaidFilter = (typeof PAID_FILTERS)[number]['value'];

/** A busy day is a few hundred orders; a longer range shows its latest this many. */
const LIMIT = 500;

function oneOf<T extends string>(
  value: string | null,
  options: readonly { value: T }[],
  fallback: T,
): T {
  return options.find((option) => option.value === value)?.value ?? fallback;
}

/**
 * Orders for a day (`?date=`) or a range of days (`?from=&to=`), filtered by source, payment
 * state, method (`?method=CASH,LINK`), item (`?item=`) or who took them (`?staff=`). Everything
 * lives in the address, so the figures on Today and Reports link straight to the orders behind
 * them, and a filtered list can be shared. The server does the filtering.
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
  const source = oneOf(params.get('source'), SOURCE_FILTERS, 'ALL');
  const paid = oneOf(params.get('paid'), PAID_FILTERS, 'ALL');
  const method = params.get('method');
  const item = params.get('item');
  const staff = params.get('staff');

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
    ...(source !== 'ALL' ? { source } : {}),
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
  const filtered = source !== 'ALL' || paid !== 'ALL' || method || item || staff;

  const chips = [
    method && {
      key: 'method',
      label: `Paid by ${method
        .split(',')
        .map((m) => METHOD_WORDS[m as PaymentMethod] ?? m)
        .join(' or ')}`,
    },
    item && { key: 'item', label: `With ${item}` },
    staff && { key: 'staff', label: `Taken by ${staffName ?? 'one person'}` },
  ].filter((chip): chip is { key: string; label: string } => Boolean(chip));

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
            small
            onClick={() => change({ from: null, to: null, date: range.to })}
          >
            One day
          </Button>
        ) : (
          <input
            type="date"
            aria-label="Day"
            value={date}
            max={here}
            onChange={(event) => {
              const value = event.target.value || here;
              change({ date: value === here ? null : value });
            }}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted outline-none focus:border-brand"
          />
        )
      }
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <PillFilter
          label="Where the order came from"
          options={SOURCE_FILTERS}
          value={source}
          onChange={(value: SourceFilter) => change({ source: value === 'ALL' ? null : value })}
        />
        <PillFilter
          label="Paid or not"
          options={PAID_FILTERS}
          value={paid}
          onChange={(value: PaidFilter) => change({ paid: value === 'ALL' ? null : value })}
        />
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => change({ [chip.key]: null })}
            aria-label={`${chip.label}: remove this filter`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand/30 bg-brand-subtle px-3 text-sm font-medium text-brand"
          >
            {chip.label}
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Orders" value={String(sales.length)} />
        {seesMoney && <Stat label="Sales" value={cedis(salesTotal)} />}
        {seesMoney && (
          <Stat
            label="Average"
            value={sales.length ? cedis(Math.round(salesTotal / sales.length)) : '—'}
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[1fr_1.5fr_1fr_1fr_1fr] gap-4 border-b border-border px-5 py-3 text-xs font-semibold tracking-wide text-muted uppercase md:grid">
          <span>{range ? 'Day · Number' : 'Time · Number'}</span>
          <span>Items</span>
          <span>Source</span>
          <span>Paid</span>
          <span className="text-right">Amount</span>
        </div>
        {orders.isPending && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {orders.isError && (
          <div className="p-4">
            <ErrorNote>{orders.error.message}</ErrorNote>
          </div>
        )}
        {orders.data && rows.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {filtered
              ? 'No orders match this filter.'
              : range
                ? 'No orders on these days.'
                : 'No orders on this day.'}
          </p>
        )}
        {rows.map((order) => (
          <OrderRowLink key={order.id} order={order} back={back} showDay={Boolean(range)} />
        ))}
      </Card>
      {rows.length === LIMIT && (
        <p className="mt-3 text-center text-xs text-muted">
          Showing the latest {LIMIT} orders. Narrow the days or the filters to see the rest.
        </p>
      )}
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="mb-1 text-xs text-muted">{label}</p>
      <p className="font-mono text-xl font-semibold">{value}</p>
    </Card>
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
  const state = paymentState(order);
  const badge = <Badge tone={state.tone}>{state.label}</Badge>;
  const when = showDay
    ? `${shortDate(order.businessDate)}, ${clock(order.takenAt)}`
    : clock(order.takenAt);
  return (
    <Link
      to={`/orders/${order.id}`}
      state={back}
      className="block border-b border-border transition-colors last:border-b-0 hover:bg-tile/40"
    >
      <div className="hidden grid-cols-[1fr_1.5fr_1fr_1fr_1fr] items-center gap-4 px-5 py-3.5 md:grid">
        <div>
          <p className="font-mono text-xs text-muted">{order.displayNumber}</p>
          <p className="mt-0.5 text-sm">{when}</p>
        </div>
        <p className="truncate text-sm">{orderLine(order.items)}</p>
        <div>
          <Tag>{SOURCE_WORDS[order.source]}</Tag>
        </div>
        <div>{badge}</div>
        <p className="text-right font-mono text-sm font-semibold">{cedis(order.total)}</p>
      </div>
      <div className="flex items-center gap-4 px-4 py-3.5 md:hidden">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <span className="font-mono text-xs text-muted">{order.displayNumber}</span>
            <Tag>{SOURCE_WORDS[order.source]}</Tag>
          </div>
          <p className="truncate text-sm">{orderLine(order.items)}</p>
          <p className="mt-0.5 text-xs text-muted">
            {when}
            {order.takenBy ? ` · ${order.takenBy}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-semibold">{cedis(order.total)}</p>
          <div className="mt-1">{badge}</div>
        </div>
      </div>
    </Link>
  );
}
