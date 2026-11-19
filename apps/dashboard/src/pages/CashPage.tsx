import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Coins, Users } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Drawer, DrawerContent } from '@/components/arc/drawer/drawer';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { Switch } from '@/components/arc/switch/switch';
import { Tile } from '@/components/app/bento';
import { DayRangePicker, useDayRange } from '@/components/app/day-range';
import { Pager } from '@/components/app/pager';
import { PanelLine, PanelRows } from '@/components/app/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  RESULT_TONES,
  RESULT_WORDS,
  fetchCashClose,
  fetchCashCloses,
  type CashClose,
  type CashCloses,
} from '../lib/cash';
import { cedis, clock, longDate, shortDate } from '../lib/money';
import { useSession } from '../lib/session';
import { Page } from '../ui/Page';

/** Closes on a page of the table. */
const PAGE_SIZE = 10;

/** "−GH₵15.00", "+GH₵20.00": which way a drawer was out. */
const signed = (variance: number) =>
  variance === 0 ? cedis(0) : `${variance < 0 ? '−' : '+'}${cedis(Math.abs(variance))}`;

const closeWords = (count: number) => (count === 1 ? '1 close' : `${count} closes`);

/**
 * Cash over and short (user request, 19 Nov): every drawer close over some days, how it came out
 * against what the server expected, and who was on the drawers. GH₵1 or less either way counts
 * as exact (`DRAWER_TOLERANCE` in `@brixx/shared`). A close opens in a drawer (`?close=`) with how
 * its expected cash was worked out. Only for people who see sales.
 */
export function CashPage() {
  const { tenantId } = useSession();
  const [params, setParams] = useSearchParams();
  const days = useDayRange();
  const { from, to, problem } = days;

  const cash = useQuery({
    queryKey: ['cash', tenantId, from, to],
    queryFn: () => fetchCashCloses(from, to),
    enabled: !problem,
  });
  const openClose = params.get('close');
  const setClose = (shiftId: string | null) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (shiftId) next.set('close', shiftId);
        else next.delete('close');
        return next;
      },
      { replace: shiftId === null },
    );

  return (
    <Page
      title="Cash"
      subtitle={from === to ? longDate(from) : `${longDate(from)} to ${longDate(to)}`}
    >
      <div className="flex flex-col gap-6">
        <DayRangePicker days={days} />
        {problem && (
          <Alert tone="warning" title="Those days don’t work">
            {problem}
          </Alert>
        )}
        {!problem && cash.isPending && (
          <div className="flex flex-col gap-6" aria-busy="true">
            <Skeleton className="h-28 w-full rounded-(--radius-surface)" />
            <Skeleton className="h-72 w-full rounded-(--radius-surface)" />
          </div>
        )}
        {cash.isError && (
          <Alert tone="danger" title="Couldn’t load the drawers">
            <div className="flex flex-col items-start gap-3">
              <p>{cash.error.message}</p>
              <Button variant="secondary" size="sm" onClick={() => cash.refetch()}>
                Try again
              </Button>
            </div>
          </Alert>
        )}
        {!problem && cash.data && (
          <>
            <Figures cash={cash.data} />
            <Closes key={`${from}-${to}`} cash={cash.data} onOpen={setClose} />
            {cash.data.people.length > 0 && <People cash={cash.data} />}
          </>
        )}
      </div>

      <Drawer open={openClose !== null} onOpenChange={(open) => !open && setClose(null)}>
        {openClose && (
          <DrawerContent
            title="Drawer"
            description="How its expected cash was worked out, and what moved through it."
          >
            <CloseView shiftId={openClose} />
          </DrawerContent>
        )}
      </Drawer>
    </Page>
  );
}

