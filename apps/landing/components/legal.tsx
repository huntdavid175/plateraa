import type { ReactNode } from 'react';

import { Container, Eyebrow } from './ui';

/** A plain reading page for the legal texts. */
export function LegalPage({
  label,
  title,
  updated,
  children,
}: {
  label: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="pt-16 pb-24 sm:pt-24">
      <Container className="max-w-3xl">
        <Eyebrow>{label}</Eyebrow>
        <h1 className="mt-6 text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-[56px]">
          {title}
        </h1>
        <p className="mt-4 text-[15px] text-muted">Last updated {updated}</p>
        <div className="mt-10 space-y-5 text-[17px] leading-relaxed text-muted [&_h2]:pt-6 [&_h2]:text-[24px] [&_h2]:tracking-[-0.01em] [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
      </Container>
    </article>
  );
}
