import type { ReactNode } from 'react';

import { SIGN_UP_URL } from '../lib/site';
import { ButtonLink, Container, Eyebrow, Script } from './ui';

/**
 * Toast's product-page hero: a label, a big heading with one handwritten line under it, a line
 * of text, and the buttons to the right (DESIGN.md, Direction).
 */
export function PageHero({
  label,
  title,
  script,
  intro,
  secondary,
}: {
  label: string;
  title: ReactNode;
  script?: string;
  intro: ReactNode;
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="pt-16 pb-12 sm:pt-24 sm:pb-16">
      <Container className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-end">
        <div>
          <Eyebrow>{label}</Eyebrow>
          <h1 className="mt-6 text-[44px] leading-[1.04] font-normal tracking-[-0.03em] text-balance sm:text-[64px]">
            {title}
            {script && (
              <Script className="mt-1 block text-[46px] leading-none sm:-ml-2 sm:text-[72px]">
                {script}
              </Script>
            )}
          </h1>
          <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-muted">{intro}</p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <ButtonLink href={SIGN_UP_URL} size="lg">
            Create my free account
          </ButtonLink>
          {secondary && (
            <ButtonLink href={secondary.href} kind="outline" size="lg">
              {secondary.label}
            </ButtonLink>
          )}
        </div>
      </Container>
    </section>
  );
}
