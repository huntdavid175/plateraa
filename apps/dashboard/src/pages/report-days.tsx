import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/arc/button/button';
import { Switch } from '@/components/arc/switch/switch';
import { Tile } from '@/components/app/bento';
import { cn } from '@/lib/utils';
import { cedis, shortDate } from '../lib/money';
import type { BackTo } from '../lib/orders';
import type { Period } from '../lib/reports';

/** Days on a page of the table. */
const PAGE_SIZE = 10;

type Day = Period['byDay'][number];

/**
 * The report's days as a table, newest first, ten to a page (user request, 19 Nov: the old rows
 * were "too raw" and listed every day at once). A day with no orders is faded with dashes rather
 * than a row of GH₵0.00, and can be hidden; each day's sales carry a thin bar against the best
 * day, so the strong and weak days show at a glance. The totals row is the whole report, not the
 * page. Each day opens its orders.
 *
 * Remount it (a `key` of the report's days) when the days change, so it starts on page one.
 */
export function ReportDays({ period, back }: { period: Period; back: BackTo }) {
  const [hideQuiet, setHideQuiet] = useState(false);
  const [page, setPage] = useState(0);

  const newestFirst = [...period.byDay].reverse();
  const days = hideQuiet ? newestFirst.filter((day) => day.orders > 0) : newestFirst;
  const quiet = newestFirst.length - newestFirst.filter((day) => day.orders > 0).length;
  const pages = Math.max(1, Math.ceil(days.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = days.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const best = Math.max(0, ...period.byDay.map((day) => day.sales));
  const { totals } = period;
  const first = current * PAGE_SIZE + 1;
  const last = current * PAGE_SIZE + shown.length;

  const toggleQuiet = (hide: boolean) => {
    setHideQuiet(hide);
    setPage(0);
  };

  return (
    <Tile title="Each day" className="relative col-span-2 lg:col-span-4">
      {quiet > 0 && (
        <div className="-mt-1 flex items-center gap-3 sm:absolute sm:top-2 sm:right-5 sm:mt-0">
          <span id="hide-quiet-days" className="text-sm text-text-secondary">
            Hide days with no orders
          </span>
          <Switch
            aria-labelledby="hide-quiet-days"
            checked={hideQuiet}
            onCheckedChange={toggleQuiet}
          />
        </div>
      )}

      <div className="-mx-4 -mb-4 border-t sm:-mx-5 sm:-mb-5">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">
            Each day of the report, newest first: orders, sales, money in and money out
          </caption>
          <colgroup>
            <col />
            <col className="w-20 md:w-24" />
            <col className="w-36 md:w-48" />
            <col className="hidden md:table-column md:w-36" />
            <col className="hidden md:table-column md:w-36" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="py-2.5 pl-4 text-left font-normal sm:pl-5">
                Day
              </th>
              <Heading>Orders</Heading>
              <Heading>Sales</Heading>
              <Heading className="hidden md:table-cell">Money in</Heading>
              <Heading className="hidden md:table-cell">Money out</Heading>
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {shown.map((day) => (
              <DayRow key={day.date} day={day} best={best} back={back} />
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                  No day had orders.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/50 font-medium">
              <th scope="row" className="py-3 pl-4 text-left sm:pl-5">
                {newestFirst.length === 1 ? 'Total' : `All ${newestFirst.length} days`}
              </th>
              <Figure>{totals.orders.toLocaleString('en-GB')}</Figure>
              <Figure>{cedis(totals.sales)}</Figure>
              <Figure className="hidden md:table-cell">{cedis(totals.moneyIn)}</Figure>
              <Figure className="hidden md:table-cell">{cedis(totals.moneyOut)}</Figure>
              <td />
            </tr>
          </tfoot>
        </table>

        {pages > 1 && (
          <nav
            aria-label="Pages of days"
            className="flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5"
          >
            <span className="text-sm text-muted-foreground tabular-nums">
              {first}–{last} of {days.length} days
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
                aria-label="Newer days"
              >
                <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
                Newer
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(current + 1)}
                disabled={current === pages - 1}
                aria-label="Older days"
              >
                Older
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
              </Button>
            </div>
          </nav>
        )}
      </div>
    </Tile>
  );
}

function Heading({ children, className }: { children: string; className?: string }) {
  return (
    <th scope="col" className={cn('px-3 py-2.5 text-right font-normal', className)}>
      {children}
    </th>
  );
}

function Figure({ children, className }: { children: string; className?: string }) {
  return (
    <td className={cn('px-3 py-3 text-right font-mono tabular-nums', className)}>{children}</td>
  );
}

/** A dash, faded, where a quiet day would show zero. */
function Nothing() {
  return (
    <>
      <span className="text-muted-foreground/70" aria-hidden>
        —
      </span>
      <span className="sr-only">none</span>
    </>
  );
}

function DayRow({ day, best, back }: { day: Day; best: number; back: BackTo }) {
  const quiet = day.orders === 0;
  const share = best > 0 ? day.sales / best : 0;
  return (
    // The day's link stretches over the whole row, so anywhere on it opens the day's orders.
    <tr className="group relative border-b transition-colors last:border-b-0 hover:bg-muted/50">
      <th scope="row" className="py-3 pl-4 text-left font-normal sm:pl-5">
        <Link
          to={`/orders?date=${day.date}`}
          state={back}
          className={cn(
            'outline-none after:absolute after:inset-0 focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring',
            quiet && 'text-muted-foreground',
          )}
        >
          {shortDate(day.date)}
        </Link>
      </th>
      <td className="px-3 py-3 text-right font-mono tabular-nums">
        {quiet ? <Nothing /> : day.orders}
      </td>
      <td className="px-3 py-3 font-mono tabular-nums">
        {quiet ? (
          <span className="block text-right">
            <Nothing />
          </span>
        ) : (
          <span className="flex items-center justify-end gap-3">
            <span
              aria-hidden
              className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block"
            >
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.max(share * 100, 4)}%` }}
              />
            </span>
            {cedis(day.sales)}
          </span>
        )}
      </td>
      <td className="hidden px-3 py-3 text-right font-mono tabular-nums md:table-cell">
        {day.moneyIn > 0 ? cedis(day.moneyIn) : <Nothing />}
      </td>
      <td className="hidden px-3 py-3 text-right font-mono tabular-nums md:table-cell">
        {day.moneyOut > 0 ? cedis(day.moneyOut) : <Nothing />}
      </td>
      <td className="pr-4 text-right sm:pr-5">
        <ChevronRight
          size={14}
          strokeWidth={1.75}
          aria-hidden
          className="ml-auto text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        />
      </td>
    </tr>
  );
}
