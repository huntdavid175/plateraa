import { DRAWER_TOLERANCE, drawerResult } from '@brixx/shared';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Clock, Coins, ReceiptText, Trophy, Users, Wallet } from 'lucide-react';
import { useLocation } from 'react-router';
import { ActivityHeatmap } from '@/components/arc/activity-heatmap/activity-heatmap';
import { Alert } from '@/components/arc/alert/alert';
import { Avatar } from '@/components/arc/avatar/avatar';
import { BarChart } from '@/components/arc/bar-chart/bar-chart';
import { DonutChart } from '@/components/arc/donut-chart/donut-chart';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { LineChart } from '@/components/arc/line-chart/line-chart';
import { Sparkline } from '@/components/arc/sparkline/sparkline';
import { Bento, Cedis, Tile, TileRows } from '@/components/app/bento';
import { DAY_MS, DayRangePicker, useDayRange, type Range } from '@/components/app/day-range';
import { Change } from '@/components/app/change';
import { PanelLine } from '@/components/app/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { lastMonth, shiftDays } from '../lib/expenses';
import { cedis, hourLabel, hourRange, longDate, shortDate, chartCedis } from '../lib/money';
import type { BackTo } from '../lib/orders';
import { busiestHour, fetchPeriod, type Period } from '../lib/reports';
import { useSession } from '../lib/session';
import { EXPENSE_WORDS, METHOD_WORDS, TYPE_WORDS } from '../lib/words';
import { Page } from '../ui/Page';
import { ReportDays } from './report-days';

/**
 * The days a report is held against, and how to say them after "on": the 7 days before the last
 * 7; the same days last month for this month so far; the month before for last month; and as
 * many days again before picked days.
 */
function beforeOf(
  range: Range,
  from: string,
  to: string,
): { from: string; to: string; words: string } {
  if (range === 'month') {
    const start = lastMonth(from);
    // The same days of last month, as far as it has them (the 31st of a 30-day month stops at the 30th).
    const sameDay = `${start.from.slice(0, 8)}${to.slice(8)}`;
    return {
      from: start.from,
      to: sameDay < start.to ? sameDay : start.to,
      words: 'the same days last month',
    };
  }
  if (range === 'last') return { ...lastMonth(from), words: 'the month before' };
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
  return {
    from: shiftDays(from, -days),
    to: shiftDays(from, -1),
    words: days === 1 ? 'the day before' : `the ${days} days before`,
  };
}

const orderWords = (orders: number) => (orders === 1 ? '1 order' : `${orders} orders`);

/**
 * Money over a range of days (plan.md §3.2). Only for people allowed to see sales. The range
 * lives in the address (`?range=`, and `from`/`to` for picked days), so a report can be shared.
 */
