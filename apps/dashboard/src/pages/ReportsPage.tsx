import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { DateField } from '@/components/app/day-picker';
import { Panel, PanelEmpty, PanelLine, PanelRows } from '@/components/app/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { lastMonth, shiftDays } from '../lib/expenses';
import { cedis, clock, hourRange, longDate, shortDate, todayHere } from '../lib/money';
import type { BackTo } from '../lib/orders';
import { busiestHour, fetchPeriod, type Period } from '../lib/reports';
import { useSession } from '../lib/session';
import { EXPENSE_WORDS, METHOD_WORDS, TYPE_WORDS } from '../lib/words';
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

const orderWords = (orders: number) => (orders === 1 ? '1 order' : `${orders} orders`);

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

  return (
    <Page title="Reports" subtitle={`${longDate(from)} to ${longDate(to)}`}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end gap-3">
          <SegmentedControl
            label="Which days"
            options={[...RANGES]}
            value={range}
            onValueChange={(value) => choose(value as Range)}
          />
          {range === 'pick' && (
            <>
              <DateField
                label="From"
                date={from}
                max={today}
                onPick={(day) => pickDay('from', day)}
              />
              <DateField label="To" date={to} max={today} onPick={(day) => pickDay('to', day)} />
            </>
          )}
        </div>
        {problem && (
          <Alert tone="warning" title="Those days don’t work">
            {problem}
          </Alert>
        )}
        {!problem && period.isPending && (
          <div className="flex flex-col gap-6" aria-busy="true">
            <Skeleton className="h-28 w-full rounded-(--radius-surface)" />
            <div className="grid gap-6 md:grid-cols-2">
              <Skeleton className="h-56 w-full rounded-(--radius-surface)" />
              <Skeleton className="h-56 w-full rounded-(--radius-surface)" />
            </div>
          </div>
        )}
        {period.isError && (
          <Alert tone="danger" title="Couldn’t load the report">
            {period.error.message}
          </Alert>
        )}
        {!problem && period.data && (
          <Report period={period.data} back={{ back: `/reports${search}`, label: 'Reports' }} />
        )}
      </div>
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
      <ul className="grid grid-cols-2 divide-x divide-y overflow-hidden rounded-(--radius-surface) border bg-card md:grid-cols-4 md:divide-y-0">
        <Figure
          label="Sales"
          value={cedis(totals.sales)}
          note={orderWords(totals.orders)}
          to={links.orders()}
        />
        <Figure
          label="Money in"
          value={cedis(totals.moneyIn)}
          note="Cash and mobile money"
          to={links.orders({ method: 'CASH,LINK' })}
        />
        <Figure
          label="Money out"
          value={cedis(totals.moneyOut)}
          note="Expenses and payouts"
          to={links.expenses()}
        />
        <Figure
          label="Profit"
          value={cedis(totals.profit)}
          note="After expenses"
          loss={totals.profit < 0}
        />
      </ul>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Profit and loss">
          <PanelRows>
            <PanelLine
              label="Money in"
              value={cedis(totals.moneyIn)}
              to={links.orders({ method: 'CASH,LINK' })}
            />
            {totals.platformOwed > 0 && (
              <PanelLine
                label="Owed by Bolt and Chowdeck, after commission"
                value={`+${cedis(totals.platformOwed - totals.commissionEstimate)}`}
                to={links.orders({ method: 'PLATFORM' })}
              />
            )}
            <PanelLine
              label="Purchases"
              value={`-${cedis(totals.purchases)}`}
              to={links.expenses({ kind: 'purchase' })}
            />
            <PanelLine
              label="Other expenses"
              value={`-${cedis(totals.otherExpenses)}`}
              to={links.expenses({ kind: 'other' })}
            />
            <PanelLine
              strong
              label="Profit"
              value={cedis(totals.profit)}
              tone={totals.profit < 0 && 'text-danger'}
            />
          </PanelRows>
        </Panel>

        <Panel title="Best sellers">
          {period.byItem.length === 0 ? (
            <PanelEmpty>No sales on these days.</PanelEmpty>
          ) : (
            <PanelRows>
              {period.byItem.slice(0, 8).map((item) => (
                <PanelLine
                  key={item.name}
                  label={item.name}
                  note={`${item.quantity} sold`}
                  value={cedis(item.sales)}
                  to={links.orders({ item: item.name })}
                />
              ))}
            </PanelRows>
          )}
        </Panel>
      </div>

      <Panel
        title="Busy hours"
        description={
          busiest
            ? `Busiest ${hourRange(busiest.hour)}, with ${orderWords(busiest.orders)} over these days.`
            : undefined
        }
      >
        {busiest ? (
          <div className="px-3 pb-4">
            <Suspense fallback={<div className="h-[160px]" />}>
              <OrdersByHourChart byHour={period.byHour} />
            </Suspense>
          </div>
        ) : (
          <PanelEmpty>No orders on these days.</PanelEmpty>
        )}
      </Panel>

      <Panel title="Day by day">
        <div
          className="hidden grid-cols-[minmax(0,1.5fr)_5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_1rem] gap-4 border-t px-5 py-3 text-xs text-muted-foreground md:grid"
          aria-hidden
        >
          <span>Day</span>
          <span className="text-right">Orders</span>
          <span className="text-right">Sales</span>
          <span className="text-right">Money in</span>
          <span className="text-right">Money out</span>
          <span />
        </div>
        <PanelRows>
          {[...period.byDay].reverse().map((day) => (
            <li key={day.date}>
              <Link
                to={`/orders?date=${day.date}`}
                state={back}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-5 py-3 text-sm transition-colors hover:bg-muted/60 md:grid-cols-[minmax(0,1.5fr)_5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_1rem]"
              >
                <span>{shortDate(day.date)}</span>
                <span className="text-right font-mono text-muted-foreground md:text-foreground">
                  <span className="font-sans md:hidden">{orderWords(day.orders)}, </span>
                  <span className="hidden md:inline">{day.orders}</span>
                  <span className="text-foreground md:hidden">{cedis(day.sales)}</span>
                </span>
                <span className="hidden text-right font-mono md:block">{cedis(day.sales)}</span>
                <span className="hidden text-right font-mono md:block">{cedis(day.moneyIn)}</span>
                <span className="hidden text-right font-mono md:block">{cedis(day.moneyOut)}</span>
                <ChevronRight
                  size={14}
                  strokeWidth={1.75}
                  className="hidden text-muted-foreground md:block"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </PanelRows>
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Dine-in, pickup and delivery">
          {period.byType.length === 0 ? (
            <PanelEmpty>No orders.</PanelEmpty>
          ) : (
            <PanelRows>
              {period.byType.map((row) => (
                <PanelLine
                  key={row.type}
                  label={TYPE_WORDS[row.type]}
                  note={orderWords(row.orders)}
                  value={cedis(row.sales)}
                  to={links.orders({ type: row.type })}
                />
              ))}
            </PanelRows>
          )}
        </Panel>
        <Panel title="How they paid">
          {period.byMethod.length === 0 ? (
            <PanelEmpty>No payments.</PanelEmpty>
          ) : (
            <PanelRows>
              {period.byMethod.map((row) => (
                <PanelLine
                  key={row.method}
                  label={METHOD_WORDS[row.method]}
                  value={cedis(row.amount)}
                  to={links.orders({ method: row.method })}
                />
              ))}
            </PanelRows>
          )}
        </Panel>
        <Panel title="Expenses by kind">
          {period.byCategory.length === 0 ? (
            <PanelEmpty>No expenses.</PanelEmpty>
          ) : (
            <PanelRows>
              {period.byCategory.map((row) => (
                <PanelLine
                  key={row.category}
                  label={EXPENSE_WORDS[row.category]}
                  value={cedis(row.amount)}
                  to={links.expenses({ category: row.category })}
                />
              ))}
            </PanelRows>
          )}
        </Panel>
        <Panel title="Staff">
          {period.staff.length === 0 ? (
            <PanelEmpty>No orders.</PanelEmpty>
          ) : (
            <PanelRows>
              {period.staff.map((row) => (
                <PanelLine
                  key={row.staffId}
                  label={row.name}
                  note={
                    row.cash > 0
                      ? `${orderWords(row.orders)}, ${cedis(row.cash)} cash taken`
                      : orderWords(row.orders)
                  }
                  value={cedis(row.sales)}
                  to={links.orders({ staff: row.staffId })}
                />
              ))}
            </PanelRows>
          )}
        </Panel>
      </div>

      <Panel
        title="Drawer closes"
        description="What each drawer should have held, and what was counted."
      >
        {period.drawerCloses.length === 0 ? (
          <PanelEmpty>No drawer was closed on these days.</PanelEmpty>
        ) : (
          <PanelRows>
            {period.drawerCloses.map((close) => (
              <PanelLine
                key={close.shiftId}
                label={close.tablet}
                note={[
                  `${shortDate(close.closedAt.slice(0, 10))} at ${clock(close.closedAt)}`,
                  close.closedBy,
                  close.expected !== null && close.counted !== null
                    ? `expected ${cedis(close.expected)}, counted ${cedis(close.counted)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
                value={
                  close.variance === null
                    ? 'Not counted'
                    : close.variance === 0
                      ? 'Exact'
                      : `${close.variance > 0 ? '+' : ''}${cedis(close.variance)}`
                }
                tone={
                  close.variance === null
                    ? 'text-muted-foreground'
                    : close.variance < 0
                      ? 'text-danger'
                      : close.variance > 0
                        ? 'text-warning'
                        : 'text-success'
                }
              />
            ))}
          </PanelRows>
        )}
      </Panel>
    </>
  );
}

/** One of the four figures across the top; it opens the rows behind it. */
function Figure({
  label,
  value,
  note,
  to,
  loss,
}: {
  label: string;
  value: string;
  note: string;
  to?: string;
  loss?: boolean;
}) {
  const body = (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-heading text-2xl tracking-[-0.02em] tabular-nums',
          loss && 'text-danger',
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </>
  );
  const cell = 'flex flex-col gap-1 p-5';
  return (
    <li className="flex">
      {to ? (
        <Link to={to} className={cn(cell, 'flex-1 transition-colors hover:bg-muted/60')}>
          {body}
        </Link>
      ) : (
        <div className={cn(cell, 'flex-1')}>{body}</div>
      )}
    </li>
  );
}
