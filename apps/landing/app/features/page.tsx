import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import {
  DrawerNote,
  KitchenNote,
  NewOrderNote,
  OrderChip,
  PaidNote,
  PinNote,
  ProfitNote,
  SoldOutTag,
  StoreLinkNote,
} from '../../components/art';
import { Closing } from '../../components/closing';
import { Faq } from '../../components/faq';
import { PageHero } from '../../components/page-hero';
import { Container, PhotoSlot, SectionHeading } from '../../components/ui';
import { HOME_FAQ } from '../../content/faq';
import { PHOTOS } from '../../content/photos';

export const metadata: Metadata = {
  title: 'Features: orders, online store, mobile money and reports',
  description:
    'Take counter, phone and online orders on one Android tablet, get paid by mobile money into your own Moolre account, track the drawer and stock, and see profit every day.',
  alternates: { canonical: '/features' },
};

interface Feature {
  id: string;
  short: string;
  title: string;
  body: string;
  points: string[];
  art: ReactNode;
  /** Not built yet: shows "Coming soon" beside the title. */
  soon?: boolean;
}

const FEATURES: Feature[] = [
  {
    id: 'orders',
    short: 'Orders',
    title: 'Take every order in one place',
    body: 'Walk-ins, phone calls and orders from your online store land in the same list on the tablet. Mark each one dine-in, pickup or delivery, and the kitchen sees what to cook next.',
    points: [
      'Sizes and extras for any item',
      'Hold an order and come back to it',
      'A kitchen queue with timers',
    ],
    art: (
      <div className="flex w-full max-w-72 flex-col gap-3">
        <OrderChip code="A21" kind="Dine-in" amount="GH₵38.00" />
        <OrderChip code="W9" kind="Pickup" amount="GH₵64.00" className="ml-6" />
        <OrderChip code="A22" kind="Delivery" amount="GH₵95.00" />
      </div>
    ),
  },
  {
    id: 'store',
    short: 'Online store',
    title: 'Your own online store',
    body: 'Every business gets a store link to share on WhatsApp, Instagram and flyers. Customers browse your menu with photos, order for pickup or delivery, and pay online.',
    points: [
      'Your colours, cover photo and logo',
      'Delivery areas with their own fees',
      'Opening hours, so nobody orders while you’re closed',
    ],
    art: (
      <div className="flex flex-col items-start gap-3">
        <StoreLinkNote />
        <NewOrderNote className="ml-8" />
      </div>
    ),
  },
  {
    id: 'payments',
    short: 'Mobile money',
    title: 'Mobile money into your own account',
    body: 'Send a customer a payment link by text from the tablet, or let them pay at checkout on your store. The money goes into your own Moolre merchant account, and the order moves on once Moolre confirms it.',
    points: [
      'Payment links texted to the customer',
      'Cash and mobile money in the same records',
      'Refunds owed are flagged for a manager',
    ],
    art: (
      <div className="flex flex-col items-start gap-3">
        <PaidNote amount="GH₵45.00" />
        <KitchenNote className="ml-8" />
      </div>
    ),
  },
  {
    id: 'drawer',
    short: 'Cash drawer',
    title: 'A cash drawer that adds up',
    body: 'Start the day with your float, record cash taken out and put in, and count the drawer at close. Staff count before they see the expected total, so the figure is honest.',
    points: ['Float at the start of the day', 'Cash drops and pay-ins', 'A blind count at close'],
    art: <DrawerNote />,
  },
  {
    id: 'stock',
    short: 'Stock',
    title: 'Stock that keeps up',
    body: 'Mark an item sold out with one tap and it shows as sold out on the tablet and your online store. Count portions if you want to, or leave it at sold out and back in.',
    points: ['One-tap sold out', 'Optional portion counts', 'Changes reach every screen'],
    art: (
      <div className="flex flex-col items-start gap-3">
        <SoldOutTag item="Pepperoni pizza" />
        <SoldOutTag item="Chicken wings" className="ml-8" />
      </div>
    ),
  },
  {
    id: 'reports',
    short: 'Reports',
    title: 'See the day, and your profit',
    body: 'On your phone or laptop, see today’s sales by hour, what came in as cash and as mobile money, your expenses and what’s left. Go back to any past day, or compare a stretch of days.',
    points: [
      'Sales, expenses and profit',
      'Any past day, any range',
      'Tap a figure to see the orders behind it',
    ],
    art: <ProfitNote />,
  },
  {
    id: 'delivery',
    short: 'Delivery apps',
    title: 'Delivery apps and riders',
    body: 'Connect the delivery apps you already sell on, so their orders land in the same list on your tablet. Then book a rider from a delivery partner for any delivery order, without hunting for a driver.',
    points: [
      'Bolt Food orders in the same list',
      'Chowdeck orders in the same list',
      'Riders from delivery partners, booked from the tablet',
    ],
    art: (
      <div className="flex w-full max-w-72 flex-col gap-3">
        <OrderChip code="B12" kind="Bolt Food · Delivery" amount="GH₵72.00" />
        <OrderChip code="C08" kind="Chowdeck · Delivery" amount="GH₵48.00" className="ml-6" />
      </div>
    ),
    soon: true,
  },
  {
    id: 'staff',
    short: 'Staff',
    title: 'Staff, roles and PINs',
    body: 'Owners, managers and staff each get the access their job needs. Everyone signs in on the tablet with their own six-digit PIN, so every action has a name on it.',
    points: [
      'Staff see orders, while totals stay with you',
      'Refunds and payouts done by managers',
      'Staff and tablets managed from the dashboard',
    ],
    art: <PinNote />,
  },
];

