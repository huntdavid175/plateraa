import { bpsOf, formatCedis, pesewas } from '@plateraa/shared';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import {
  DrawerNote,
  NewOrderNote,
  OfflineNote,
  OrderChip,
  PaidNote,
  PinNote,
  ProfitNote,
  StoreLinkNote,
} from '../components/art';
import { BusinessTypes } from '../components/business-types';
import { Closing } from '../components/closing';
import { Faq } from '../components/faq';
import { OnboardStrip } from '../components/onboard-strip';
import { OrderSources } from '../components/order-sources';
import { RushList } from '../components/rush-list';
import { ButtonLink, Container, cx, PhotoSlot, SectionHeading, Highlight } from '../components/ui';
import { HOME_FAQ } from '../content/faq';
import { PHOTOS } from '../content/photos';
import { ONLINE_FEE_BPS, SIGN_UP_URL } from '../lib/site';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const EXAMPLE_ORDER = pesewas(10000);

export default function HomePage() {
  return (
    <>
      <Hero />
      <OnboardStrip />
      <OnlineStore />
      <OrderSources />
      <BusinessTypes more />
      <Everything />
      <MidRush />
      <Pricing />
      <HowItWorks />
      <YourMoney />
      <Faq questions={HOME_FAQ} />
      <Closing />
    </>
  );
}

function Hero() {
  return (
    <section className="px-0 sm:px-3 sm:pt-3">
      <PhotoSlot
        photo="a vendor at a busy counter, tablet beside them"
        image={PHOTOS.homeHero}
        priority
        className="sm:rounded-br-[64px] sm:rounded-bl-[24px]"
      >
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(21,17,14,0.88)_0%,rgba(21,17,14,0.55)_55%,rgba(21,17,14,0.2)_100%)]" />
        <Container className="relative grid min-h-[640px] items-center gap-12 py-20 lg:min-h-[720px] lg:grid-cols-[1.25fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[14px] text-white backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
              Free to start. 2% only on online payments.
            </span>
            <h1 className="mt-8 text-[44px] leading-[1.02] font-normal tracking-[-0.03em] text-balance text-white sm:text-[64px] lg:text-[80px]">
              Make ordering <Highlight>easy</Highlight> for your customers and your kitchen
            </h1>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-white/85 sm:text-[20px]">
              Customers order and pay from your own store link. Walk-ins, phone calls and online
              orders land in one list on your tablet, so your staff handle every order from one
              place. Made for restaurants, cafés, pizzerias, bars and hotels across Ghana.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href={SIGN_UP_URL} size="lg">
                Create my free account
              </ButtonLink>
              <ButtonLink href="#how-it-works" kind="outline-light" size="lg">
                See how it works
              </ButtonLink>
            </div>
            <p className="mt-4 text-[14px] text-white/70">Cash sales are always free.</p>
          </div>
          <div className="relative hidden h-[360px] lg:block" aria-hidden>
            <OrderChip
              code="W12"
              kind="Pickup"
              amount="GH₵85.00"
              className="absolute top-0 right-6 w-72"
            />
            <PaidNote amount="GH₵85.00" className="absolute top-28 left-4 w-64" />
            <NewOrderNote className="absolute right-0 bottom-6 w-64" />
          </div>
        </Container>
      </PhotoSlot>
    </section>
  );
}

