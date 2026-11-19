import { ArrowUpRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AnimatedCounter } from '@/components/arc/animated-counter/animated-counter';
import { cn } from '@/lib/utils';

/**
 * A bento grid: tiles of different sizes in one grid, four columns on a laptop and two below it,
 * so small tiles pair up on a phone. A tile says how much room it takes with `className`
 * (`col-span-2` for a wide one, `lg:col-span-3`, `lg:row-span-2`, …); the gaps stay the same.
 */
export function Bento({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4', className)}>
      {children}
    </div>
  );
}

/**
 * One tile: a small heading, an optional link to what's behind it (the arrow at the top right),
 * and its content. A tile is never itself a link, so charts inside it stay usable.
 */
export function Tile({
  title,
  to,
  toLabel,
  children,
  className,
  tone,
}: {
  title: string;
  /** Where the rows behind the tile are. */
  to?: string;
  /** What the arrow opens, read out: "Open today’s orders". */
  toLabel?: string;
  children: ReactNode;
  className?: string;
  /** A tile that needs attention gets the status colour along its edge. */
  tone?: 'warning' | 'danger';
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-(--radius-surface) border bg-card p-4 sm:p-5',
        tone === 'warning' && 'border-warning/40',
        tone === 'danger' && 'border-danger/40',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={id} className="text-sm text-text-secondary">
          {title}
        </h2>
        {to && (
          <Link
            to={to}
            aria-label={toLabel ?? `Open ${title.toLowerCase()}`}
            className="-m-1.5 flex size-8 shrink-0 items-center justify-center rounded-(--radius-control) text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Rows that run edge to edge across the bottom of a tile (`PanelLine`s, `SwitchRow`s). */
export function TileRows({ children }: { children: ReactNode }) {
  return (
    <ul className="-mx-4 -mb-4 flex flex-col divide-y border-t sm:-mx-5 sm:-mb-5">{children}</ul>
  );
}

/**
 * A cedi amount in a tile, from pesewas. The digits roll when it changes (Arc's animated
 * counter); `big` is the one figure a screen is about, which also rolls up the first time it's seen.
 */
export function Cedis({
  amount,
  big,
  className,
}: {
  /** Pesewas. */
  amount: number;
  big?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        // Arc's counter sizes itself by --text-3xl; the tile sets it, rather than restyling Arc.
        big
          ? '[--text-3xl:2.5rem] md:[--text-3xl:var(--text-4xl)]'
          : '[--text-3xl:var(--text-xl)] sm:[--text-3xl:var(--text-2xl)]',
        amount < 0 && '[--foreground:var(--danger)]',
        className,
      )}
    >
      {/* Display only: the amount stays integer pesewas everywhere else. */}
      <AnimatedCounter value={amount / 100} prefix="GH₵" decimals={2} animateOnView={big} />
    </span>
  );
}