const GHANA = [
  {
    title: 'Offline first',
    body: 'The tablet keeps working without internet and catches up once it’s back.',
  },
  {
    title: 'Cedis, to the pesewa',
    body: 'Every amount is kept in whole pesewas, so totals add up exactly.',
  },
  {
    title: 'Ordinary tablets',
    body: 'Made for the 8 to 10 inch Android tablet you may already have.',
  },
  {
    title: 'Your money, your account',
    body: 'Payments go to your own Moolre account. We never hold them.',
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        label="Features"
        title="Everything a food business runs on"
        script="from the counter to the kitchen"
        intro="One tablet at the counter, one store link for your customers and one dashboard for you. Here’s what each part does."
        secondary={{ href: '/pricing', label: 'See pricing' }}
      />

      <Container>
        <PhotoSlot
          photo="staff serving customers"
          image={PHOTOS.featuresHero}
          priority
          className="h-[320px] rounded-[32px] sm:h-[520px]"
        />
      </Container>

      <nav
        aria-label="On this page"
        className="sticky top-16 z-40 mt-12 border-y border-line bg-white/90 backdrop-blur-md"
      >
        <Container className="flex gap-6 overflow-x-auto py-3 text-[15px] whitespace-nowrap">
          {FEATURES.map((f) => (
            <a key={f.id} href={`#${f.id}`} className="text-muted hover:text-brand-strong">
              {f.short}
            </a>
          ))}
        </Container>
      </nav>

      <div className="py-12 sm:py-20">
        {FEATURES.map((f, i) => (
          <section key={f.id} id={f.id} className="reveal scroll-mt-32 py-10 sm:py-14">
            <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div className={i % 2 === 1 ? 'lg:order-2' : undefined}>
                {f.soon && (
                  <span className="mb-4 inline-block rounded-full bg-ink px-3 py-1 text-[13px] font-medium text-white">
                    Coming soon
                  </span>
                )}
                <SectionHeading title={f.title} intro={f.body} />
                <ul className="mt-6 space-y-2">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-center gap-3 text-[16px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex min-h-[320px] items-center justify-center rounded-[32px] bg-cream p-8">
                {f.art}
              </div>
            </Container>
          </section>
        ))}
      </div>

      <section className="bg-night py-20 sm:py-28">
        <Container>
          <SectionHeading
            dark
            title="Built for how Ghana works"
            intro="Plateraa was made for vendors who take cash and MoMo, share a hotspot, and can’t stop serving because something went wrong."
          />
          <ul className="reveal mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {GHANA.map((item) => (
              <li key={item.title} className="rounded-[24px] bg-night-card p-6">
                <h3 className="text-[20px] text-on-night">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-night-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <Faq questions={HOME_FAQ} />
      <Closing heading="Try it at your counter this week" />
    </>
  );
}
