import { Bike, Footprints, Globe, Phone, ShoppingBag, Truck, type LucideIcon } from 'lucide-react';

import { OrderChip } from './art';
import { Container, cx, SectionHeading } from './ui';

interface Source {
  name: string;
  line: string;
  icon: LucideIcon;
  live: boolean;
}

/*
 * Where orders come from, and how they reach the customer. Bolt Food, Chowdeck and delivery
 * partners aren't connected yet, so they say "Coming soon" (user decision, 15 Oct). The apps are
 * named, never shown with their logos; delivery partners stay unnamed until a partnership is agreed.
 */
const SOURCES: Source[] = [
  { name: 'Walk-ins', line: 'Taken at the counter', icon: Footprints, live: true },
  { name: 'Phone calls', line: 'Typed in as they ring', icon: Phone, live: true },
  { name: 'Your online store', line: 'Ordered and paid from your link', icon: Globe, live: true },
  { name: 'Bolt Food', line: 'Your Bolt Food orders, in the same list', icon: Bike, live: false },
  {
    name: 'Chowdeck',
    line: 'Your Chowdeck orders, in the same list',
    icon: ShoppingBag,
    live: false,
  },
];

function Soon() {
  return (
    <span className="rounded-full bg-ink px-3 py-1 text-[12px] font-medium whitespace-nowrap text-white">
      Coming soon
    </span>
  );
}

export function OrderSources() {
  return (
    <section id="delivery" className="reveal scroll-mt-20 py-16 sm:py-24">
      <Container>
        <div className="rounded-[32px] bg-cream px-4 py-8 sm:p-12">
          <SectionHeading
            title="Omnichannel ordering: every app’s orders in one list"
            intro="Accept orders from Bolt Food, Chowdeck and the other food apps you already sell on, alongside your own store, walk-ins and calls. Your staff work from one list on the tablet instead of watching three phones at once."
          />

          <div className="mt-12 grid items-start gap-8 lg:grid-cols-[1.1fr_1fr]">
            <ul className="space-y-3">
              {SOURCES.map(({ name, line, icon: Icon, live }) => (
                <li
                  key={name}
                  className={cx(
                    'flex items-center gap-4 rounded-[20px] px-4 py-3 sm:px-5',
                    live ? 'bg-white' : 'border border-dashed border-ink/20',
                  )}
                >
                  <span
                    className={cx(
                      'grid h-11 w-11 shrink-0 place-items-center rounded-full',
                      live ? 'bg-brand-tint text-brand-strong' : 'bg-white text-muted',
                    )}
                  >
                    <Icon size={20} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] text-ink">{name}</span>
                    <span className="block text-[14px] text-muted">{line}</span>
                    {!live && (
                      <span className="mt-2 block sm:hidden">
                        <Soon />
                      </span>
                    )}
                  </span>
                  {live ? (
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#2d7a4a]">
                      <span className="h-2 w-2 rounded-full bg-[#2d7a4a]" aria-hidden />
                      Live
                    </span>
                  ) : (
                    <span className="hidden sm:block">
                      <Soon />
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <div className="space-y-5">
              <div className="rounded-[24px] bg-night p-4 sm:p-8">
                <p className="text-[13px] font-medium tracking-[0.08em] text-night-muted uppercase">
                  One list on your tablet
                </p>
                <div className="mt-5 space-y-3">
                  <OrderChip code="A31" kind="Walk-in · Dine-in" amount="GH₵36.00" />
                  <OrderChip code="W14" kind="Online store · Pickup" amount="GH₵54.00" />
                  <OrderChip code="A32" kind="Phone · Delivery" amount="GH₵88.00" />
                </div>
              </div>

              <div className="flex items-start gap-4 rounded-[24px] border border-dashed border-ink/20 p-4 sm:p-6">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-muted">
                  <Truck size={20} strokeWidth={1.75} aria-hidden />
                </span>
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-[17px] text-ink">
                    Delivery partners
                    <Soon />
                  </p>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted">
                    Book a rider for a delivery order straight from the tablet, so your customer
                    gets their food without you hunting for a driver.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
