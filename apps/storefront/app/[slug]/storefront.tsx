'use client';

import { STORE_DAYS, normalizeGhanaPhone, timeWords, type StoreDay } from '@plateraa/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ulid } from 'ulid';
import {
  ArrowLeft,
  Badge,
  Basket,
  ChevronRight,
  Clock,
  DarkToggle,
  Moped,
  Navigate,
  Phone,
  PhotoPlaceholder,
  Pin,
  Qty,
  Share,
  Trash,
} from '../../components/ui';
import type { Store, StoreGroup, StoreItem } from '../../lib/api';
import {
  addLine,
  loadCart,
  priceCart,
  saveCart,
  type CartLine,
  type PricedLine,
} from '../../lib/cart';
import { useLockScroll } from '../../lib/lock-scroll';
import { useMenuNav } from '../../lib/menu-nav';
import { ghs } from '../../lib/money';
import { phoneWords } from '../../lib/words';
import { placeOrder } from '../actions';

type Screen = 'store' | 'info' | 'order' | 'paying';
type Fulfilment = 'PICKUP' | 'DELIVERY';

const primary =
  'h-12 w-full rounded-xl bg-brand text-sm font-semibold text-on-brand transition-all hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';

/** The store's page: its menu, an item's choices, the cart and checkout (the user's design). */
export function Storefront({ store }: { store: Store }) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('store');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<StoreItem | null>(null);
  const [fulfilment, setFulfilment] = useState<Fulfilment>('PICKUP');
  const [zoneId, setZoneId] = useState<string | null>(null);

  // The cart kept in this browser comes back once the page is on screen.
  useEffect(() => {
    setCart(loadCart(store.slug));
  }, [store.slug]);
  const change = (update: (lines: CartLine[]) => CartLine[]) =>
    setCart((current) => {
      const next = update(current);
      saveCart(store.slug, next);
      return next;
    });

  const priced = useMemo(() => priceCart(store, cart), [store, cart]);
  const subtotal = priced.reduce((sum, line) => sum + (line.problem ? 0 : line.lineTotal), 0);
  const count = priced.reduce((sum, line) => sum + line.quantity, 0);
  const setQuantity = (uid: string, quantity: number) =>
    change((lines) =>
      quantity <= 0
        ? lines.filter((line) => line.uid !== uid)
        : lines.map((line) => (line.uid === uid ? { ...line, quantity } : line)),
    );
  const remove = (uid: string) => change((lines) => lines.filter((line) => line.uid !== uid));

  const placed = (result: { token: string; payUrl: string | null }) => {
    change(() => []);
    const status = `/${store.slug}/o/${result.token}`;
    if (!result.payUrl) {
      router.push(status);
      return;
    }
    setScreen('paying');
    // Back from the payment page comes to the order's status page, not to checkout.
    window.history.replaceState(null, '', status);
    window.location.assign(result.payUrl);
  };

  const sheet = picking && (
    <ItemSheet
      item={picking}
      onClose={() => setPicking(null)}
      onAdd={(line) => {
        change((lines) => addLine(lines, line));
        setPicking(null);
      }}
    />
  );

  if (screen === 'paying') return <Paying />;
  if (screen === 'info') {
    return (
      <InfoScreen
        store={store}
        fulfilment={fulfilment}
        setFulfilment={setFulfilment}
        onBack={() => setScreen('store')}
      />
    );
  }
  if (screen === 'order') {
    return (
      <>
        <OrderScreen
          store={store}
          priced={priced}
          subtotal={subtotal}
          fulfilment={fulfilment}
          setFulfilment={setFulfilment}
          zoneId={zoneId}
          setZoneId={setZoneId}
          onBack={() => setScreen('store')}
          onAddMore={() => setScreen('store')}
          onEmpty={() => change(() => [])}
          setQuantity={setQuantity}
          onPick={setPicking}
          onPlaced={placed}
        />
        {sheet}
      </>
    );
  }

  return (
    <>
      <StoreScreen
        store={store}
        priced={priced}
        count={count}
        subtotal={subtotal}
        fulfilment={fulfilment}
        setFulfilment={setFulfilment}
        onPick={setPicking}
        onCart={() => setScreen('order')}
        onCheckout={() => setScreen('order')}
        onInfo={() => setScreen('info')}
        setQuantity={setQuantity}
        remove={remove}
      />
      {sheet}
    </>
  );
}

// ─── The store and its menu ───────────────────────────────────────────────────