function OrangeCard({
  title,
  line,
  soon = false,
  children,
}: {
  title: string;
  line: string;
  /** Not built yet: a "Coming soon" badge in the corner. */
  soon?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative flex min-h-[260px] flex-col sm:min-h-[340px] overflow-hidden rounded-[24px] bg-[linear-gradient(160deg,#ff7a3d_0%,var(--color-brand)_45%,var(--color-brand-deep)_100%)] p-6 text-center">
      {soon && (
        <span className="absolute top-4 right-4 rounded-full bg-ink px-3 py-1 text-[12px] font-medium text-white">
          Coming soon
        </span>
      )}
      <div className="flex flex-1 items-center justify-center py-6">{children}</div>
      <h3 className="text-[24px] leading-tight tracking-[-0.01em] text-white">{title}</h3>
      <p className="mt-1 text-[15px] text-white/90">{line}</p>
    </li>
  );
}

function Everything() {
  return (
    <section className="reveal py-16 sm:py-24">
      <Container>
        <SectionHeading
          title="Everything your counter needs, on the tablet you already own"
          intro="Plateraa runs on an ordinary Android tablet. Staff sign in with their PIN and take orders in a few taps, and you can check on everything from anywhere."
        />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <OrangeCard
            title="Omnichannel ordering"
            line="Walk-ins, phone calls and your online store, in one list."
          >
            <OrderChip
              code="A15"
              kind="Dine-in"
              amount="GH₵42.00"
              className="w-full max-w-64 text-left"
            />
          </OrangeCard>
          <OrangeCard title="Your own online store" line="One link for WhatsApp and Instagram.">
            <StoreLinkNote className="text-left" />
          </OrangeCard>
          <OrangeCard title="Mobile money" line="Paid straight into your own Moolre account.">
            <PaidNote amount="GH₵60.00" className="text-left" />
          </OrangeCard>
          <OrangeCard title="Profit every day" line="Sales and expenses, on your phone.">
            <ProfitNote className="text-left" />
          </OrangeCard>
          <OrangeCard title="A drawer that adds up" line="Counted at close, checked by the tablet.">
            <DrawerNote className="text-left" />
          </OrangeCard>
          <OrangeCard
            title="Delivery integration"
            line="Bolt Food, Chowdeck and delivery riders, in the same list."
            soon
          >
            <OrderChip
              code="B12"
              kind="Bolt Food · Delivery"
              amount="GH₵72.00"
              className="w-full max-w-64 text-left"
            />
          </OrangeCard>
          <OrangeCard title="A PIN for each person" line="Know who took which order.">
            <PinNote />
          </OrangeCard>
          <OrangeCard title="Works without internet" line="Keeps selling and catches up later.">
            <OfflineNote className="text-left" />
          </OrangeCard>
        </ul>
      </Container>
    </section>
  );
}

function MidRush() {
  return (
    <section className="bg-night py-20 sm:py-28">
      <Container>
        <p className="reveal max-w-4xl text-[34px] leading-[1.1] tracking-[-0.02em] text-balance sm:text-[52px]">
          <span className="text-night-muted/70">
            The lunch rush won’t wait for the Wi-Fi to come back.
          </span>{' '}
          <span className="text-on-night">Plateraa keeps up with it.</span>
        </p>
        <div className="reveal mt-12 sm:mt-16">
          <RushList />
        </div>
      </Container>
    </section>
  );
}

function StoreStep({
  n,
  title,
  body,
  children,
}: {
  n: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <li>
      <div className="relative flex h-48 items-center sm:h-64 justify-center overflow-hidden rounded-[24px] bg-white p-6">
        <span className="absolute top-5 left-6 text-[14px] font-medium text-brand-strong">{n}</span>
        {children}
      </div>
      <h3 className="mt-5 text-[20px] tracking-[-0.01em]">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
    </li>
  );
}

function OnlineStore() {
  return (
    <section id="store" className="reveal bg-cream py-20 sm:py-28">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <SectionHeading title="Your own online store, in one link" />
          <div>
            <p className="text-[17px] leading-relaxed text-muted">
              Put your link on WhatsApp, Instagram and your shop sign. Customers see your menu with
              photos, order for pickup or delivery, and pay online. The customer stays yours.
            </p>
            <ButtonLink href={SIGN_UP_URL} kind="outline" className="mt-6">
              Open my free store
            </ButtonLink>
          </div>
        </div>
        <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StoreStep
            n="01"
            title="Share your link"
            body="Add it to your WhatsApp status, Instagram bio and flyers."
          >
            <StoreLinkNote />
          </StoreStep>
          <StoreStep
            n="02"
            title="They order"
            body="Customers pick their food, sizes and extras, and choose pickup or delivery."
          >
            <OrderChip code="W7" kind="Delivery" amount="GH₵120.00" className="w-full" />
          </StoreStep>
          <StoreStep
            n="03"
            title="They pay you"
            body="Mobile money goes into your own Moolre account. Cash on pickup is your choice."
          >
            <PaidNote amount="GH₵120.00" />
          </StoreStep>
          <StoreStep
            n="04"
            title="Your tablet rings"
            body="The order chimes at the counter, ready for the kitchen."
          >
            <NewOrderNote />
          </StoreStep>
        </ol>
      </Container>
    </section>
  );
}

function Stat({ label, figure, note }: { label: string; figure: string; note: string }) {
  return (
    <div className="border-t border-night-line pt-5">
      <p className="text-[13px] font-medium tracking-[0.08em] text-brand uppercase">{label}</p>
      <p className="mt-3 text-[64px] leading-none font-light tracking-[-0.03em] text-on-night tabular-nums sm:text-[88px]">
        {figure}
      </p>
      <p className="mt-3 text-[16px] text-night-muted">{note}</p>
    </div>
  );
}

function Pricing() {
  const share = formatCedis(bpsOf(EXAMPLE_ORDER, ONLINE_FEE_BPS));
  return (
    <section className="bg-night py-20 sm:py-28">
      <Container>
        <SectionHeading
          dark
          title="Free until a customer pays you online"
          intro="You don’t pay to join or to keep using Plateraa. We earn a small share when money comes to you through it."
        />
        <div className="reveal mt-14 grid gap-10 sm:grid-cols-3">
          <Stat label="Every month" figure="GH₵0" note="To sign up and to keep going" />
          <Stat label="Online payments" figure="2%" note="Only when a customer pays you online" />
          <Stat label="Cash sales" figure="0%" note="Cash at the counter is always free" />
        </div>
        <div className="reveal mt-14 flex flex-col gap-6 rounded-[24px] bg-night-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <p className="max-w-2xl text-[18px] leading-relaxed text-on-night">
            On a {formatCedis(EXAMPLE_ORDER)} order paid through your store, Plateraa’s share is{' '}
            {share}. On a {formatCedis(EXAMPLE_ORDER)} cash order, it’s nothing.
            <span className="mt-2 block text-[14px] text-night-muted">
              Moolre charges its own fee on mobile money payments.
            </span>
          </p>
          <ButtonLink href="/pricing" kind="light">
            See pricing
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}

const STEPS = [
  { title: 'Create your free account', body: 'From your phone, in your browser.' },
  {
    title: 'Pick a starter menu',
    body: 'Fast food, café, juice bar and more. Then set your prices.',
  },
  {
    title: 'Connect your Moolre account',
    body: 'So mobile money lands with you. We check it works.',
  },
  {
    title: 'Scan the code on your tablet',
    body: 'Install the app, add your staff and start selling.',
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="reveal scroll-mt-20 py-20 sm:py-28">
      <Container className="grid gap-14 lg:grid-cols-2 lg:items-center">
        <div className="relative h-[420px] sm:h-[480px]">
          <div className="absolute top-0 left-0 h-[70%] w-[62%]">
            <PhotoSlot
              photo="an owner setting up on their phone"
              image={PHOTOS.homeSetupPhone}
              className="h-full rounded-[24px]"
            />
          </div>
          <div className="absolute right-0 bottom-0 h-[70%] w-[55%] rounded-[24px] ring-8 ring-white">
            <PhotoSlot
              photo="a tablet on a food counter"
              image={PHOTOS.homeSetupTablet}
              className="h-full rounded-[24px]"
            />
          </div>
        </div>
        <div>
          <SectionHeading title="Set up from your phone" />
          <ol className="mt-10">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className={cx('flex gap-6 py-5', i > 0 && 'border-t border-line')}
              >
                <span className="w-8 shrink-0 pt-1 text-[16px] font-medium text-brand-strong tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>
                  <span className="block text-[24px] leading-tight tracking-[-0.01em] sm:text-[28px]">
                    {step.title}
                  </span>
                  <span className="mt-1 block text-[16px] text-muted">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <ButtonLink href={SIGN_UP_URL} size="lg" className="mt-8">
            Create my free account
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}

function YourMoney() {
  return (
    <section className="reveal pb-8">
      <Container>
        <div className="grid overflow-hidden rounded-[32px] bg-cream lg:grid-cols-2">
          <div className="p-8 sm:p-14">
            <SectionHeading
              title="Your money goes straight to you"
              intro="Every mobile money payment lands in your own Moolre merchant account. Plateraa keeps the record so your figures add up, and never holds the money itself."
            />
            <ul className="mt-8 space-y-3 text-[16px] text-ink">
              <li>Your account, opened in your name with Moolre</li>
              <li>A payment counts only once Moolre confirms it</li>
              <li>Refunds and payouts recorded by you or your manager</li>
            </ul>
          </div>
          <PhotoSlot
            photo="a customer paying by phone at a food stall"
            image={PHOTOS.homeMoney}
            className="min-h-[320px]"
          />
        </div>
      </Container>
    </section>
  );
}
