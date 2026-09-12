import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { lastMonth, shiftDays } from '../lib/expenses';
import { cedis, clock, longDate, todayHere } from '../lib/money';
import { fetchPeriod, type Period } from '../lib/reports';
import { useSession } from '../lib/session';
import { EXPENSE_WORDS, METHOD_WORDS, SOURCE_WORDS } from '../lib/words';
import { Card, ErrorNote, PillFilter, Spinner, cx } from '../ui/controls';
import { Page } from '../ui/Page';

const RANGES = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'last', label: 'Last month' },
] as const;
type Range = (typeof RANGES)[number]['value'];

function rangeOf(range: Range): { from: string; to: string } {
  const today = todayHere();
  if (range === 'week') return { from: shiftDays(today, -6), to: today };
  if (range === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return lastMonth(today);
}

const shortDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));

/** Money over a range of days (plan.md §3.2). Only for people allowed to see sales. */
export function ReportsPage() {
  const { tenantId } = useSession();
  const [range, setRange] = useState<Range>('week');
  const { from, to } = rangeOf(range);
  const period = useQuery({
    queryKey: ['period', tenantId, from, to],
    queryFn: () => fetchPeriod(from, to),
  });

  return (
    <Page title="Reports" subtitle={`${longDate(from)} to ${longDate(to)}`}>
      <div className="mb-5">
        <PillFilter label="Which days" options={RANGES} value={range} onChange={setRange} />
      </div>
      {period.isPending && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {period.isError && <ErrorNote>{period.error.message}</ErrorNote>}
      {period.data && <Report period={period.data} />}
    </Page>
  );
}

function Report({ period }: { period: Period }) {
  const { totals } = period;
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Sales" value={cedis(totals.sales)} sub={`${totals.orders} orders`} accent />
        <Metric label="Money in" value={cedis(totals.moneyIn)} sub="Cash and payment links" />
        <Metric label="Money out" value={cedis(totals.moneyOut)} sub="Expenses and payouts" />
        <Metric label="Profit" value={cedis(totals.profit)} sub="After expenses" />
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <Box title="Profit and loss">
          <Line label="Money in" value={cedis(totals.moneyIn)} />
          {totals.platformOwed > 0 && (
            <Line
              label="Owed by Bolt and Chowdeck, after commission"
              value={`+${cedis(totals.platformOwed - totals.commissionEstimate)}`}
            />
          )}
          <Line label="Purchases" value={`−${cedis(totals.purchases)}`} />
          <Line label="Other expenses" value={`−${cedis(totals.otherExpenses)}`} />
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
            />
          ))}
        </Box>
      </div>

      <Box title="Day by day" className="mb-6">
        <div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-4 border-b border-border px-5 py-3 text-xs font-semibold tracking-wide text-muted uppercase md:grid">
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
            state={{ back: '/reports', label: 'Reports' }}
            className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-b border-border px-5 py-3 text-sm transition-colors last:border-b-0 hover:bg-tile/40 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]"
          >
            <span>{shortDate(day.date)}</span>
            <span className="text-right font-mono text-muted md:text-text">
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
        <Box title="Where orders came from">
          {period.bySource.length === 0 && <Empty>No orders.</Empty>}
          {period.bySource.map((row) => (
            <Line
              key={row.source}
              label={`${SOURCE_WORDS[row.source]} · ${row.orders}`}
              value={cedis(row.sales)}
            />
          ))}
        </Box>
        <Box title="How they paid">
          {period.byMethod.length === 0 && <Empty>No payments.</Empty>}
          {period.byMethod.map((row) => (
            <Line key={row.method} label={METHOD_WORDS[row.method]} value={cedis(row.amount)} />
          ))}
        </Box>
        <Box title="Expenses by kind">
          {period.byCategory.length === 0 && <Empty>No expenses.</Empty>}
          {period.byCategory.map((row) => (
            <Line
              key={row.category}
              label={EXPENSE_WORDS[row.category]}
              value={cedis(row.amount)}
            />
          ))}
        </Box>
        <Box title="Staff">
          {period.staff.length === 0 && <Empty>No orders.</Empty>}
          {period.staff.map((row) => (
            <Line
              key={row.name}
              label={`${row.name} · ${row.orders} orders`}
              value={`${cedis(row.sales)}`}
              sub={row.cash > 0 ? `${cedis(row.cash)} cash taken` : undefined}
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
              <p className="text-xs text-muted">
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
}: {
  label: string;
  value: string;
  sub: string;
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
      <p className={cx('font-mono text-lg font-semibold', accent && 'text-brand')}>{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
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

function Line({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm">{label}</p>
        {sub && <p className="text-xs text-muted">{sub}</p>}
      </div>
      <span className="shrink-0 font-mono text-sm">{value}</span>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-center text-sm text-muted">{children}</p>;
}
