import type { ReactNode } from 'react';
import { Card, cx } from './controls';

/** A screen's heading and content column, as in the design (wide lists, narrow forms). */
export function Page({
  title,
  subtitle,
  actions,
  narrow,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cx('mx-auto px-4 py-6 md:px-8', narrow ? 'max-w-2xl' : 'max-w-5xl')}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/** Stands in for a screen that's still being built. */
export function ComingSoon({ title, what }: { title: string; what: string }) {
  return (
    <Page title={title}>
      <Card className="px-5 py-12 text-center">
        <p className="text-sm font-semibold">Coming soon</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{what}</p>
      </Card>
    </Page>
  );
}

/** A centred column for screens outside the app: signing in, choosing a business. */
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
    <div className="flex min-h-full items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-base font-bold text-white">
            P
          </div>
          <span className="text-lg font-semibold">Plateraa</span>
        </div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
