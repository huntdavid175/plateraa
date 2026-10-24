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
import { PrintIn } from '../components/print-in';
import { RushList } from '../components/rush-list';
import {
  ButtonLink,
  Container,
  cx,
  PhotoSlot,
  Script,
  SectionHeading,
  Highlight,
} from '../components/ui';
import { HOME_FAQ } from '../content/faq';
import { PHOTOS } from '../content/photos';
import { SIGN_UP_URL } from '../lib/site';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

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
        // Below a laptop the photo sits above the words, its face clear, and fades into the dark.
        className="bg-night max-lg:bg-none sm:rounded-br-[64px] sm:rounded-bl-[24px]"
        imageClassName="max-lg:inset-auto max-lg:top-0 max-lg:left-0 max-lg:h-auto max-lg:aspect-[828/652]"
      >
        <div className="absolute inset-x-0 top-0 aspect-[828/652] bg-[linear-gradient(180deg,rgba(21,17,14,0.3)_0%,rgba(21,17,14,0)_22%,rgba(21,17,14,0.1)_55%,var(--color-night)_100%)] lg:hidden" />
        <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(21,17,14,0.88)_0%,rgba(21,17,14,0.55)_55%,rgba(21,17,14,0.2)_100%)] lg:block" />
        <Container className="relative grid items-center gap-12 pt-[64vw] pb-14 sm:pb-20 lg:min-h-[720px] lg:py-20 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[14px] text-white backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
              Free to start. Cash sales are always free.
            </span>
            <h1 className="mt-6 text-[40px] sm:mt-8 leading-[1.02] font-normal tracking-[-0.03em] text-balance text-white sm:text-[64px] lg:text-[72px]">
              Make ordering <Highlight>easy</Highlight> for your customers and your kitchen
            </h1>
            <p className="mt-5 max-w-lg text-[18px] leading-relaxed text-white/85 sm:mt-6 sm:text-[20px]">
              Customers order and pay from your store link. Every order lands in one list on your
              tablet.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 sm:mt-9">
              <ButtonLink href={SIGN_UP_URL} size="lg">
                Create my free account
              </ButtonLink>
              <ButtonLink href="#how-it-works" kind="outline-light" size="lg">
                See how it works
              </ButtonLink>
            </div>
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
  /** Not built yet: a badge in the corner, "Coming soon" unless a label is given. */
  soon?: boolean | string;
  children: ReactNode;
}) {
  return (
    <li className="relative flex min-h-[300px] w-[82%] shrink-0 snap-start flex-col sm:w-auto sm:min-h-[340px] overflow-hidden rounded-[24px] bg-[linear-gradient(160deg,#ff7a3d_0%,var(--color-brand)_45%,var(--color-brand-deep)_100%)] p-6 text-center">
      {soon && (
        <span className="absolute top-4 right-4 rounded-full bg-ink px-3 py-1 text-[12px] font-medium text-white">
          {soon === true ? 'Coming soon' : soon}
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
          intro="Brixx runs on an ordinary Android tablet. Staff sign in with their PIN and take orders in a few taps, and you can check on everything from anywhere."
        />
        {/* On a phone the cards are a row to swipe through, the next one peeking in, rather
            than eight tall cards stacked down the page. */}
        <ul
          tabIndex={0}
          aria-label="What Brixx does"
          className="-mx-4 mt-12 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4"
        >
          <OrangeCard
            title="Omnichannel ordering"
            line="Orders from Bolt Food, Chowdeck and your own store, in one list."
            soon="Apps coming soon"
          >
            <OrderChip
              code="B12"
              kind="Bolt Food · Delivery"
              amount="GH₵72.00"
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
            title="Delivery riders"
            line="Book a rider for any delivery order, from the tablet."
            soon
          >
            <OrderChip
              code="A32"
              kind="Rider booked"
              amount="GH₵88.00"
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
          <span className="text-on-night">Brixx keeps up with it.</span>
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
      <div className="relative flex h-36 items-center sm:h-64 justify-center overflow-hidden rounded-[24px] bg-white p-6">
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

/** One line of the pricing receipt. */
function ReceiptLine({ item, note, amount }: { item: string; note?: string; amount: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt>
        {item}
        {note && <span className="mt-0.5 block text-[13px] text-muted">{note}</span>}
      </dt>
      <dd className="shrink-0 font-medium tabular-nums">{amount}</dd>
    </div>
  );
}

/**
 * Pricing as the paper receipt a vendor hands over: every line GH₵0 except online payments, which
 * only ever say "small fee" (the rate lives in the Terms alone). It prints in once as it comes into
 * view; the zigzag foot is `.receipt-edge` in globals.css.
 */
function Receipt() {
  return (
    <div className="mx-auto w-full max-w-[400px] drop-shadow-[0_24px_40px_rgba(0,0,0,0.45)] lg:mr-0 lg:rotate-2">
      <PrintIn>
        <div className="receipt-edge bg-cream px-6 pt-7 pb-12 text-ink sm:px-8">
          <div className="flex items-center justify-between">
            {/* A plain <img>: the wordmark is a small fixed-size PNG made by `pnpm brand:assets`. */}
            <img src="/wordmark.png" alt="Brixx" width={77} height={24} />
            <span className="text-[13px] text-muted">Your bill</span>
          </div>
          <dl className="mt-6 space-y-4 border-t border-dashed border-ink/25 pt-5 text-[16px]">
            <ReceiptLine item="Signing up" amount="GH₵0.00" />
            <ReceiptLine item="Every month" amount="GH₵0.00" />
            <ReceiptLine item="Cash sales" note="Every cedi at the counter" amount="GH₵0.00" />
            <ReceiptLine
              item="Online payments"
              note="Only when a customer pays you online"
              amount="Small fee"
            />
          </dl>
          <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-dashed border-ink/25 pt-5">
            <p className="text-[16px]">To pay today</p>
            <p className="text-[40px] leading-none font-light tracking-[-0.03em] tabular-nums">
              GH₵0.00
            </p>
          </div>
          <p className="mt-6 text-[13px] text-muted">
            Moolre charges its own fee on mobile money payments.
          </p>
          <p className="mt-5 text-center">
            <Script className="text-[28px] text-brand-strong">Thank you</Script>
          </p>
        </div>
      </PrintIn>
    </div>
  );
}

function Pricing() {
  return (
    <section className="overflow-hidden bg-night py-20 sm:py-28">
      <Container className="grid items-center gap-14 lg:grid-cols-[1fr_auto] lg:gap-20">
        <div>
          <SectionHeading
            dark
            title="Free until a customer pays you online"
            intro="You don’t pay to join or to keep using Brixx. We earn a small share when money comes to you through it."
          />
          <ButtonLink href="/pricing" kind="light" className="mt-8">
            See pricing
          </ButtonLink>
        </div>
        <Receipt />
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
              intro="Every mobile money payment lands in your own Moolre merchant account. Brixx keeps the record so your figures add up, and never holds the money itself."
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
