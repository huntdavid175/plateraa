import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { DonutChart } from '@/components/arc/donut-chart/donut-chart';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { Textarea } from '@/components/arc/textarea/textarea';
import type { Tablet } from '@/lib/api';
import { sentence, tabletAlertWords } from '@/lib/format';
import { refreshAll } from '@/lib/query';
import { cn } from '@/lib/utils';

/**
 * Every change the team makes asks why, and the reason goes into the audit log with their name.
 * Arc's dialog: what will happen, the reason, Cancel and the action at the bottom right.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  danger,
  ok,
  send,
  children,
  ready = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  action: string;
  danger?: boolean;
  /** The toast once it's done. */
  ok: string;
  send: (reason: string) => Promise<unknown>;
  /** More fields above the reason (a new PIN). */
  children?: ReactNode;
  ready?: boolean;
}) {
  const [reason, setReason] = useState('');
  const change = useMutation({
    mutationFn: () => send(reason.trim()),
    meta: { ok, quiet: true },
    onSuccess: () => {
      void refreshAll();
      setReason('');
      onOpenChange(false);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) change.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent title={title} description={description}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {children}
          <Textarea
            label="Why"
            description="Kept in the audit log with your name. The vendor doesn’t see it."
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
          />
          {change.error && (
            <Alert tone="danger" title="That didn’t work">
              {change.error.message}
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={danger ? 'danger' : 'primary'}
              loading={change.isPending}
              disabled={!ready || reason.trim().length < 3}
            >
              {action}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A tablet's state in one badge, with the words, never colour alone. */
export function TabletBadge({ tablet }: { tablet: Tablet }) {
  if (tablet.signedOut) return <Badge>Signed out</Badge>;
  const alert = tablet.alerts[0];
  if (alert) {
    return (
      <Badge tone={alert.kind === 'WAITING' ? 'warning' : 'danger'}>
        {tabletAlertWords(alert)}
      </Badge>
    );
  }
  return <Badge tone="success">In sync</Badge>;
}

const LINK_TONES: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  PAID: 'success',
  FAILED: 'danger',
  SENT: 'warning',
  QUEUED: 'warning',
  EXPIRED: 'neutral',
};

export function LinkBadge({ status }: { status: string }) {
  return <Badge tone={LINK_TONES[status] ?? 'neutral'}>{sentence(status)}</Badge>;
}

/** A panel's body while it loads: Arc's skeleton, in the panel's own padding. */
export function Loading({ lines = 5, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('border-t px-5 py-5', className)}>
      <Skeleton lines={lines} />
    </div>
  );
}

/** Lets an Arc table scroll sideways inside its panel on a phone, never the page. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto overscroll-x-contain border-t px-2 pb-2">{children}</div>;
}

/**
 * A row's trend inside a table cell: orders per day as a thin line, the last day dotted. Arc's
 * sparkline is a whole metric with its own label, too big for a cell.
 */
export function TrendLine({ values, label }: { values: number[]; label: string }) {
  if (!values.length) return null;
  const w = 112;
  const h = 28;
  const max = Math.max(1, ...values);
  const x = (i: number) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 4) + 2);
  const y = (v: number) => h - 3 - (v / max) * (h - 6);
  const last = values.length - 1;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
      className="block"
    >
      <polyline
        points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(last)} cy={y(values[last]!)} r="2.5" fill="var(--accent)" />
    </svg>
  );
}

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

/**
 * Arc's donut beside our own legend: the donut's built-in legend squeezes the labels to a letter
 * in a half-width panel. Each part keeps its colour, count and share, so colour is never alone.
 */
export function ShareDonut({
  label,
  totalLabel,
  unit,
  emptyLabel,
  data,
}: {
  label: string;
  totalLabel: string;
  unit: string;
  emptyLabel: string;
  data: {
    key: string;
    label: string;
    value: number;
    color?: string;
    /** A second line, such as what they came to. */ note?: string;
  }[];
}) {
  const parts = data.map((d, i) => ({ ...d, color: d.color ?? SERIES[i % SERIES.length]! }));
  const total = parts.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
      <div className="w-[150px] shrink-0">
        <DonutChart
          label={label}
          unit={unit}
          totalLabel={totalLabel}
          size={150}
          legend={false}
          emptyLabel={emptyLabel}
          data={parts}
        />
      </div>
      {total > 0 && (
        <ul className="flex w-full min-w-0 flex-1 flex-col divide-y">
          {parts.map((d) => (
            <li key={d.key} className="flex items-center gap-3 py-2 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: d.color }}
                aria-hidden
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{d.label}</span>
                {d.note && <span className="truncate text-xs text-muted-foreground">{d.note}</span>}
              </span>
              <span className="font-mono tabular-nums">{d.value.toLocaleString('en-GH')}</span>
              <span className="w-10 text-right font-mono text-muted-foreground tabular-nums">
                {Math.round((d.value / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