/** Short, over, and how many closes, split by hairlines like the Orders page's figures. */
function Figures({ cash }: { cash: CashCloses }) {
  const { summary } = cash;
  return (
    <ul className="grid divide-y overflow-hidden rounded-(--radius-surface) border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Figure
        label="Short"
        value={cedis(summary.shortAmount)}
        tone={summary.shortAmount > 0 ? 'text-danger' : undefined}
        note={summary.short ? `Missing over ${closeWords(summary.short)}` : 'Nothing missing'}
      />
      <Figure
        label="Over"
        value={cedis(summary.overAmount)}
        tone={summary.overAmount > 0 ? 'text-warning' : undefined}
        note={
          summary.over
            ? `Extra over ${closeWords(summary.over)}: change not given, or a sale not entered`
            : 'Nothing extra'
        }
      />
      <Figure
        label="Closes"
        value={String(summary.closes)}
        note={
          summary.closes
            ? `${summary.exact} exact, within ${cedis(cash.tolerance)} either way`
            : 'No drawer closed'
        }
      />
    </ul>
  );
}

function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: string | undefined;
}) {
  return (
    <li className="flex flex-col gap-1.5 px-5 py-4">
      <span className="text-sm text-text-secondary">{label}</span>
      <span
        className={cn('font-heading text-2xl leading-none tracking-[-0.03em] tabular-nums', tone)}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </li>
  );
}

