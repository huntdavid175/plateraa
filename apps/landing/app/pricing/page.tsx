import { bpsOf, formatCedis, pesewas } from '@brixx/shared';
import { Check } from 'lucide-react';
import type { Metadata } from 'next';

import { Closing } from '../../components/closing';
import { Faq } from '../../components/faq';
import { FeeCalculator } from '../../components/fee-calculator';
import { ButtonLink, Container, Eyebrow, SectionHeading, Highlight } from '../../components/ui';
import { PRICING_FAQ } from '../../content/faq';
import { ONLINE_FEE_BPS, SIGN_UP_URL } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Pricing: free to start, 2% only on online payments',
  description:
    'Brixx has no monthly fee. Cash sales are free, and Brixx’s share is 2% only when a customer pays you online. See what you’d pay.',
  alternates: { canonical: '/pricing' },
};

const INCLUDED = [
  'The counter app for your Android tablet',
  'Your own online store and store link',
  'Payment links texted to customers',
  'Cash drawer, stock and sold-out',
  'Sales, expenses and profit reports',
  'Staff accounts with their own PINs',
  'Help from our team while you set up',
];

const EXAMPLE = pesewas(5000);

export default function PricingPage() {
  return (
    <>
      <section className="pt-16 pb-12 text-center sm:pt-24">
        <Container>
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="mx-auto mt-6 max-w-4xl text-[44px] leading-[1.04] font-normal tracking-[-0.03em] text-balance sm:text-[72px]">
            <Highlight soft>Free</Highlight> to start. You pay only when you get paid.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[18px] leading-relaxed text-muted">
            One plan with everything in it. Brixx’s share is 2% of the money customers pay you
            online, and cash sales cost nothing.
          </p>
        </Container>
      </section>

      <section className="pb-20">
        <Container>
          <div className="grid overflow-hidden rounded-[32px] border border-line lg:grid-cols-[1fr_1.1fr]">
            <div className="flex flex-col bg-night p-8 text-on-night sm:p-12">
              <p className="text-[15px] font-medium tracking-[0.08em] text-brand uppercase">
                Brixx
              </p>
              <p className="mt-6 flex items-baseline gap-3">
                <span className="text-[80px] leading-none font-light tracking-[-0.04em] tabular-nums">
                  GH₵0
                </span>
                <span className="text-[18px] text-night-muted">a month</span>
              </p>
              <dl className="mt-8 space-y-4 border-t border-night-line pt-6 text-[17px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-night-muted">Online payments</dt>
                  <dd className="font-medium">2% each</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-night-muted">Cash sales</dt>
                  <dd className="font-medium">Free</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-night-muted">Signing up</dt>
                  <dd className="font-medium">Free</dd>
                </div>
              </dl>
              <div className="mt-auto pt-10">
                <ButtonLink href={SIGN_UP_URL} kind="light" size="lg" className="w-full">
                  Create my free account
                </ButtonLink>
                <p className="mt-3 text-center text-[14px] text-night-muted">
                  Moolre charges its own fee on mobile money payments.
                </p>
              </div>
            </div>
            <div className="bg-white p-8 sm:p-12">
              <h2 className="text-[26px] tracking-[-0.01em]">Everything is included</h2>
              <ul className="mt-6 space-y-4">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[17px]">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-tint text-brand-strong">
                      <Check size={15} strokeWidth={2.25} aria-hidden />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      <section className="reveal bg-cream py-20 sm:py-28">
        <Container className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <SectionHeading
            title="See what you’d pay"
            intro={`Type what customers pay you online in a month. On a ${formatCedis(EXAMPLE)} order paid by mobile money, Brixx’s share is ${formatCedis(bpsOf(EXAMPLE, ONLINE_FEE_BPS))}.`}
          />
          <FeeCalculator />
        </Container>
      </section>

      <section className="reveal py-20 sm:py-28">
        <Container>
          <SectionHeading title="Why we charge this way" />
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                title: 'We earn when you earn',
                body: 'Brixx makes money only when your customers pay you through it. If online orders don’t take off for you, Brixx costs you nothing.',
              },
              {
                title: 'Nothing to risk to try it',
                body: 'There’s no fee to sign up and no plan to cancel. Set it up, use it at your counter, and decide for yourself.',
              },
              {
                title: 'Your customers stay yours',
                body: 'Your store is yours: your menu, your prices and your customers, with a flat 2% on online payments.',
              },
            ].map((item) => (
              <li key={item.title} className="rounded-[24px] bg-cream p-8">
                <h3 className="text-[22px] tracking-[-0.01em]">{item.title}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <Faq questions={PRICING_FAQ} title="Pricing questions" />
      <Closing heading="Start free, and pay only when it pays you" />
    </>
  );
}
