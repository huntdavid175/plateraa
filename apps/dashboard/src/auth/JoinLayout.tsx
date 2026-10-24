import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn as cx } from '@/lib/utils';

/** The three stages of joining Brixx (24 Oct, user decision): Brixx approves every business. */
const STAGES = [
  { title: 'Create your account', detail: 'Your name, email and a password.' },
  { title: 'Tell us about your business', detail: 'What you sell, where, and how to reach you.' },
  { title: 'We call you to set up', detail: 'Your menu, payments and the tablet, together.' },
] as const;

export type JoinStage = 1 | 2 | 3;

/**
 * The frame for joining: sign-up, the request and "request received". On a laptop the stages sit
 * in a panel beside the form, the current one marked; on a phone they shrink to one line on top.
 */
export function JoinLayout({
  stage,
  title,
  subtitle,
  top,
  children,
}: {
  stage: JoinStage;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Above the title, like a back button. */
  top?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
      <div className="flex flex-col px-4 py-6 md:px-8">
        <img src="/wordmark.png" alt="Brixx" className="h-7 w-auto self-start" />
        <main className="flex flex-1 justify-center pt-8 pb-12 lg:items-center lg:pt-10">
          <div className="flex w-full max-w-md flex-col gap-8">
            <div className="flex flex-col gap-3">
              <StageLine stage={stage} />
              {top}
              <h1 className="font-heading text-3xl leading-[1.1] font-medium tracking-[-0.03em] text-balance">
                {title}
              </h1>
              {subtitle && <p className="text-pretty text-text-secondary">{subtitle}</p>}
            </div>
            {children}
          </div>
        </main>
      </div>
      <Stages stage={stage} />
    </div>
  );
}

/** Phones and tablets: "Step 2 of 3 · Tell us about your business", with three short bars. */
function StageLine({ stage }: { stage: JoinStage }) {
  return (
    <div className="flex flex-col gap-2 lg:hidden">
      <div className="flex gap-1.5" aria-hidden>
        {STAGES.map((_, index) => (
          <span
            key={index}
            className={cx(
              'h-1 flex-1 rounded-full',
              index < stage ? 'bg-(--accent)' : 'bg-(--border-strong)/60',
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Step {stage} of {STAGES.length} · {STAGES[stage - 1]?.title}
      </p>
    </div>
  );
}

/** Laptops: the whole journey, so it's clear the last step is a call from the Brixx team. */
function Stages({ stage }: { stage: JoinStage }) {
  return (
    <aside
      aria-label="Joining Brixx"
      className="hidden border-l bg-(--surface-muted) px-10 py-16 lg:flex lg:flex-col lg:justify-center"
    >
      <p className="text-sm text-muted-foreground">Joining Brixx</p>
      <ol className="mt-6 flex flex-col">
        {STAGES.map((item, index) => {
          const number = index + 1;
          const done = number < stage;
          const current = number === stage;
          return (
            <li
              key={item.title}
              aria-current={current ? 'step' : undefined}
              className="relative flex gap-4 pb-9 last:pb-0"
            >
              {number < STAGES.length && (
                <span
                  aria-hidden
                  className={cx(
                    'absolute top-9 bottom-1 left-[15px] w-px',
                    done ? 'bg-(--accent)' : 'bg-(--border-strong)',
                  )}
                />
              )}
              <span
                aria-hidden
                className={cx(
                  'relative grid size-8 shrink-0 place-items-center rounded-full border text-sm tabular-nums',
                  done && 'border-(--accent) bg-(--accent) text-(--accent-foreground)',
                  current && 'border-(--accent) bg-(--surface) font-medium text-accent-strong',
                  !done &&
                    !current &&
                    'border-(--border-strong) bg-(--surface) text-muted-foreground',
                )}
              >
                {done ? <Check size={16} strokeWidth={2} /> : number}
              </span>
              <div className="pt-1">
                <p className={cx('font-medium', !current && !done && 'text-text-secondary')}>
                  {item.title}
                  {done && <span className="sr-only"> (done)</span>}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-12 max-w-xs text-sm text-muted-foreground">
        Free to start. Cash sales are always free, and you pay a small fee only when a customer pays
        you online.
      </p>
    </aside>
  );
}
