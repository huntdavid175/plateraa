import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { lastMonth, shiftDays } from '../lib/expenses';
import { cedis, clock, hourRange, longDate, shortDate, todayHere } from '../lib/money';
import type { BackTo } from '../lib/orders';
import { busiestHour, fetchPeriod, type Period } from '../lib/reports';
import { useSession } from '../lib/session';
import { EXPENSE_WORDS, METHOD_WORDS, TYPE_WORDS } from '../lib/words';
import { Card, ErrorNote, PillFilter, Spinner, cx } from '../ui/controls';
import { Page } from '../ui/Page';

const RANGES = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: 'pick', label: 'Pick days' },
] as const;
type Range = (typeof RANGES)[number]['value'];

const OrdersByHourChart = lazy(() => import('./OrdersByHourChart'));

/** The most the API reports on at once. */
const MAX_DAYS = 92;
const DAY_MS = 86_400_000;

function rangeOf(range: Exclude<Range, 'pick'>, today: string): { from: string; to: string } {
  if (range === 'week') return { from: shiftDays(today, -6), to: today };
  if (range === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return lastMonth(today);
}

/** What's wrong with a picked range, in words, or null. */
function rangeProblem(from: string, to: string): string | null {
  if (from > to) return 'The first day comes after the last.';
  if ((Date.parse(to) - Date.parse(from)) / DAY_MS >= MAX_DAYS) {
    return `Pick ${MAX_DAYS} days or fewer.`;
  }
  return null;
}

/**
 * Money over a range of days (plan.md §3.2). Only for people allowed to see sales. The range
 * lives in the address (`?range=`, and `from`/`to` for picked days), so a report can be shared.
 */
export function ReportsPage() {
  const { tenantId } = useSession();
  const { search } = useLocation();
  const [params, setParams] = useSearchParams();
  const today = todayHere();
  const range = RANGES.find((r) => r.value === params.get('range'))?.value ?? 'week';
  const { from, to } =
    range === 'pick'
      ? { from: params.get('from') ?? shiftDays(today, -6), to: params.get('to') ?? today }
      : rangeOf(range, today);
  const problem = range === 'pick' ? rangeProblem(from, to) : null;

  const period = useQuery({
    queryKey: ['period', tenantId, from, to],
    queryFn: () => fetchPeriod(from, to),
    enabled: !problem,
  });

  const choose = (next: Range) =>
    setParams(
      next === 'week' ? {} : next === 'pick' ? { range: next, from, to } : { range: next },
      { replace: true },
    );
  const pickDay = (key: 'from' | 'to', value: string) => {
    if (value) setParams({ range: 'pick', from, to, [key]: value }, { replace: true });
  };
  const dateInput =
    'h-9 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted-foreground outline-none focus:border-brand';

  return (
    <Page title="Reports" subtitle={`${longDate(from)} to ${longDate(to)}`}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <PillFilter label="Which days" options={RANGES} value={range} onChange={choose} />
        {range === 'pick' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="First day"
              value={from}
              max={today}
              onChange={(event) => pickDay('from', event.target.value)}
              className={dateInput}
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="date"
              aria-label="Last day"
              value={to}
              max={today}
              onChange={(event) => pickDay('to', event.target.value)}
              className={dateInput}
            />
          </div>
        )}
      </div>
      {problem && <ErrorNote>{problem}</ErrorNote>}
      {!problem && period.isPending && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {period.isError && <ErrorNote>{period.error.message}</ErrorNote>}
      {!problem && period.data && (
        <Report period={period.data} back={{ back: `/reports${search}`, label: 'Reports' }} />
      )}
    </Page>
  );
}

/** The orders or expenses behind a figure, for the report's days. */
function linksFor(period: Period) {
  const days = { from: period.from, to: period.to };
  return {
    orders: (filters: Record<string, string> = {}) =>
      `/orders?${new URLSearchParams({ ...days, ...filters })}`,
    expenses: (filters: Record<string, string> = {}) =>
      `/expenses?${new URLSearchParams({ range: 'pick', ...days, ...filters })}`,
  };
}

function Report({ period, back }: { period: Period; back: BackTo }) {
  const { totals } = period;
  const links = linksFor(period);
  const busiest = busiestHour(period.byHour);
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric
          label="Sales"
          value={cedis(totals.sales)}
          sub={`${totals.orders} orders`}
          accent
          to={links.orders()}
        />
        <Metric
          label="Money in"
          value={cedis(totals.moneyIn)}
          sub="Cash and payment links"
          to={links.orders({ method: 'CASH,LINK' })}
        />
        <Metric
          label="Money out"
          value={cedis(totals.moneyOut)}
          sub="Expenses and payouts"
          to={links.expenses()}
        />
        <Metric label="Profit" value={cedis(totals.profit)} sub="After expenses" />
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <Box title="Profit and loss">
          <Line
            label="Money in"
            value={cedis(totals.moneyIn)}
            to={links.orders({ method: 'CASH,LINK' })}
          />
          {totals.platformOwed > 0 && (
            <Line
              label="Owed by Bolt and Chowdeck, after commission"
              value={`+${cedis(totals.platformOwed - totals.commissionEstimate)}`}
              to={links.orders({ method: 'PLATFORM' })}
            />
          )}
          <Line
            label="Purchases"
            value={`−${cedis(totals.purchases)}`}
            to={links.expenses({ kind: 'purchase' })}
          />
          <Line
            label="Other expenses"
            value={`−${cedis(totals.otherExpenses)}`}
            to={links.expenses({ kind: 'other' })}
          />
          <div className="flex items-center justify-between bg-tile px-5 py-3.5 text-sm font-semibold">
            <span>Profit</span>
            <span className={cx('font-mono', totals.profit < 0 && 'text-red')}>
              {cedis(totals.profit)}
            </span>
          </div>
        </Box>

        <Box title="Best sellers">
          {period.byItem.length === 0 && <Empty>No sales on these days.</Empty>}
          {period.byItem.slice(0, 8).map((item) => (
            <Line
              key={item.name}
              label={`${item.name} · ${item.quantity}`}
              value={cedis(item.sales)}
              to={links.orders({ item: item.name })}
            />
          ))}
        </Box>
      </div>

      <Box title="Busy hours" className="mb-6">
        {busiest ? (
          <div className="p-5">
            <p className="mb-4 text-sm text-muted-foreground">
              Busiest {hourRange(busiest.hour)}, with{' '}
              {busiest.orders === 1 ? '1 order' : `${busiest.orders} orders`} over these days.
            </p>
            <Suspense fallback={<div className="h-[150px]" />}>
              <OrdersByHourChart byHour={period.byHour} />
            </Suspense>
          </div>
        ) : (
          <Empty>No orders on these days.</Empty>
        )}
      </Box>

      <Box title="Day by day" className="mb-6">
        <div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-4 border-b border-border px-5 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:grid">
          <span>Day</span>
          <span className="text-right">Orders</span>
          <span className="text-right">Sales</span>
          <span className="text-right">Money in</span>
          <span className="text-right">Money out</span>
        </div>
        {[...period.byDay].reverse().map((day) => (
          <Link
            key={day.date}
            to={`/orders?date=${day.date}`}
            state={back}
            className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-b border-border px-5 py-3 text-sm transition-colors last:border-b-0 hover:bg-tile/40 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]"
          >
            <span>{shortDate(day.date)}</span>
            <span className="text-right font-mono text-muted-foreground md:text-text">
              <span className="md:hidden">{day.orders} orders · </span>
              <span className="hidden md:inline">{day.orders}</span>
              <span className="md:hidden">{cedis(day.sales)}</span>
            </span>
            <span className="hidden text-right font-mono md:block">{cedis(day.sales)}</span>
            <span className="hidden text-right font-mono md:block">{cedis(day.moneyIn)}</span>
            <span className="hidden text-right font-mono md:block">{cedis(day.moneyOut)}</span>
          </Link>
        ))}
      </Box>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <Box title="Dine-in, pickup and delivery">
          {period.byType.length === 0 && <Empty>No orders.</Empty>}
          {period.byType.map((row) => (
            <Line
              key={row.type}
              label={`${TYPE_WORDS[row.type]} · ${row.orders}`}
              value={cedis(row.sales)}
              to={links.orders({ type: row.type })}
            />
          ))}
        </Box>
        <Box title="How they paid">
          {period.byMethod.length === 0 && <Empty>No payments.</Empty>}
          {period.byMethod.map((row) => (
            <Line
              key={row.method}
              label={METHOD_WORDS[row.method]}
              value={cedis(row.amount)}
              to={links.orders({ method: row.method })}
            />
          ))}
        </Box>
        <Box title="Expenses by kind">
          {period.byCategory.length === 0 && <Empty>No expenses.</Empty>}
          {period.byCategory.map((row) => (
            <Line
              key={row.category}
              label={EXPENSE_WORDS[row.category]}
              value={cedis(row.amount)}
              to={links.expenses({ category: row.category })}
            />
          ))}
        </Box>
        <Box title="Staff">
          {period.staff.length === 0 && <Empty>No orders.</Empty>}
          {period.staff.map((row) => (
            <Line
              key={row.staffId}
              label={`${row.name} · ${row.orders} orders`}
              value={`${cedis(row.sales)}`}
              sub={row.cash > 0 ? `${cedis(row.cash)} cash taken` : undefined}
              to={links.orders({ staff: row.staffId })}
            />
          ))}
        </Box>
      </div>

      <Box title="Drawer closes">
        {period.drawerCloses.length === 0 && <Empty>No drawer was closed on these days.</Empty>}
        {period.drawerCloses.map((close) => (
          <div
            key={close.shiftId}
            className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="text-sm">{close.tablet}</p>
              <p className="text-xs text-muted-foreground">
                {shortDate(close.closedAt.slice(0, 10))} at {clock(close.closedAt)}
                {close.closedBy ? ` · ${close.closedBy}` : ''}
                {close.expected !== null && close.counted !== null
                  ? ` · expected ${cedis(close.expected)}, counted ${cedis(close.counted)}`
                  : ''}
              </p>
            </div>
            {close.variance !== null && (
              <span
                className={cx(
                  'shrink-0 font-mono text-sm font-semibold',
                  close.variance < 0
                    ? 'text-red'
                    : close.variance > 0
                      ? 'text-amber'
                      : 'text-green',
                )}
              >
                {close.variance === 0
                  ? 'Exact'
                  : `${close.variance > 0 ? '+' : ''}${cedis(close.variance)}`}
              </span>
            )}
          </div>
        ))}
      </Box>
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
  sub: string;
  accent?: boolean;
  /** Where the rows behind the figure are. */
  to?: string;
}) {
  const className = cx(
    'block rounded-xl border p-4',
    accent ? 'border-brand/25 bg-brand-subtle' : 'border-border bg-surface',
    to && 'transition-colors hover:border-brand/50',
  );
  const body = (
    <>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cx('font-mono text-lg font-semibold', accent && 'text-brand')}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Box({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function Line({
  label,
  value,
  sub,
  to,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Where the rows behind the figure are. */
  to?: string;
}) {
  const className =
    'flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-b-0';
  const body = (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <span className="shrink-0 font-mono text-sm">
        {value}
        {to && (
          <span aria-hidden="true" className="ml-2 text-muted-foreground">
            ›
          </span>
        )}
      </span>
    </>
  );
  return to ? (
    <Link to={to} className={cx(className, 'transition-colors hover:bg-tile/40')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
