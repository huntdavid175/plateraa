import type { ReactNode } from 'react';
import { cn as cx } from '@/lib/utils';

/** A screen's heading and content column, as in the design (wide lists, narrow forms). */
export function Page({
  title,
  subtitle,
  actions,
  narrow,
  back,
  children,
}: {
  title: string;
  /** A link back up, above the heading ("← Businesses"). */
  back?: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cx('mx-auto w-full px-4 py-6 md:px-8 md:py-8', narrow ? 'max-w-2xl' : 'max-w-6xl')}
    >
      {back}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-medium tracking-[-0.03em] md:text-3xl">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/**
 * Screens outside the app (signing in, choosing a business, a crash): the Brixx mark at the
 * top, then one narrow column in the middle of the page, with no card around it.
 */
export function Centered({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col px-4 py-6 md:px-8">
      <div className="flex items-center gap-2.5">
        <img src="/wordmark.png" alt="Brixx" className="h-7 w-auto" />
      </div>
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-3xl leading-[1.1] font-medium tracking-[-0.03em]">
              {title}
            </h1>
            {subtitle && <p className="text-text-secondary">{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