export function ReportsPage() {
  const { tenantId } = useSession();
  const { search } = useLocation();
  const days = useDayRange();
  const { range, from, to, problem } = days;

  const period = useQuery({
    queryKey: ['period', tenantId, from, to],
    queryFn: () => fetchPeriod(from, to),
    enabled: !problem,
  });
  // The period before, to say how this one compares (user request, 19 Nov).
  const before = beforeOf(range, from, to);
  const earlier = useQuery({
    queryKey: ['period', tenantId, before.from, before.to],
    queryFn: () => fetchPeriod(before.from, before.to),
    enabled: !problem,
  });

  return (
    <Page title="Reports" subtitle={`${longDate(from)} to ${longDate(to)}`}>
      <div className="flex flex-col gap-6">
        <DayRangePicker days={days} />
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
          <Report
            period={period.data}
            before={earlier.data ? { totals: earlier.data.totals, words: before.words } : null}
            back={{ back: `/reports${search}`, label: 'Reports' }}
          />
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

function Report({
  period,
  before,
  back,
}: {
  period: Period;
  /** The period before, once it's loaded. */
  before: { totals: Period['totals']; words: string } | null;
  back: BackTo;
}) {
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
        change={before && { before: before.totals.sales, words: before.words }}
      />
      <FigureTile
        title="Money in"
        amount={totals.moneyIn}
        note="Cash and mobile money"
        to={links.orders({ method: 'CASH,LINK' })}
        trend={days > 1 ? trends.moneyIn : null}
        change={before && { before: before.totals.moneyIn, words: before.words }}
      />
      <FigureTile
        title="Money out"
        amount={totals.moneyOut}
        note="Expenses and payouts"
        to={links.expenses()}
        trend={days > 1 ? trends.moneyOut : null}
        change={before && { before: before.totals.moneyOut, words: before.words, upIsGood: false }}
      />
      <FigureTile
        title="Profit"
        amount={totals.profit}
        note="After expenses"
        trend={days > 1 ? trends.left : null}
        change={before && { before: before.totals.profit, words: before.words }}
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
          <EmptyState
            icon={<Trophy size={24} strokeWidth={1.75} />}
            title="No sales on these days"
            description="Your best-selling items show here once orders come in."
          />
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
          <EmptyState
            icon={<Clock size={24} strokeWidth={1.75} />}
            title="No orders on these days"
            description="The busiest hours show here once orders come in."
          />
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
          <EmptyState
            icon={<Banknote size={24} strokeWidth={1.75} />}
            title="No payments on these days"
            description="Cash and mobile money show here once orders are paid."
          />
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
          <EmptyState
            icon={<Wallet size={24} strokeWidth={1.75} />}
            title="Nothing spent on these days"
            description="Money out shows here by kind once expenses are recorded."
          />
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
          <EmptyState
            icon={<ReceiptText size={24} strokeWidth={1.75} />}
            title="No orders on these days"
            description="Dine-in, pickup and delivery sales show here once orders come in."
          />
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
          <EmptyState
            icon={<Users size={24} strokeWidth={1.75} />}
            title="No orders on these days"
            description="Each person’s orders and sales show here once they take orders."
          />
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

      {/* A summary; every close, and who was on the drawers, are on the Cash page. */}
      <Tile
        title="Drawer closes"
        to={back.back.replace(/^\/reports/, '/cash')}
        toLabel="Open the drawer closes on the Cash page"
        className="col-span-2 lg:col-span-4"
      >
        {period.drawerCloses.length === 0 ? (
          <EmptyState
            icon={<Coins size={24} strokeWidth={1.75} />}
            title="No drawer closed on these days"
            description="Each close shows on the Cash page with the cash expected, counted and the difference."
          />
        ) : (
          <DrawerSummary
            closes={period.drawerCloses}
            to={back.back.replace(/^\/reports/, '/cash')}
          />
        )}
      </Tile>

      {/* Day by day, ten to a page; each day opens its orders. */}
      <ReportDays key={`${period.from}-${period.to}`} period={period} back={back} />
    </Bento>
  );
}

/** Short, over and exact over the report's days, each opening the Cash page for them. */
function DrawerSummary({ closes, to }: { closes: Period['drawerCloses']; to: string }) {
  let short = 0;
  let shortAmount = 0;
  let over = 0;
  let overAmount = 0;
  let exact = 0;
  for (const close of closes) {
    const result = drawerResult(close.variance ?? 0);
    if (result === 'SHORT') {
      short++;
      shortAmount -= close.variance ?? 0;
    } else if (result === 'OVER') {
      over++;
      overAmount += close.variance ?? 0;
    } else exact++;
  }
  const closeWords = (count: number) => (count === 1 ? '1 close' : `${count} closes`);
  return (
    <TileRows>
      <PanelLine
        label="Short"
        note={short ? closeWords(short) : 'Nothing missing'}
        value={cedis(shortAmount)}
        tone={short > 0 && 'text-danger'}
        to={to}
      />
      <PanelLine
        label="Over"
        note={over ? closeWords(over) : 'Nothing extra'}
        value={cedis(overAmount)}
        tone={over > 0 && 'text-warning'}
        to={to}
      />
      <PanelLine
        label="Exact"
        note={`Within ${cedis(DRAWER_TOLERANCE)} either way`}
        value={`${exact} of ${closes.length}`}
        to={to}
      />
    </TileRows>
  );
}

/** One of the four figures across the top, with its trend over the report's days. */
function FigureTile({
  title,
  amount,
  note,
  to,
  trend,
  change,
  tone,
}: {
  title: string;
  amount: number;
  note: string;
  to?: string;
  trend: { data: number[]; labels: string[] } | null;
  /** The same figure for the period before, once it's loaded. */
  change: { before: number; words: string; upIsGood?: boolean } | null;
  tone?: 'success' | 'danger';
}) {
  return (
    <Tile title={title} {...(to ? { to } : {})}>
      <Cedis amount={amount} />
      <span className="text-xs text-muted-foreground">{note}</span>
      {change && (
        <Change
          now={amount}
          before={change.before}
          against={change.words}
          {...(change.upIsGood === false ? { upIsGood: false } : {})}
        />
      )}
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
