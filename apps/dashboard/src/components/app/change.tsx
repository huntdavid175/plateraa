import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * How a figure moved against an earlier one: "↑ 12% on last Thursday". Green when the move is
 * good and red when it's bad (`upIsGood={false}` for money out). Shows nothing when there's
 * nothing earlier to compare with (a new business's first week, a loss before), since a
 * percentage of nothing says nothing.
 */
export function Change({
  now,
  before,
  against,
  upIsGood = true,
  className,
}: {
  now: number;
  before: number | null | undefined;
  /** What it's compared with, after "on": "last Thursday", "the 7 days before". */
  against: string;
  upIsGood?: boolean;
  className?: string;
}) {
  if (before === null || before === undefined || before <= 0) return null;
  const percent = Math.round(((now - before) / before) * 100);

  if (percent === 0) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>Same as {against}</span>
    );
  }
  const up = percent > 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1 text-xs', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-medium tabular-nums',
          up === upIsGood ? 'text-success' : 'text-danger',
        )}
      >
        <Arrow size={12} strokeWidth={2} aria-hidden />
        <span className="sr-only">{up ? 'Up' : 'Down'}</span>
        {Math.abs(percent).toLocaleString('en-GB')}%
      </span>
      <span className="text-muted-foreground">on {against}</span>
    </span>
  );
}