/** Every close, newest first, ten to a page; a switch keeps only those that didn't match. */
function Closes({ cash, onOpen }: { cash: CashCloses; onOpen: (shiftId: string) => void }) {
  const [onlyOut, setOnlyOut] = useState(false);
  const [page, setPage] = useState(0);
  const out = cash.closes.filter((close) => close.result !== 'EXACT');
  const closes = onlyOut ? out : cash.closes;
  const pages = Math.max(1, Math.ceil(closes.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = closes.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <Tile title="Drawer closes" className="relative">
      {cash.closes.length > 0 && out.length > 0 && out.length < cash.closes.length && (
        <div className="-mt-1 flex items-center gap-3 sm:absolute sm:top-2 sm:right-5 sm:mt-0">
          <span id="only-out" className="text-sm text-text-secondary">
            Only closes that didn’t match
          </span>
          <Switch
            aria-labelledby="only-out"
            checked={onlyOut}
            onCheckedChange={(checked) => {
              setOnlyOut(checked);
              setPage(0);
            }}
          />
        </div>
      )}
      {cash.closes.length === 0 ? (
        <EmptyState
          icon={<Coins size={24} strokeWidth={1.75} />}
          title="No drawer closed on these days"
          description="Each close shows here with the cash expected, the cash counted and the difference."
        />
      ) : (
        <div className="-mx-4 -mb-4 border-t sm:-mx-5 sm:-mb-5">
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">
              Drawer closes, newest first: when, the tablet, who opened and closed it, the cash
              expected and counted, and the difference
            </caption>
            <colgroup>
              <col className="w-32 md:w-40" />
              <col className="hidden md:table-column" />
              <col className="hidden md:table-column md:w-32" />
              <col className="hidden md:table-column md:w-32" />
              <col />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="py-2.5 pl-4 text-left font-normal sm:pl-5">
                  Closed
                </th>
                <th scope="col" className="hidden px-3 py-2.5 text-left font-normal md:table-cell">
                  Tablet and people
                </th>
                <Heading className="hidden md:table-cell">Expected</Heading>
                <Heading className="hidden md:table-cell">Counted</Heading>
                <Heading>Difference</Heading>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {shown.map((close) => (
                <CloseRow key={close.shiftId} close={close} onOpen={onOpen} />
              ))}
            </tbody>
          </table>
          <Pager
            page={current}
            pageSize={PAGE_SIZE}
            total={closes.length}
            noun="closes"
            onPage={setPage}
          />
        </div>
      )}
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

/** Who opened and closed a drawer: "Kofi", or "Kofi, closed by Esi". */
function peopleOf(close: CashClose) {
  const opener = close.openedBy ?? 'Someone';
  return close.closedBy && close.closedBy !== close.openedBy
    ? `${opener}, closed by ${close.closedBy}`
    : opener;
}

function CloseRow({ close, onOpen }: { close: CashClose; onOpen: (shiftId: string) => void }) {
  return (
    <tr className="group relative border-b transition-colors last:border-b-0 hover:bg-muted/50">
      <th scope="row" className="py-3 pl-4 text-left font-normal sm:pl-5">
        {/* The button stretches over the whole row, so anywhere on it opens the drawer. */}
        <button
          type="button"
          onClick={() => onOpen(close.shiftId)}
          className="flex flex-col text-left outline-none after:absolute after:inset-0 focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          <span>{shortDate(close.closedAt.slice(0, 10))}</span>
          <span className="text-xs text-muted-foreground">
            {clock(close.closedAt)}
            <span className="md:hidden">, {close.tablet}</span>
          </span>
        </button>
      </th>
      <td className="hidden px-3 py-3 md:table-cell">
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{close.tablet}</span>
          <span className="truncate text-xs text-muted-foreground">{peopleOf(close)}</span>
        </span>
      </td>
      <td className="hidden px-3 py-3 text-right font-mono tabular-nums md:table-cell">
        {cedis(close.expected)}
      </td>
      <td className="hidden px-3 py-3 text-right font-mono tabular-nums md:table-cell">
        {cedis(close.counted)}
      </td>
      <td className="px-3 py-3 text-right">
        <Difference close={close} />
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

/** "−GH₵15.00 short", "+GH₵20.00 over", or "Exact" (with the few pesewas, when there are some). */
function Difference({ close }: { close: Pick<CashClose, 'variance' | 'result'> }) {
  if (close.result === 'EXACT') {
    return (
      <span className="inline-flex flex-col items-end">
        <span className="text-success">Exact</span>
        {close.variance !== 0 && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {signed(close.variance)}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end">
      <span className={cn('font-mono tabular-nums', RESULT_TONES[close.result])}>
        {signed(close.variance)}
      </span>
      <span className="text-xs text-muted-foreground">
        {RESULT_WORDS[close.result].toLowerCase()}
      </span>
    </span>
  );
}

/**
 * Who was on the drawers. Several people share one, so it's who was there (opened or closed it,
 * took cash on it, moved cash in or out), never who took anything: a pattern to look into.
 */
function People({ cash }: { cash: CashCloses }) {
  return (
    <Tile title="People on the drawers">
      <p className="-mt-1 text-xs text-muted-foreground">
        Everyone who opened, closed, took cash on or moved cash in or out of a drawer. Several
        people share a drawer, so this shows who was there, not who took anything.
      </p>
      <div className="-mx-4 -mb-4 border-t sm:-mx-5 sm:-mb-5">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">
            People on the drawers: how many closes they were on, and how many came out short or over
          </caption>
          <colgroup>
            <col />
            <col className="w-20 md:w-28" />
            <col className="w-28 md:w-40" />
            <col className="hidden md:table-column md:w-40" />
          </colgroup>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="py-2.5 pl-4 text-left font-normal sm:pl-5">
                Name
              </th>
              <Heading>Closes</Heading>
              <Heading>Short</Heading>
              <th
                scope="col"
                className="hidden px-3 py-2.5 pr-4 text-right font-normal sm:pr-5 md:table-cell"
              >
                Over
              </th>
            </tr>
          </thead>
          <tbody>
            {cash.people.map((person) => (
              <tr key={person.staffId} className="border-b last:border-b-0">
                <th scope="row" className="py-3 pl-4 text-left font-normal sm:pl-5">
                  {person.name}
                </th>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{person.closes}</td>
                <td className="px-3 py-3 text-right">
                  <Tally count={person.short} amount={person.shortAmount} tone="text-danger" />
                </td>
                <td className="hidden px-3 py-3 pr-4 text-right sm:pr-5 md:table-cell">
                  <Tally count={person.over} amount={person.overAmount} tone="text-warning" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tile>
  );
}

/** "2 · GH₵45.00", or a faded dash when there were none. */
function Tally({ count, amount, tone }: { count: number; amount: number; tone: string }) {
  if (count === 0) {
    return (
      <>
        <span className="text-muted-foreground/70" aria-hidden>
          —
        </span>
        <span className="sr-only">none</span>
      </>
    );
  }
  return (
    <span className="inline-flex flex-col items-end">
      <span className={cn('font-mono tabular-nums', tone)}>{cedis(amount)}</span>
      <span className="text-xs text-muted-foreground">{closeWords(count)}</span>
    </span>
  );
}

/** One drawer in the side drawer: the sum behind "expected", then what moved through it. */
function CloseView({ shiftId }: { shiftId: string }) {
  const { tenantId } = useSession();
  const close = useQuery({
    queryKey: ['cash-close', tenantId, shiftId],
    queryFn: () => fetchCashClose(shiftId),
  });

  if (close.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (close.isError) {
    return (
      <Alert tone="danger" title="Couldn’t load this drawer">
        {close.error.message}
      </Alert>
    );
  }
  const d = close.data;
  const open = d.status === 'OPEN';
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{d.tablet}</span>
          <span className="text-sm text-muted-foreground">
            Opened {shortDate(d.openedAt.slice(0, 10))} at {clock(d.openedAt)}
            {d.openedBy ? ` by ${d.openedBy}` : ''}
          </span>
          {!open && (
            <span className="text-sm text-muted-foreground">
              Closed {shortDate(d.closedAt.slice(0, 10))} at {clock(d.closedAt)}
              {d.closedBy ? ` by ${d.closedBy}` : ''}
            </span>
          )}
        </div>
        <Badge
          tone={
            open
              ? 'neutral'
              : d.result === 'EXACT'
                ? 'success'
                : d.result === 'SHORT'
                  ? 'danger'
                  : 'warning'
          }
        >
          {open ? 'Still open' : RESULT_WORDS[d.result]}
        </Badge>
      </div>

      <div className="overflow-hidden rounded-(--radius-panel) border">
        <PanelRows>
          <PanelLine label="Float" note="Cash in the drawer to start" value={cedis(d.float)} />
          <PanelLine label="Cash sales" value={`+${cedis(d.cashSales)}`} />
          {d.payIns > 0 && <PanelLine label="Pay-ins" value={`+${cedis(d.payIns)}`} />}
          {d.payouts > 0 && <PanelLine label="Payouts" value={`−${cedis(d.payouts)}`} />}
          {d.drops > 0 && (
            <PanelLine label="Drops" note="Taken out to the safe" value={`−${cedis(d.drops)}`} />
          )}
          <PanelLine strong label="Expected" value={cedis(open ? d.expectedNow : d.expected)} />
          {!open && <PanelLine label="Counted" value={cedis(d.counted)} />}
          {!open && (
            <PanelLine
              strong
              label="Difference"
              value={d.result === 'EXACT' ? `Exact (${signed(d.variance)})` : signed(d.variance)}
              tone={RESULT_TONES[d.result]}
            />
          )}
        </PanelRows>
      </div>
      {!open && d.expectedNow !== d.expected && (
        <Alert tone="info" title="Something on this drawer changed after it closed">
          At the close it was expected to hold {cedis(d.expected)}. Worked out on today’s records
          it’s {cedis(d.expectedNow)}, usually because a cash payment reached Brixx late.
        </Alert>
      )}

      {d.movements.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="movements">
          <h3 id="movements" className="text-sm font-medium">
            Cash moved in and out
          </h3>
          <div className="overflow-hidden rounded-(--radius-panel) border">
            <PanelRows>
              {d.movements.map((movement) => (
                <PanelLine
                  key={movement.id}
                  label={MOVEMENT_WORDS[movement.type]}
                  note={[clock(movement.at), movement.by, movement.note].filter(Boolean).join(', ')}
                  value={`${movement.type === 'PAY_IN' ? '+' : '−'}${cedis(movement.amount)}`}
                />
              ))}
            </PanelRows>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="cash-by">
        <h3 id="cash-by" className="text-sm font-medium">
          Who took cash on it
        </h3>
        {d.cashBy.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cash sales on this drawer.</p>
        ) : (
          <div className="overflow-hidden rounded-(--radius-panel) border">
            <PanelRows>
              {d.cashBy.map((person) => (
                <PanelLine
                  key={person.staffId}
                  label={
                    <span className="flex items-center gap-2">
                      <Users size={14} strokeWidth={1.75} aria-hidden />
                      {person.name}
                    </span>
                  }
                  note={person.payments === 1 ? '1 payment' : `${person.payments} payments`}
                  value={cedis(person.amount)}
                />
              ))}
            </PanelRows>
          </div>
        )}
      </section>
    </div>
  );
}

const MOVEMENT_WORDS = { DROP: 'Drop', PAY_IN: 'Pay-in', PAYOUT: 'Payout' } as const;
