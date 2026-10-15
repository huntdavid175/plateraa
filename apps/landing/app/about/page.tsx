import type { Metadata } from 'next';

import { Closing } from '../../components/closing';
import { PageHero } from '../../components/page-hero';
import { Container, PhotoSlot, SectionHeading } from '../../components/ui';
import { PHOTOS } from '../../content/photos';

export const metadata: Metadata = {
  title: 'About Plateraa',
  description:
    'Plateraa is built for Ghana’s small food vendors: one place for orders, an honest record of money, and a clear view of profit.',
  alternates: { canonical: '/about' },
};

const BELIEFS = [
  {
    title: 'Your money stays yours',
    body: 'Customer payments go into your own Moolre account. Plateraa keeps the record, and you keep the money.',
  },
  {
    title: 'Built for real conditions',
    body: 'Hotspots drop, power goes, the queue grows. Plateraa keeps taking orders offline and catches up later.',
  },
  {
    title: 'Plain words, few taps',
    body: 'If something slows down taking an order, we change it. Screens use the words your staff already use.',
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        label="About"
        title="Built for the people who feed Ghana"
        script="one counter at a time"
        intro="Ghana’s chop bars, waakye spots and kitchens feed the country every day, and many of them keep the books in a notebook. Plateraa gives them the clear view of their money that bigger restaurants take for granted."
      />

      <Container>
        <PhotoSlot
          photo="a food vendor smiling behind their counter"
          image={PHOTOS.aboutHero}
          priority
          className="h-[320px] rounded-[32px] sm:h-[520px]"
        />
      </Container>

      <section className="reveal py-20 sm:py-28">
        <Container className="grid gap-12 lg:grid-cols-2">
          <SectionHeading title="Why we started" />
          <div className="space-y-5 text-[18px] leading-relaxed text-muted">
            <p>
              A busy food spot takes orders from everywhere at once: people at the counter, calls,
              messages on WhatsApp and Instagram. Most of it is paid in cash or by MoMo, and most of
              it ends up as lines in a notebook, if it gets written down at all.
            </p>
            <p>
              At the end of the day, the owner is left asking what really came in, where it went and
              whether the day made money. Big restaurant systems weren’t built for that counter:
              they’re priced in dollars, expect card machines and need a steady internet connection.
            </p>
            <p>
              We started building Plateraa in September 2026 to fix that, beginning with a small
              group of vendors we set up ourselves and learn from every week.
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