function StoreScreen({
  store,
  priced,
  count,
  subtotal,
  fulfilment,
  setFulfilment,
  onPick,
  onCart,
  onCheckout,
  onInfo,
  setQuantity,
  remove,
}: {
  store: Store;
  priced: PricedLine[];
  count: number;
  subtotal: number;
  fulfilment: Fulfilment;
  setFulfilment: (fulfilment: Fulfilment) => void;
  onPick: (item: StoreItem) => void;
  onCart: () => void;
  onCheckout: () => void;
  onInfo: () => void;
  setQuantity: (uid: string, quantity: number) => void;
  remove: (uid: string) => void;
}) {
  const sections = useMemo(() => {
    const known = new Set(store.categories.map((category) => category.id));
    const listed = store.categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        items: store.items.filter((item) => item.categoryId === category.id),
      }))
      .filter((section) => section.items.length > 0);
    const others = store.items.filter((item) => !item.categoryId || !known.has(item.categoryId));
    return others.length
      ? [...listed, { id: 'more', name: listed.length ? 'More' : 'Menu', items: others }]
      : listed;
  }, [store]);
  const ids = useMemo(() => sections.map((section) => section.id), [sections]);
  const menu = useMenuNav(ids);

  return (
    <div className="min-h-screen bg-page">
      <StoreHero store={store} onInfo={onInfo} />
      <StoreHead store={store} onInfo={onInfo} />
      <StoreFacts store={store} onInfo={onInfo} />

      <div className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 lg:flex lg:items-center lg:gap-4 lg:px-8">
          {store.zones.length > 0 ? (
            <>
              <span className="hidden text-sm text-muted lg:block">How you’ll get it</span>
              <div className="lg:w-72">
                <FulfilmentChoice value={fulfilment} onChange={setFulfilment} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Pickup only — collect from the store.</p>
          )}
        </div>
      </div>

      {!store.open && (
        <div className="mx-auto w-full max-w-6xl px-4 lg:px-8">
          <ClosedNote store={store} />
        </div>
      )}

      {/* The categories, pinned as the menu scrolls; the same list stands on the left on a laptop. */}
      {sections.length > 1 && (
        <nav
          ref={menu.navRef}
          aria-label="Menu categories"
          className="sticky top-0 z-20 border-b border-border bg-page/95 backdrop-blur lg:hidden"
        >
          <div
            ref={menu.stripRef}
            className="scrollbar-hide flex gap-6 overflow-x-auto scroll-smooth px-4"
          >
            {sections.map((section) => {
              const on = menu.active === section.id;
              return (
                <button
                  key={section.id}
                  ref={(element) => {
                    menu.pills.current[section.id] = element;
                  }}
                  type="button"
                  onClick={() => menu.jump(section.id)}
                  aria-current={on ? 'true' : undefined}
                  className={`shrink-0 border-b-2 py-3.5 text-[15px] whitespace-nowrap transition-colors duration-200 ${
                    on
                      ? 'border-ink font-bold text-ink'
                      : 'border-transparent font-medium text-muted'
                  }`}
                >
                  {section.name}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 lg:gap-12 lg:px-8">
        {sections.length > 1 && (
          <nav aria-label="Menu categories" className="hidden w-44 shrink-0 lg:block">
            <div className="sticky top-8 space-y-0.5 py-10">
              {sections.map((section) => {
                const on = menu.active === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => menu.jump(section.id)}
                    aria-current={on ? 'true' : undefined}
                    className={`block w-full border-l-2 py-1.5 pl-3 text-left text-sm transition-colors ${
                      on
                        ? 'border-brand font-semibold text-ink'
                        : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    {section.name}
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        <main className="min-w-0 flex-1 pb-32 lg:pb-16">
          {sections.length === 0 && (
            <p className="py-16 text-center text-sm text-muted">
              Nothing on the menu yet. Check back soon.
            </p>
          )}
          {sections.map((section) => (
            <section
              key={section.id}
              ref={(element) => {
                menu.sections.current[section.id] = element;
              }}
              className="scroll-mt-14 pt-7 lg:scroll-mt-8 lg:pt-10"
            >
              <h2 className="text-2xl font-bold tracking-tight text-ink lg:text-[28px]">
                {section.name}
              </h2>
              <div className="mt-1 divide-y divide-border border-b border-border">
                {section.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    canOrder={store.open}
                    onPick={() => onPick(item)}
                  />
                ))}
              </div>
            </section>
          ))}
        </main>

        {/* The order, kept in view beside the menu on a laptop: a hairline, not a card. */}
        <aside aria-label="Your order" className="hidden w-80 shrink-0 lg:block">
          <div className="sticky top-8 py-10">
            <div className="border-l border-border pl-8">
              <h2 className="text-lg font-bold text-ink">Your order</h2>
              {priced.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  Nothing added yet. Tap an item to start your order.
                </p>
              ) : (
                <>
                  <ul className="mt-4 max-h-[50vh] divide-y divide-border overflow-y-auto border-y border-border">
                    {priced.map((line) => (
                      <li key={line.uid} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <LineWords line={line} />
                          </div>
                          <p className="font-mono text-sm font-medium">{ghs(line.lineTotal)}</p>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          {line.problem ? (
                            <span />
                          ) : (
                            <Qty
                              value={line.quantity}
                              onDec={() => setQuantity(line.uid, line.quantity - 1)}
                              onInc={() => setQuantity(line.uid, line.quantity + 1)}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => remove(line.uid)}
                            className="text-xs text-muted underline hover:text-ink"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-ink">Total</span>
                    <span className="font-mono text-lg font-semibold text-ink">
                      {ghs(subtotal)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onCheckout}
                    disabled={!store.open || priced.some((line) => line.problem)}
                    className={`${primary} mt-4`}
                  >
                    {store.open ? 'Checkout' : 'Closed right now'}
                  </button>
                  {!store.open && (
                    <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted">
                      <Clock />
                      {store.opensWords ?? 'The store isn’t taking orders right now'}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* The basket, floating over the menu on a phone. */}
      {count > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center p-4 lg:hidden">
          <button
            type="button"
            onClick={onCart}
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-brand px-5 py-3.5 text-on-brand shadow-xl transition-all hover:bg-brand-hover active:scale-[0.98]"
          >
            <Basket />
            <span className="font-mono text-base font-semibold">{ghs(subtotal)}</span>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-black/25 px-1.5 font-mono text-xs font-bold">
              {count}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Passing the store's link on: the phone's own share sheet where there is one, the clipboard
 * otherwise. Says whether it had to copy, so the page can tell the customer.
 */
async function shareStore(name: string): Promise<'shared' | 'copied' | 'no'> {
  const url = window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: name, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    // The customer closed the share sheet, or the browser wouldn't copy: nothing to say.
    return 'no';
  }
}

/** Shares the store's link, and says "Link copied" for a moment when it had to copy. */
function useShareStore(name: string) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if ((await shareStore(name)) !== 'copied') return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, share };
}

/** The cover picture, with the store's name over it and the way into its details. Phones only. */
function StoreHero({ store, onInfo }: { store: Store; onInfo: () => void }) {
  const { copied, share } = useShareStore(store.name);
  const onCover = Boolean(store.coverUrl);

  return (
    <header className="relative h-56 overflow-hidden bg-hero sm:h-64 lg:hidden">
      {store.coverUrl && (
        <>
          <img
            src={store.coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Keeps the name readable on any photo. */}
          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/25 to-black/20" />
        </>
      )}

      <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-2 p-4">
        {copied && (
          <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
            Link copied
          </span>
        )}
        <RoundButton label="Share this store" onClick={() => void share()}>
          <Share />
        </RoundButton>
        <DarkToggle className="bg-card/85 text-ink shadow-sm backdrop-blur hover:bg-card" />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-5 pb-6 text-center">
        {store.logoUrl ? (
          <img
            src={store.logoUrl}
            alt=""
            className="mb-3 h-16 w-16 rounded-2xl bg-card object-cover shadow-md"
          />
        ) : null}
        <h1
          className={`text-2xl leading-tight font-bold ${onCover ? 'text-white' : 'text-on-hero'}`}
        >
          {store.name}
        </h1>
        <button
          type="button"
          onClick={onInfo}
          className={`mt-1.5 flex items-center gap-0.5 text-sm font-semibold ${
            onCover ? 'text-white/90 hover:text-white' : 'text-on-hero/85 hover:text-on-hero'
          }`}
        >
          More info
          <ChevronRight />
        </button>
      </div>
    </header>
  );
}

/**
 * The store's heading on a laptop (22 Oct): a full-width cover stretched too far, so the cover
 * is a picture beside the name, on the page itself, with the facts under the name.
 */
function StoreHead({ store, onInfo }: { store: Store; onInfo: () => void }) {
  const { copied, share } = useShareStore(store.name);

  return (
    <header className="hidden border-b border-border lg:block">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-8 px-8 py-8">
        {store.coverUrl ? (
          <div className="relative shrink-0">
            <img
              src={store.coverUrl}
              alt=""
              className="aspect-[4/3] w-56 rounded-2xl object-cover"
            />
            {store.logoUrl && (
              <img
                src={store.logoUrl}
                alt=""
                className="absolute -right-3 -bottom-3 h-16 w-16 rounded-xl bg-card object-cover ring-4 ring-page"
              />
            )}
          </div>
        ) : store.logoUrl ? (
          <img
            src={store.logoUrl}
            alt=""
            className="h-24 w-24 shrink-0 rounded-2xl bg-card object-cover"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-4xl leading-tight font-bold tracking-tight text-ink">
                {store.name}
              </h1>
              <div className="mt-1 flex items-center gap-3 text-sm">
                {store.area && <span className="text-muted">{store.area}</span>}
                <button
                  type="button"
                  onClick={onInfo}
                  className="flex items-center gap-0.5 font-semibold text-ink hover:text-brand"
                >
                  More info
                  <ChevronRight />
                </button>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {copied && <span className="text-xs text-muted">Link copied</span>}
              <RoundButton label="Share this store" onClick={() => void share()}>
                <Share />
              </RoundButton>
              <DarkToggle className="bg-card/85 text-ink shadow-sm backdrop-blur hover:bg-card" />
            </div>
          </div>

          <div className="mt-5 flex divide-x divide-border">
            {storeFacts(store).map((fact) => (
              <div key={fact.label} className="px-6 first:pl-0">
                <p className="text-sm font-semibold text-ink">{fact.label}</p>
                <p className="mt-0.5 text-xs text-muted">{fact.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

/** What a customer checks before ordering: whether it's open, how they can get it, how they pay. */
function storeFacts(store: Store): { label: string; value: string }[] {
  const cheapest = store.zones.length ? Math.min(...store.zones.map((zone) => zone.fee)) : null;
  return [
    {
      label: store.open ? 'Open' : 'Closed',
      value: store.open
        ? 'taking orders'
        : (store.opensWords?.replace(/^Opens /, 'opens ') ?? 'not taking orders'),
    },
    cheapest === null
      ? { label: 'Pickup', value: 'collect in person' }
      : { label: 'Delivery', value: `from ${ghs(cheapest)}` },
    store.payOnline
      ? { label: 'Pay online', value: store.cashOnPickup ? 'or cash on pickup' : 'by MoMo' }
      : { label: 'Cash', value: 'when you collect' },
  ];
}

/** The facts under the cover on a phone; on a laptop they sit in `StoreHead`. */
function StoreFacts({ store, onInfo }: { store: Store; onInfo: () => void }) {
  return (
    <div className="border-b border-border lg:hidden">
      <div className="mx-auto flex w-full max-w-6xl items-stretch divide-x divide-border px-4">
        {storeFacts(store).map((fact) => (
          <div key={fact.label} className="flex-1 px-2 py-4 text-center first:pl-0 last:pr-0">
            <p className="text-sm font-semibold text-ink">{fact.label}</p>
            <p className="mt-0.5 text-xs text-muted">{fact.value}</p>
          </div>
        ))}
      </div>
      {store.area && (
        <div className="mx-auto w-full max-w-6xl px-4 pb-3">
          <button
            type="button"
            onClick={onInfo}
            className="text-xs text-muted underline hover:text-ink"
          >
            {store.area}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Everything about the store, from "More info" on the cover (16 Sep, the user's reference): when
 * it's open, how to reach it, where it is, and what it offers. Plain rows with an icon each, a
 * hairline between them — no cards.
 */
function InfoScreen({
  store,
  fulfilment,
  setFulfilment,
  onBack,
}: {
  store: Store;
  fulfilment: Fulfilment;
  setFulfilment: (fulfilment: Fulfilment) => void;
  onBack: () => void;
}) {
  const today = store.week[store.today];
  const todayWords =
    today.open && today.from !== today.to
      ? `${timeWords(today.from)} – ${timeWords(today.to)}`
      : 'Closed today';
  const mapsQuery = encodeURIComponent(`${store.name}${store.area ? `, ${store.area}` : ''}`);
  const directions = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col lg:max-w-2xl">
      <Header
        title=""
        onBack={onBack}
        bare
        right={
          <RoundButton label="Share this store" onClick={() => void shareStore(store.name)}>
            <Share />
          </RoundButton>
        }
      />

      <div className="flex-1 px-4 pb-16">
        <h1 className="mt-2 text-[28px] leading-tight font-bold text-ink lg:text-4xl">
          {store.name}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Call the store if you have an allergy: they’ll tell you what’s in a dish and how it’s
          cooked.
        </p>

        <div className="mt-6 divide-y divide-border border-y border-border">
          <InfoRow
            icon={<Clock size={22} />}
            title={store.open ? 'Open now' : 'Closed right now'}
            detail={store.open ? todayWords : (store.opensWords ?? todayWords)}
          />
          {store.phone && (
            <InfoRow
              icon={<Phone />}
              title="Call us"
              detail={phoneWords(store.phone)}
              href={`tel:${store.phone}`}
            />
          )}
          {store.area && (
            <InfoRow
              icon={<Pin />}
              title="Where we are"
              detail={store.area}
              href={directions}
              external
            />
          )}
        </div>

        {store.area && (
          <a
            href={directions}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-tile text-sm font-semibold text-ink transition-colors hover:bg-border"
          >
            <Navigate />
            Get directions
          </a>
        )}

        <h2 className="mt-9 text-xl font-bold text-ink">How you can get it</h2>
        <p className="mt-1 text-sm text-muted">
          {store.zones.length
            ? 'Pick one now, or change it at checkout.'
            : 'This store is pickup only for now.'}
        </p>
        {store.zones.length > 0 ? (
          <div className="mt-3 max-w-xs">
            <FulfilmentChoice value={fulfilment} onChange={setFulfilment} />
          </div>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li>• Pickup — collect from the store</li>
          </ul>
        )}
        {store.zones.length > 0 && (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {store.zones.map((zone) => (
              <li key={zone.id} className="flex justify-between py-2.5 text-sm">
                <span className="text-ink">Delivery to {zone.name}</span>
                <span className="font-mono text-muted">{ghs(zone.fee)}</span>
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-9 text-xl font-bold text-ink">Paying</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {store.payOnline && <li>• Online by mobile money, when you order</li>}
          {store.cashOnPickup && <li>• Cash when you collect</li>}
          {!store.payOnline && !store.cashOnPickup && (
            <li>• This store isn’t set up to take payments yet</li>
          )}
        </ul>

        <h2 className="mt-9 text-xl font-bold text-ink">Opening hours</h2>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {STORE_DAYS.map((day) => {
            const hours = store.week[day];
            const isToday = day === store.today;
            return (
              <li
                key={day}
                className={`flex justify-between py-2.5 text-sm ${
                  isToday ? 'font-semibold text-ink' : 'text-muted'
                }`}
              >
                <span>
                  {DAY_WORDS[day]}
                  {isToday && ' · today'}
                </span>
                <span className={hours.open ? 'font-mono' : ''}>
                  {hours.open && hours.from !== hours.to
                    ? `${timeWords(hours.from)} – ${timeWords(hours.to)}`
                    : 'Closed'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const DAY_WORDS: Record<StoreDay, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** One line of the store's details: an icon, what it is, and the answer under it. */
function InfoRow({
  icon,
  title,
  detail,
  href,
  external,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  href?: string;
  external?: boolean;
}) {
  const inside = (
    <>
      <span className="mt-0.5 shrink-0 text-ink">{icon}</span>
      <span className="min-w-0">
        <span className="block text-base font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{detail}</span>
      </span>
    </>
  );
  const className = 'flex w-full items-start gap-4 py-4 text-left';
  return href ? (
    <a
      href={href}
      className={className}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {inside}
    </a>
  ) : (
    <div className={className}>{inside}</div>
  );
}

/** One of the round buttons that float over the cover picture. */
function RoundButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-card/85 text-ink shadow-sm backdrop-blur transition-colors hover:bg-card"
    >
      {children}
    </button>
  );
}

function FulfilmentChoice({
  value,
  onChange,
}: {
  value: Fulfilment;
  onChange: (value: Fulfilment) => void;
}) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="How you’ll get it">
      {(['PICKUP', 'DELIVERY'] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={`flex-1 rounded-full border py-2 text-sm font-medium transition-colors ${
            value === option
              ? 'border-ink bg-ink text-page'
              : 'border-border text-muted hover:text-ink'
          }`}
        >
          {option === 'PICKUP' ? 'Pickup' : 'Delivery'}
        </button>
      ))}
    </div>
  );
}

/** "from GH₵ 45.00" when the sizes cost different amounts. */
function priceWords(item: StoreItem) {
  const prices = item.variants.map((variant) => variant.price);
  if (prices.length > 1 && new Set(prices).size > 1) return `from ${ghs(Math.min(...prices))}`;
  return ghs(prices[0] ?? item.price);
}

/**
 * The store is shut: said once, plainly, above the menu (16 Sep, user request). The menu still
 * shows — people look before they order — but nothing can be added and checkout is off.
 */
function ClosedNote({ store }: { store: Store }) {
  return (
    <div className="flex items-start gap-3 border-b border-border py-4">
      <span className="mt-0.5 shrink-0 text-muted">
        <Clock />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">Closed right now</p>
        <p className="mt-0.5 text-xs text-muted">
          {store.opensWords
            ? `${store.opensWords}. You can look at the menu, but ordering opens then.`
            : 'The store isn’t taking orders at the moment. You can still look at the menu.'}
        </p>
      </div>
    </div>
  );
}

/**
 * One item on the menu: its name, what's in it and the price, with the photo and a round + on
 * the right. Flat, with a hairline between one item and the next — no cards (user's design,
 * 16 Sep).
 */
function ItemRow({
  item,
  canOrder,
  onPick,
}: {
  item: StoreItem;
  canOrder: boolean;
  onPick: () => void;
}) {
  const orderable = canOrder && !item.soldOut;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!orderable}
      className={`flex w-full items-start gap-4 py-5 text-left transition-opacity ${
        orderable ? 'group' : 'cursor-default opacity-55'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-ink lg:text-[17px]">{item.name}</p>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{item.description}</p>
        )}
        <p className="mt-2 font-mono text-[15px] font-medium text-ink">{priceWords(item)}</p>
        {item.soldOut && (
          <span className="mt-2 inline-block">
            <Badge tone="muted" text="Sold out" />
          </span>
        )}
      </div>
      <div className="relative h-24 w-24 shrink-0 lg:h-28 lg:w-28">
        <div className="h-full w-full overflow-hidden rounded-xl bg-tile">
          {item.photoUrl ? (
            <img
              src={item.photoUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <PhotoPlaceholder name={item.name} />
          )}
        </div>
        {orderable && (
          <span className="absolute -right-1.5 -bottom-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-on-brand shadow-md transition-transform group-hover:scale-105">
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 12 12"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 2v8M2 6h8" />
            </svg>
          </span>
        )}
      </div>
    </button>
  );
}

// ─── An item's sizes and extras ───────────────────────────────────────────────

/** A group's rule in words: "Required · choose 1", "Optional · up to 3". */
function ruleOf(group: StoreGroup): string {
  const { minSelect: min, maxSelect: max } = group;
  if (min > 0) {
    if (max === min) return `Required · choose ${min}`;
    return max === null ? `Required · choose ${min} or more` : `Required · choose ${min} to ${max}`;
  }
  return max === null ? 'Optional' : `Optional · up to ${max}`;
}

function ItemSheet({
  item,
  onClose,
  onAdd,
}: {
  item: StoreItem;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const [variantId, setVariantId] = useState(item.variants[0]?.id);
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  useLockScroll(true);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const [quantity, setQuantity] = useState(1);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const variant = item.variants.find((row) => row.id === variantId);
  const picked = item.groups.flatMap((group) =>
    group.options.filter((option) => chosen[group.id]?.includes(option.id)),
  );
  const unit = (variant?.price ?? item.price) + picked.reduce((sum, o) => sum + o.priceDelta, 0);
  const missing = item.groups.find((group) => (chosen[group.id]?.length ?? 0) < group.minSelect);

  const toggle = (group: StoreGroup, optionId: string) =>
    setChosen((current) => {
      const now = current[group.id] ?? [];
      if (now.includes(optionId)) {
        return { ...current, [group.id]: now.filter((id) => id !== optionId) };
      }
      if (group.maxSelect === 1) return { ...current, [group.id]: [optionId] };
      if (group.maxSelect !== null && now.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...now, optionId] };
    });

  const add = () => {
    if (missing) return;
    onAdd({
      uid: ulid(),
      itemId: item.id,
      ...(variant ? { variantId: variant.id } : {}),
      optionIds: picked.map((option) => option.id),
      quantity,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end lg:items-center lg:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="sheet-enter relative flex max-h-[92vh] flex-col overflow-hidden rounded-t-2xl bg-page lg:w-[480px] lg:rounded-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-card/90 text-lg leading-none text-ink shadow-sm ring-1 ring-border backdrop-blur transition-colors hover:bg-card"
        >
          ×
        </button>
        <div className="flex flex-shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-tile" />
        </div>

        <div className="scrollbar-hide flex-1 overflow-y-auto">
          {item.photoUrl && (
            <div className="h-52 w-full flex-shrink-0 bg-tile sm:h-60">
              <img src={item.photoUrl} alt="" className="h-full w-full object-cover" />
            </div>
          )}

          <div className="px-4 pt-5 pb-3">
            <h2 className="text-2xl leading-tight font-bold text-ink">{item.name}</h2>
            {item.description && (
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.description}</p>
            )}
            <p className="mt-3 font-mono text-base font-medium text-ink">{ghs(unit)}</p>
          </div>

          {item.variants.length > 0 && (
            <section className="border-t border-border px-4 py-4">
              <h3 className="mb-3 text-base font-bold text-ink">Size</h3>
              <div className="flex flex-wrap gap-2">
                {item.variants.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => setVariantId(size.id)}
                    aria-pressed={size.id === variantId}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      size.id === variantId
                        ? 'border-ink bg-ink text-page'
                        : 'border-border text-ink hover:border-ink'
                    }`}
                  >
                    {size.name}
                    <span className="ml-1.5 font-mono text-xs opacity-70">{ghs(size.price)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {item.groups.map((group) => {
            const count = chosen[group.id]?.length ?? 0;
            return (
              <section key={group.id} className="border-t border-border px-4 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-bold text-ink">{group.name}</h3>
                  <span
                    className={`text-xs ${group.minSelect > 0 ? 'font-medium text-amber' : 'text-muted'}`}
                  >
                    {ruleOf(group)}
                  </span>
                </div>
                <div className="mt-1 divide-y divide-border">
                  {group.options.map((option) => {
                    const on = chosen[group.id]?.includes(option.id) ?? false;
                    const full =
                      !on &&
                      group.maxSelect !== null &&
                      group.maxSelect > 1 &&
                      count >= group.maxSelect;
                    return (
                      <label
                        key={option.id}
                        className={`flex items-center justify-between gap-3 py-3 ${
                          full ? 'cursor-default opacity-45' : 'cursor-pointer'
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-3">
                          <input
                            type={group.maxSelect === 1 ? 'radio' : 'checkbox'}
                            name={group.id}
                            checked={on}
                            disabled={full}
                            onChange={() => toggle(group, option.id)}
                            onClick={() => {
                              // A chosen single-choice option can be tapped again to clear it.
                              if (on && group.maxSelect === 1 && group.minSelect === 0) {
                                toggle(group, option.id);
                              }
                            }}
                            className="h-[18px] w-[18px] accent-[var(--brand)]"
                          />
                          <span className={`text-sm ${on ? 'font-medium text-ink' : 'text-ink'}`}>
                            {option.name}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-sm text-muted">
                          {option.priceDelta === 0 ? 'Free' : `+${ghs(option.priceDelta)}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <div className="h-4" />
        </div>

        <div className="flex-shrink-0 border-t border-border bg-page px-4 py-4">
          {missing && (
            <p className="mb-2 text-xs text-amber">
              Choose your {missing.name.toLowerCase()} first
            </p>
          )}
          <div className="flex items-center gap-3">
            <Stepper value={quantity} onChange={(next) => setQuantity(Math.min(50, next))} />
            <button
              type="button"
              onClick={add}
              disabled={Boolean(missing)}
              className={`${primary} flex-1`}
            >
              Add to order · <span className="font-mono">{ghs(unit * quantity)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── The cart ─────────────────────────────────────────────────────────────────

/** A line's name, size, extras, and why it can't be ordered, if it can't. */
function LineWords({ line }: { line: PricedLine }) {
  return (
    <>
      <p className="text-sm font-medium text-ink">{line.name}</p>
      {line.variantName && <p className="mt-0.5 text-xs text-muted">{line.variantName}</p>}
      {line.extras.length > 0 && (
        <p className="mt-0.5 text-xs text-muted">{line.extras.join(', ')}</p>
      )}
      {line.problem && (
        <p className="mt-1 text-xs text-red">
          {line.problem === 'SOLD_OUT'
            ? 'Sold out since you added it.'
            : 'This has changed on the menu since you added it.'}
        </p>
      )}
    </>
  );
}

function Header({
  title,
  onBack,
  extra,
  right,
  bare,
}: {
  title: string;
  onBack: () => void;
  extra?: string;
  /** Anything that belongs at the far end of the bar, such as Share. */
  right?: ReactNode;
  /** No hairline underneath: for a screen that opens with a heading of its own. */
  bare?: boolean;
}) {
  return (
    <header
      className={`sticky top-0 z-20 flex items-center gap-3 bg-page px-4 py-4 ${
        bare ? '' : 'border-b border-border'
      }`}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-tile"
      >
        <ArrowLeft />
      </button>
      <h1 className="text-base font-semibold">{title}</h1>
      {extra && <Badge tone="muted" text={extra} />}
      {right && <div className="ml-auto">{right}</div>}
    </header>
  );
}

/** A box to type in: a hairline outline on the page's own colour, not a card. */
const field =
  'w-full rounded-xl border border-border bg-page px-3.5 py-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand';

/**
 * The order: what's in it, and everything needed to send it, on one page (16 Sep, user request,
 * to the reference they shared) — the cart and checkout used to be two screens. Items at the
 * top with their photo and a stepper, a comment for the kitchen, then how they'll get it, where
 * to, who they are, how they'll pay, and what it comes to.
 */
function OrderScreen({
  store,
  priced,
  subtotal,
  fulfilment,
  setFulfilment,
  zoneId,
  setZoneId,
  onBack,
  onAddMore,
  onEmpty,
  setQuantity,
  onPick,
  onPlaced,
}: {
  store: Store;
  priced: PricedLine[];
  subtotal: number;
  fulfilment: Fulfilment;
  setFulfilment: (fulfilment: Fulfilment) => void;
  zoneId: string | null;
  setZoneId: (zoneId: string) => void;
  onBack: () => void;
  onAddMore: () => void;
  onEmpty: () => void;
  setQuantity: (uid: string, quantity: number) => void;
  /** Adding one more thing from "People also add": the item's own sheet opens. */
  onPick: (item: StoreItem) => void;
  onPlaced: (result: { token: string; payUrl: string | null }) => void;
}) {
  // One order per visit to this page: sending it again after a lost answer records it once.
  const [orderId] = useState(() => ulid());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [chosenPayment, setPayment] = useState<'ONLINE' | 'CASH'>('ONLINE');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const canOnline = store.payOnline;
  const canCash = store.cashOnPickup && fulfilment === 'PICKUP';
  const payment =
    chosenPayment === 'CASH' && canCash ? 'CASH' : canOnline ? 'ONLINE' : canCash ? 'CASH' : null;
  const zone = store.zones.find((row) => row.id === zoneId) ?? null;
  const deliveryFee = fulfilment === 'DELIVERY' && zone ? zone.fee : 0;
  const total = subtotal + deliveryFee;
  const digits = phone.replace(/\D/g, '');
  const phoneToSend = digits.length === 9 ? `0${digits}` : phone.trim();
  const blocked = priced.some((line) => line.problem);
  const ready =
    store.open &&
    priced.length > 0 &&
    !blocked &&
    name.trim().length >= 2 &&
    normalizeGhanaPhone(phoneToSend) !== null &&
    (fulfilment === 'PICKUP' || (zone !== null && address.trim().length >= 3)) &&
    payment !== null;

  const submit = async () => {
    if (!ready || busy || !payment) return;
    setBusy(true);
    setProblem(null);
    const result = await placeOrder(store.slug, {
      orderId,
      type: fulfilment,
      lines: priced.map((line) => ({
        itemId: line.itemId,
        ...(line.variantId ? { variantId: line.variantId } : {}),
        optionIds: line.optionIds,
        quantity: line.quantity,
      })),
      customer: { name: name.trim(), phone: phoneToSend },
      ...(fulfilment === 'DELIVERY' && zone
        ? { delivery: { zoneId: zone.id, address: address.trim() } }
        : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      payment,
    });
    if (!result.ok) {
      setProblem(result.message);
      setBusy(false);
      return;
    }
    onPlaced(result);
  };

  if (priced.length === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col lg:max-w-2xl">
        <Header title="Your order" onBack={onBack} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="mb-2 text-5xl" aria-hidden="true">
            🛒
          </div>
          <p className="font-semibold text-ink">Nothing in your order yet</p>
          <p className="text-sm text-muted">Add something from the menu to get started.</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-on-brand"
          >
            Browse the menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col lg:max-w-2xl">
      <Header
        title={store.name}
        onBack={onBack}
        right={
          <RoundButton label="Empty your order" onClick={onEmpty}>
            <Trash />
          </RoundButton>
        }
      />

      <div className="flex-1 px-4 pb-36">
        <ul className="divide-y divide-border">
          {priced.map((line) => (
            <li key={line.uid} className="flex items-center gap-3 py-4">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-tile">
                {line.photoUrl ? (
                  <img src={line.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <PhotoPlaceholder name={line.name} />
                )}
              </div>
              <div className={`min-w-0 flex-1 ${line.problem ? 'opacity-70' : ''}`}>
                <LineWords line={line} />
                {!line.problem && (
                  <p className="mt-1 font-mono text-sm font-medium text-ink">
                    {ghs(line.lineTotal)}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {line.problem ? (
                  <button
                    type="button"
                    onClick={() => setQuantity(line.uid, 0)}
                    className="text-xs text-muted underline hover:text-ink"
                  >
                    Remove
                  </button>
                ) : (
                  <Stepper
                    value={line.quantity}
                    onChange={(quantity) => setQuantity(line.uid, quantity)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onAddMore}
          className="flex w-full items-center gap-3 border-b border-border py-4 text-left text-base font-semibold text-brand-ink"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-on-brand">
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 12 12"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 2v8M2 6h8" />
            </svg>
          </span>
          Add more
        </button>

        <AlsoAdd store={store} priced={priced} onPick={onPick} />

        <div className="border-b border-border py-4">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Need cutlery? Less pepper? Leave a note for the kitchen…"
            rows={2}
            maxLength={300}
            aria-label="Note for the kitchen"
            className="w-full resize-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </div>

        <section className="border-b border-border py-5">
          <h2 className="text-xl font-bold text-ink">Delivery or pickup?</h2>
          <div className="mt-3 divide-y divide-border">
            <ChoiceRow
              on={fulfilment === 'PICKUP'}
              onChoose={() => setFulfilment('PICKUP')}
              icon={<Basket />}
              title="Pickup"
              detail="Collect from the store"
              aside="Free"
            />
            {store.zones.length > 0 ? (
              <ChoiceRow
                on={fulfilment === 'DELIVERY'}
                onChoose={() => setFulfilment('DELIVERY')}
                icon={<Moped />}
                title="Delivery"
                detail={zone ? `To ${zone.name}` : 'Choose your area below'}
                aside={ghs(zone ? zone.fee : Math.min(...store.zones.map((row) => row.fee)))}
              />
            ) : (
              <p className="py-3 text-sm text-muted">
                This store doesn’t deliver yet — pickup only.
              </p>
            )}
          </div>

          {fulfilment === 'DELIVERY' && store.zones.length > 0 && (
            <div className="mt-4 space-y-3">
              <ul className="divide-y divide-border border-y border-border">
                {store.zones.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setZoneId(row.id)}
                      aria-pressed={zoneId === row.id}
                      className="flex w-full items-center justify-between py-3 text-sm"
                    >
                      <span className={zoneId === row.id ? 'font-semibold text-ink' : 'text-muted'}>
                        {row.name}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="font-mono text-muted">{ghs(row.fee)}</span>
                        <Tick on={zoneId === row.id} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="House no., street, landmark"
                maxLength={300}
                autoComplete="street-address"
                aria-label="Where to deliver to"
                className={field}
              />
            </div>
          )}
        </section>

        <section className="border-b border-border py-5">
          <h2 className="text-xl font-bold text-ink">Your details</h2>
          <div className="mt-3 space-y-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              maxLength={80}
              autoComplete="name"
              aria-label="Your name"
              className={field}
            />
            <div className="flex gap-2">
              <span className="flex items-center rounded-xl border border-border px-3 text-sm text-muted">
                +233
              </span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="24 000 0000"
                type="tel"
                autoComplete="tel-national"
                maxLength={16}
                aria-label="Your phone number"
                className={`flex-1 ${field}`}
              />
            </div>
            <p className="text-xs text-muted">
              The store calls or texts this number about your order.
            </p>
          </div>
        </section>

        <section className="border-b border-border py-5">
          <h2 className="text-xl font-bold text-ink">How you’ll pay</h2>
          <div className="mt-3 divide-y divide-border">
            {canOnline && (
              <ChoiceRow
                on={payment === 'ONLINE'}
                onChoose={() => setPayment('ONLINE')}
                title="Mobile money, now"
                detail="On a secure payment page"
              />
            )}
            {canCash && (
              <ChoiceRow
                on={payment === 'CASH'}
                onChoose={() => setPayment('CASH')}
                title="Cash when I collect"
                detail="Pay at the store"
              />
            )}
            {payment === null && (
              <p className="py-3 text-sm text-amber">
                {fulfilment === 'DELIVERY'
                  ? 'This store can’t take payment for deliveries online yet. Choose pickup, or call the store.'
                  : 'This store can’t take payment online yet. Call the store to order.'}
              </p>
            )}
          </div>
        </section>

        <section className="py-5">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Subtotal</span>
              <span className="font-mono">{ghs(subtotal)}</span>
            </div>
            {fulfilment === 'DELIVERY' && zone && (
              <div className="flex justify-between text-sm">
                <span className="text-muted">Delivery to {zone.name}</span>
                <span className="font-mono">{ghs(deliveryFee)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="font-mono text-lg">{ghs(total)}</span>
            </div>
          </div>
        </section>

        {blocked && (
          <p className="text-sm text-red">Take off what’s marked above before you order.</p>
        )}
        {!store.open && (
          <p className="flex items-center gap-1 text-sm text-muted">
            <Clock />
            {store.opensWords
              ? `Closed right now. ${store.opensWords}.`
              : 'The store isn’t taking orders right now.'}
          </p>
        )}
        {problem && (
          <p className="rounded-xl bg-red-bg px-4 py-3 text-sm text-red" role="alert">
            {problem}
          </p>
        )}
      </div>

      <div className="fixed right-0 bottom-0 left-0 mx-auto max-w-[430px] border-t border-border bg-page px-4 pt-3 pb-6 lg:max-w-2xl">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!ready || busy}
          className={primary}
        >
          {busy ? (
            'Sending your order…'
          ) : !store.open ? (
            'Closed right now'
          ) : payment === 'CASH' ? (
            'Place order'
          ) : (
            <>
              Pay <span className="font-mono">{ghs(total)}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * What people order most here, minus whatever is already in the order (16 Sep, user request,
 * following the reference's "People also added"). The API works it out from the last four weeks
 * of orders; a store with no orders yet gets an empty list, and this row doesn't show at all.
 */
function AlsoAdd({
  store,
  priced,
  onPick,
}: {
  store: Store;
  priced: PricedLine[];
  onPick: (item: StoreItem) => void;
}) {
  const already = new Set(priced.map((line) => line.itemId));
  const suggestions = store.popular
    .map((id) => store.items.find((item) => item.id === id))
    .filter((item): item is StoreItem => Boolean(item) && !item!.soldOut && !already.has(item!.id))
    .slice(0, 6);
  if (!store.open || suggestions.length === 0) return null;

  return (
    <section className="border-b border-border py-5">
      <h2 className="text-xl font-bold text-ink">People also add</h2>
      <div className="scrollbar-hide -mx-4 mt-3 flex gap-3 overflow-x-auto px-4">
        {suggestions.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item)}
            className="w-32 shrink-0 text-left"
          >
            <div className="relative h-32 w-32 overflow-hidden rounded-xl bg-tile">
              {item.photoUrl ? (
                <img
                  src={item.photoUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <PhotoPlaceholder name={item.name} />
              )}
              <span className="absolute right-1.5 bottom-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-on-brand shadow-md">
                <svg
                  width="13"
                  height="13"
                  fill="none"
                  viewBox="0 0 12 12"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 2v8M2 6h8" />
                </svg>
              </span>
            </div>
            <p className="mt-2 font-mono text-sm font-medium text-ink">{priceWords(item)}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.name}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

/** − 1 + in a rounded outline, as the reference has it beside each item. */
function Stepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border px-1">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        aria-label={value === 1 ? 'Remove' : 'One fewer'}
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink hover:bg-tile"
      >
        −
      </button>
      <span className="w-5 text-center font-mono text-sm">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="One more"
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink hover:bg-tile"
      >
        +
      </button>
    </div>
  );
}

/** One of a set to pick from: how they'll get it, or how they'll pay. */
function ChoiceRow({
  on,
  onChoose,
  icon,
  title,
  detail,
  aside,
}: {
  on: boolean;
  onChoose: () => void;
  icon?: ReactNode;
  title: string;
  detail?: string;
  aside?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onChoose}
      className="flex w-full items-center gap-3 py-3.5 text-left"
    >
      {icon && <span className="shrink-0 text-ink">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        {detail && <span className="mt-0.5 block text-xs text-muted">{detail}</span>}
      </span>
      {aside && <span className="shrink-0 font-mono text-sm text-muted">{aside}</span>}
      <Tick on={on} />
    </button>
  );
}

/** The chosen one of a set, in the brand colour. */
function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
        on ? 'border-brand bg-brand text-on-brand' : 'border-border'
      }`}
    >
      {on && (
        <svg
          width="11"
          height="11"
          fill="none"
          viewBox="0 0 12 12"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.5l2.5 2.5 4.5-5" />
        </svg>
      )}
    </span>
  );
}

function Paying() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint">
        <span className="text-2xl" aria-hidden="true">
          🔒
        </span>
      </div>
      <h1 className="text-lg font-semibold text-ink">Taking you to the secure payment page…</h1>
      <p className="mt-2 text-sm text-muted">Please don’t close this tab.</p>
      <div className="mt-6 flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <div
            key={dot}
            className="h-2 w-2 animate-bounce rounded-full bg-brand opacity-70"
            style={{ animationDelay: `${dot * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
