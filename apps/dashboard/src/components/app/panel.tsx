import { ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * A titled region of a screen: one bordered surface, its heading at the top and its rows below,
 * divided by hairlines. Rows go in `PanelRows`; anything else (a chart, a note) goes in as is.
 */
export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** A link or button at the heading's right, such as "All 24 today". */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-(--radius-surface) border bg-card',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 id={id} className="font-medium">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** A panel's rows, divided by hairlines. */
export function PanelRows({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col divide-y border-t">{children}</ul>;
}

/**
 * A ledger line in `PanelRows`: what it is on the left, the amount on the right. With `to`, it
 * opens the orders or expenses behind the figure.
 */
export function PanelLine({
  label,
  note,
  value,
  to,
  strong,
  tone,
}: {
  label: ReactNode;
  note?: ReactNode;
  value: ReactNode;
  to?: string;
  /** The line that sums up the ones above it (a total, the profit). */
  strong?: boolean;
  tone?: string | false;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className={cn('truncate text-sm', strong && 'font-medium')}>{label}</span>
        {note && <span className="truncate text-xs text-muted-foreground">{note}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={cn('font-mono text-sm', strong && 'text-base', tone)}>{value}</span>
        {to && (
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            className="text-muted-foreground"
            aria-hidden
          />
        )}
      </span>
    </>
  );
  const row = cn(
    'flex items-center justify-between gap-4 px-5 py-3',
    strong && 'bg-muted/60 py-3.5',
  );
  return (
    <li>
      {to ? (
        <Link to={to} className={cn(row, 'transition-colors hover:bg-muted/60')}>
          {body}
        </Link>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
}

/** A panel with nothing in it yet: one quiet line. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="border-t px-5 py-5 text-sm text-muted-foreground">{children}</p>;
}

/** The link at a panel's heading. */
export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-sm font-medium text-accent-strong">
      {children}
    </Link>
  );
}
