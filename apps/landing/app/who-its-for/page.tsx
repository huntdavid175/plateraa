import { Check, Minus } from 'lucide-react';
import type { Metadata } from 'next';

import { BusinessTypes } from '../../components/business-types';
import { Closing } from '../../components/closing';
import { PageHero } from '../../components/page-hero';
import { Container, PhotoSlot, SectionHeading } from '../../components/ui';
import { PHOTOS } from '../../content/photos';

export const metadata: Metadata = {
  title: 'Who it’s for: chop bars, cafés, grills and kitchens in Ghana',
  description:
    'Plateraa is for food businesses in Ghana that want ordering to be easy for customers and every order easy to manage: chop bars, rice and waakye spots, grills, cafés, juice bars and cloud kitchens.',
  alternates: { canonical: '/who-its-for' },
};

/*
 * Who Plateraa is for, with the About story folded in (user request, 15 Oct: "Who it's for" in the
 * menu instead of "About"; /about redirects here).
 */

const ROLES = [
  {
    role: 'Owners',
    gets: 'Your own store link for customers, every order in one list, and today’s sales on your phone wherever you are. Mobile money goes straight into your own Moolre account.',
  },
  {
    role: 'Managers',
    gets: 'The menu, prices, staff and stock in one place, with refunds and payouts done from the dashboard instead of the counter.',
  },
  {
    role: 'Counter staff',
    gets: 'One list of orders to work from, a few taps per order, and a PIN of their own, so every order has a name on it.',
  },
];

const GOOD_FIT = [
  'You take orders from walk-ins, phone calls, WhatsApp or Instagram',
  'You take cash and mobile money',
  'You want customers to order and pay online from your own link',
  'You have an Android tablet for the counter, or can get one',
  'Your internet comes and goes',
];

const NOT_YET = [
  'You need card machines or table plans for a large restaurant',
  'Your business is outside Ghana',
  'You don’t want a Moolre merchant account for mobile money',
];

const BELIEFS = [
  {
    title: 'Easy for your customers',
    body: 'Ordering from you should take a few taps on a phone, with a clear price and a simple way to pay.',
  },
  {
    title: 'Easy at the counter',
    body: 'If something slows down taking an order, we change it. Screens use the words your staff already use.',
  },
  {
    title: 'Your money stays yours',
    body: 'Customer payments go into your own Moolre account. Plateraa keeps the record, and you keep the money.',
  },
];

export default function WhoItsForPage() {
  return (
    <>
      <PageHero
        label="Who it’s for"
        title="Built for the people who feed Ghana"
        script="one counter at a time"
        intro="Chop bars, waakye spots, grills and kitchens serve the country every day. Plateraa makes it easy for their customers to order, and easy for them to handle every order that comes in."
      />

      <Container>
        <PhotoSlot
          photo="a food vendor smiling behind their counter"
          image={PHOTOS.aboutHero}
          priority
          className="h-[320px] rounded-[32px] sm:h-[520px]"
        />
      </Container>

      <BusinessTypes
        title="Whatever you serve"
        intro="If you sell food in Ghana, from one pot by the roadside to a busy kitchen with a team, Plateraa fits the way you already work."
      />

      <section className="reveal bg-cream py-20 sm:py-28">
        <Container>
          <SectionHeading
            title="Something for everyone on your team"
            intro="Owners, managers and counter staff each get what their job needs, and nothing that gets in the way."
          />
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {ROLES.map((r) => (
              <li key={r.role} className="rounded-[24px] bg-white p-8">
                <h3 className="text-[24px] tracking-[-0.01em]">{r.role}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-muted">{r.gets}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="reveal py-20 sm:py-28">
        <Container>
          <SectionHeading title="Is Plateraa right for you?" />
          <div className="mt-12 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-[24px] border border-line p-8">
              <h3 className="text-[20px]">A good fit if</h3>
              <ul className="mt-5 space-y-4">
                {GOOD_FIT.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-[17px]">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-tint text-brand-strong">
                      <Check size={15} strokeWidth={2.25} aria-hidden />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[24px] bg-cream p-8">
              <h3 className="text-[20px]">Probably not yet if</h3>
              <ul className="mt-5 space-y-4">
                {NOT_YET.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-[17px] text-muted">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-muted">
                      <Minus size={15} strokeWidth={2.25} aria-hidden />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      <section className="reveal border-t border-line py-20 sm:py-28">
        <Container className="grid gap-12 lg:grid-cols-2">
          <SectionHeading title="Why we started" />
          <div className="space-y-5 text-[18px] leading-relaxed text-muted">
            <p>
              A busy food spot takes orders from everywhere at once: people at the counter, calls,
              messages on WhatsApp and Instagram. Orders get missed, customers wait to be answered,
              and payment is chased by screenshot.
            </p>
            <p>
              Big restaurant systems weren’t built for that counter. They’re priced in dollars,
              expect card machines and need a steady internet connection. The delivery apps bring
              orders but take a large share of each one.
            </p>
            <p>
              We started building Plateraa in September 2026 to make ordering easy for customers and
              easy for the people taking the orders, beginning with a small group of vendors we set
              up ourselves and learn from every week.
            </p>
          </div>
        </Container>
      </section>

      <section className="bg-night py-20 sm:py-28">
        <Container>
          <SectionHeading dark title="What we hold to" />
          <ul className="reveal mt-12 grid gap-5 md:grid-cols-3">
            {BELIEFS.map((b, i) => (
              <li key={b.title} className="rounded-[24px] bg-night-card p-8">
                <span className="text-[15px] font-medium text-brand tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-4 text-[24px] tracking-[-0.01em] text-on-night">{b.title}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-night-muted">{b.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <Closing heading="Come and build it with us" />
    </>
  );
}
