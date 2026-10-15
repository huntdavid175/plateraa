'use client';

import { ArrowRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { PHOTOS } from '../content/photos';
import { DrawerNote, KitchenNote, NewOrderNote, OfflineNote, PinNote, SoldOutTag } from './art';
import { cx, PhotoSlot } from './ui';

interface Moment {
  title: string;
  body: string;
  art: ReactNode;
}

const MOMENTS: Moment[] = [
  {
    title: 'Works offline',
    body: 'Orders, cash and stock keep going when the Wi-Fi or hotspot drops, and everything catches up once you’re back online.',
    art: <OfflineNote />,
  },
  {
    title: 'Sold out in one tap',
    body: 'Out of chicken wings? One tap takes it off the tablet and your online store, so nobody orders what you can’t serve.',
    art: <SoldOutTag item="Chicken wings" />,
  },
  {
    title: 'Paid before it’s cooked',
    body: 'An order goes to the kitchen once it’s paid. Prefer to cook first? Switch it off in your settings.',
    art: <KitchenNote />,
  },
  {
    title: 'Online orders ring',
    body: 'A new order from your store chimes on the tablet, so none sits there unseen while the queue grows.',
    art: <NewOrderNote />,
  },
  {
    title: 'A PIN for everyone',
    body: 'Each staff member signs in with their own six-digit PIN, so every order and every cedi has a name on it.',
    art: <PinNote />,
  },
  {
    title: 'The drawer counts true',
    body: 'Staff count the cash at close before they see what it should hold, and any difference shows up for you to check.',
    art: <DrawerNote />,
  },
];

/**
 * Toast's "Designed for what happens mid-shift", in a dark section: a list of big lines with one
 * lit, and the matching moment on a card beside it.
 */
export function RushList() {
  const [active, setActive] = useState(0);
  const moment = MOMENTS[active] ?? MOMENTS[0]!;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <ul className="rounded-[32px] bg-night-card p-6 sm:p-10">
        {MOMENTS.map((m, i) => {
          const on = i === active;
          return (
            <li key={m.title}>
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setActive(i)}
                className={cx(
                  'flex w-full items-center justify-between gap-4 py-2 text-left text-[26px] leading-tight tracking-[-0.02em] transition-colors sm:text-[34px]',
                  on ? 'text-on-night' : 'text-night-muted/60 hover:text-night-muted',
                )}
              >
                {m.title}
                {on && (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-brand text-brand">
                    <ArrowRight size={20} strokeWidth={1.75} aria-hidden />
                  </span>
                )}
              </button>
              {on && (
                <p className="pb-4 text-[16px] leading-relaxed text-night-muted lg:hidden">
                  {m.body}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <PhotoSlot
        photo="a busy counter at lunchtime"
        image={PHOTOS.homeRush}
        className="min-h-[420px] rounded-[32px]"
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgba(21,17,14,0.92)_100%)]" />
        <div key={active} className="absolute inset-x-6 bottom-6 sm:inset-x-10 sm:bottom-10">
          <div className="mb-6 inline-block">{moment.art}</div>
          <p className="hidden max-w-md text-[18px] leading-relaxed text-on-night lg:block">
            {moment.body}
          </p>
        </div>
      </PhotoSlot>
    </div>
  );
}
