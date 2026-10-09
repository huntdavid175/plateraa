import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router';
import { ActivityHeatmap } from '@/components/arc/activity-heatmap/activity-heatmap';
import { Alert } from '@/components/arc/alert/alert';
import { Avatar } from '@/components/arc/avatar/avatar';
import { BarChart } from '@/components/arc/bar-chart/bar-chart';
import { DonutChart } from '@/components/arc/donut-chart/donut-chart';
import { LineChart } from '@/components/arc/line-chart/line-chart';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Sparkline } from '@/components/arc/sparkline/sparkline';
import { DateField } from '@/components/app/day-picker';
import { Bento, Cedis, Tile, TileRows } from '@/components/app/bento';
import { PanelLine } from '@/components/app/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { lastMonth, shiftDays } from '../lib/expenses';
import {
  cedis,
  clock,
  hourLabel,
  hourRange,
  longDate,
  shortDate,
  todayHere,
  chartCedis,
} from '../lib/money';
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

/** "GH₵1.2K" on a chart's value axis (the values are pesewas). */
const compactCedis = (pesewas: number) =>
  `GH₵${new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(pesewas / 100)}`;

/** One value per day of the report, oldest first, with the day names for scrubbing. */
function series(period: Period, pick: (day: Period['byDay'][number]) => number) {
  return {
    data: period.byDay.map(pick),
    labels: period.byDay.map((day) => shortDate(day.date)),
  };
}

