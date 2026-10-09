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

/** The link at a panel's heading. */
export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-sm font-medium text-accent-strong">
      {children}
    </Link>
  );
}