function Report({ period, back }: { period: Period; back: BackTo }) {
  const { totals } = period;
  const links = linksFor(period);
  const busiest = busiestHour(period.byHour);
  const days = period.byDay.length;
  const trends = {
    sales: series(period, (d) => d.sales),
    moneyIn: series(period, (d) => d.moneyIn),
    moneyOut: series(period, (d) => d.moneyOut),
    left: series(period, (d) => d.moneyIn - d.moneyOut),
  };
  const hourBars = (() => {
    const counts = new Map(
      period.byHour.filter((r) => r.orders > 0).map((r) => [r.hour, r.orders]),
    );
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
  })();

  return (
    <Bento>
      <FigureTile
        title="Sales"
        amount={totals.sales}
        note={orderWords(totals.orders)}
        to={links.orders()}
        trend={days > 1 ? trends.sales : null}
      />
      <FigureTile
        title="Money in"
        amount={totals.moneyIn}
        note="Cash and mobile money"
        to={links.orders({ method: 'CASH,LINK' })}
        trend={days > 1 ? trends.moneyIn : null}
      />
      <FigureTile
        title="Money out"
        amount={totals.moneyOut}
        note="Expenses and payouts"
        to={links.expenses()}
        trend={days > 1 ? trends.moneyOut : null}
      />
      <FigureTile
        title="Profit"
        amount={totals.profit}
        note="After expenses"
        trend={days > 1 ? trends.left : null}
        tone={totals.profit < 0 ? 'danger' : 'success'}
      />

      {days > 1 && (
        <Tile title="Day by day" className="col-span-2 lg:col-span-4">
          <LineChart
            label="Sales and money out, day by day"
            height={240}
            formatValue={(value) => cedis(value)}
            formatTick={compactCedis}
            categoryLabel="Day"
            series={[
              { key: 'sales', label: 'Sales' },
              { key: 'out', label: 'Money out', dashed: true },
            ]}
            data={period.byDay.map((day) => ({
              key: day.date,
              label: longDate(day.date),
              axisLabel: shortDate(day.date),
              values: { sales: day.sales, out: day.moneyOut },
            }))}
          />
        </Tile>
      )}

      <Tile title="Profit and loss" className="col-span-2">
        <TileRows>
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
        </TileRows>
      </Tile>

      <Tile title="Best sellers" className="col-span-2">
        {period.byItem.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales on these days.</p>
        ) : (
          <TileRows>
            {period.byItem.slice(0, 6).map((item, index) => (
              <PanelLine
                key={item.name}
                label={
                  <span className="flex items-center gap-3">
                    <span className="w-4 text-xs text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    {item.name}
                  </span>
                }
                note={`${item.quantity} sold`}
                value={cedis(item.sales)}
                to={links.orders({ item: item.name })}
              />
            ))}
          </TileRows>
        )}
      </Tile>

      <Tile
        title={busiest ? `Busiest ${hourRange(busiest.hour)}` : 'Busy hours'}
        className={days >= 28 ? 'col-span-2' : 'col-span-2 lg:col-span-4'}
      >
        {hourBars.length > 0 ? (
          <BarChart
            data={hourBars}
            label="Orders"
            period="Over these days, by hour"
            unit="orders"
            averageLabel="An hour, on average"
            valueLabel="Orders"
            categoryLabel="Hour"
            height={170}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No orders on these days.</p>
        )}
      </Tile>

      {/* A grid of days says something over weeks, not over a few days. */}
      {days >= 28 && (
        <Tile title="Busy days" className="col-span-2">
          <ActivityHeatmap
            label="Orders each day"
            period="these days"
            unit={{ one: 'order', other: 'orders' }}
            weekStartsOn={1}
            locale="en-GB"
            days={period.byDay.map((day) => ({ date: day.date, count: day.orders }))}
          />
        </Tile>
      )}

      <Tile title="How they paid" className="col-span-2">
        {period.byMethod.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments.</p>
        ) : (
          <DonutChart
            label="Money in by how it was paid"
            size={200}
            thickness={18}
            formatValue={chartCedis}
            totalLabel="Paid"
            data={period.byMethod.map((row) => ({
              key: row.method,
              label: METHOD_WORDS[row.method],
              value: row.amount,
            }))}
          />
        )}
      </Tile>

      <Tile title="Expenses by kind" to={links.expenses()} className="col-span-2">
        {period.byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses.</p>
        ) : (
          <DonutChart
            label="Money out by kind"
            size={200}
            thickness={18}
            formatValue={chartCedis}
            totalLabel="Spent"
            data={period.byCategory.map((row) => ({
              key: row.category,
              label: EXPENSE_WORDS[row.category],
              value: row.amount,
            }))}
          />
        )}
      </Tile>

      <Tile title="Dine-in, pickup and delivery" to={links.orders()} className="col-span-2">
        {period.byType.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders.</p>
        ) : (
          <DonutChart
            label="Sales by order type"
            size={200}
            thickness={18}
            formatValue={chartCedis}
            totalLabel="Sales"
            data={period.byType.map((row) => ({
              key: row.type,
              label: TYPE_WORDS[row.type],
              value: row.sales,
            }))}
          />
        )}
      </Tile>

      <Tile title="Staff" className="col-span-2">
        {period.staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders.</p>
        ) : (
          <TileRows>
            {period.staff.map((row) => (
              <PanelLine
                key={row.staffId}
                label={
                  <span className="flex items-center gap-3">
                    <Avatar name={row.name} size="sm" />
                    {row.name}
                  </span>
                }
                note={
                  row.cash > 0
                    ? `${orderWords(row.orders)}, ${cedis(row.cash)} cash taken`
                    : orderWords(row.orders)
                }
                value={cedis(row.sales)}
                to={links.orders({ staff: row.staffId })}
              />
            ))}
          </TileRows>
        )}
      </Tile>

      <Tile title="Drawer closes" className="col-span-2 lg:col-span-4">
        {period.drawerCloses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No drawer was closed on these days.</p>
        ) : (
          <TileRows>
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
          </TileRows>
        )}
      </Tile>

      {/* Day-by-day rows, each opening that day's orders. */}
      <Tile title="Each day" className="col-span-2 lg:col-span-4">
        <TileRows>
          {[...period.byDay].reverse().map((day) => (
            <li key={day.date}>
              <Link
                to={`/orders?date=${day.date}`}
                state={back}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-5 py-3 text-sm transition-colors hover:bg-muted/60 md:grid-cols-[minmax(0,1.5fr)_5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <span>{shortDate(day.date)}</span>
                <span className="text-right font-mono text-muted-foreground md:text-foreground">
                  <span className="font-sans md:hidden">{orderWords(day.orders)}, </span>
                  <span className="hidden md:inline">{orderWords(day.orders)}</span>
                  <span className="text-foreground md:hidden">{cedis(day.sales)}</span>
                </span>
                <span className="hidden text-right font-mono md:block">{cedis(day.sales)}</span>
                <span className="hidden text-right font-mono md:block">
                  in {cedis(day.moneyIn)}
                </span>
                <span className="hidden text-right font-mono md:block">
                  out {cedis(day.moneyOut)}
                </span>
              </Link>
            </li>
          ))}
        </TileRows>
      </Tile>
    </Bento>
  );
}

/** One of the four figures across the top, with its trend over the report's days. */
function FigureTile({
  title,
  amount,
  note,
  to,
  trend,
  tone,
}: {
  title: string;
  amount: number;
  note: string;
  to?: string;
  trend: { data: number[]; labels: string[] } | null;
  tone?: 'success' | 'danger';
}) {
  return (
    <Tile title={title} {...(to ? { to } : {})}>
      <Cedis amount={amount} />
      <span className="text-xs text-muted-foreground">{note}</span>
      {trend && (
        <div className="mt-auto">
          <Sparkline
            label="Each day"
            data={trend.data}
            labels={trend.labels}
            formatValue={cedis}
            width={200}
            height={52}
            {...(tone ? { tone } : {})}
          />
        </div>
      )}
    </Tile>
  );
}
