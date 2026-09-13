'use client';

import { normalizeGhanaPhone } from '@plateraa/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ulid } from 'ulid';
import {
  ArrowLeft,
  Badge,
  ChevronDown,
  Clock,
  DarkToggle,
  PhotoPlaceholder,
  Qty,
  initialsOf,
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
import { ghs } from '../../lib/money';
import { phoneWords } from '../../lib/words';
import { placeOrder } from '../actions';

type Screen = 'store' | 'cart' | 'checkout' | 'paying';
type Fulfilment = 'PICKUP' | 'DELIVERY';

const primary =
  'h-12 w-full rounded-xl bg-brand text-sm font-semibold text-white transition-all hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';

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

  if (screen === 'paying') return <Paying />;
  if (screen === 'cart') {
    return (
      <CartScreen
        priced={priced}
        subtotal={subtotal}
        onBack={() => setScreen('store')}
        onCheckout={() => setScreen('checkout')}
        setQuantity={setQuantity}
        remove={remove}
      />
    );
  }
  if (screen === 'checkout') {
    return (
      <Checkout
        store={store}
        priced={priced}
        subtotal={subtotal}
        fulfilment={fulfilment}
        setFulfilment={setFulfilment}
        zoneId={zoneId}
        setZoneId={setZoneId}
        onBack={() => setScreen('cart')}
        onPlaced={placed}
      />
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
        onCart={() => setScreen('cart')}
        onCheckout={() => setScreen('checkout')}
        setQuantity={setQuantity}
        remove={remove}
      />
      {picking && (
        <ItemSheet
          item={picking}
          onClose={() => setPicking(null)}
          onAdd={(line) => {
            change((lines) => addLine(lines, line));
            setPicking(null);
          }}
        />
      )}
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
  const [active, setActive] = useState(sections[0]?.id ?? '');
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const jump = (id: string) => {
    setActive(id);
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen">
      <div className="lg:mx-auto lg:flex lg:min-h-screen lg:max-w-5xl">
        <div className="lg:flex-1">
          <div className="mx-auto max-w-[430px] lg:max-w-none">
            <header className="border-b border-border bg-card">
              <div className="relative h-32 overflow-hidden bg-brand-tint lg:h-40">
                {store.coverUrl && (
                  <>
                    <img
                      src={store.coverUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    {/* Keeps the name readable on any photo. */}
                    <div className="absolute inset-0 bg-linear-to-t from-black/65 via-black/15 to-transparent" />
                  </>
                )}
                <DarkToggle className="absolute top-3 right-3 bg-card/70 hover:bg-card" />
                <div className="absolute right-4 bottom-3 left-4 flex items-end gap-3">
                  {store.logoUrl ? (
                    <img
                      src={store.logoUrl}
                      alt=""
                      className="h-12 w-12 flex-shrink-0 rounded-xl bg-card object-cover shadow-sm"
                    />
                  ) : (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand text-base font-bold text-white shadow-sm">
                      {initialsOf(store.name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h1
                      className={`truncate text-lg leading-tight font-semibold ${store.coverUrl ? 'text-white' : 'text-ink'}`}
                    >
                      {store.name}
                    </h1>
                    {store.area && (
                      <p className={`text-xs ${store.coverUrl ? 'text-white/85' : 'text-muted'}`}>
                        {store.area}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-1">
                <Badge
                  tone={store.open ? 'green' : 'red'}
                  text={store.open ? 'Open · taking orders' : 'Not taking orders right now'}
                />
                {store.hours && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <span className="text-border select-none">·</span>
                    <Clock />
                    {store.hours}
                  </span>
                )}
                {store.phone && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <span className="text-border select-none">·</span>
                    <a href={`tel:${store.phone}`} className="underline">
                      {phoneWords(store.phone)}
                    </a>
                  </span>
                )}
              </div>

              {store.zones.length > 0 ? (
                <div className="px-4 pt-3 pb-4">
                  <FulfilmentChoice value={fulfilment} onChange={setFulfilment} />
                </div>
              ) : (
                <div className="h-3" />
              )}
            </header>

            {sections.length > 1 && (
              <nav className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
                <div className="scrollbar-hide flex gap-2 overflow-x-auto">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => jump(section.id)}
                      className={`flex-shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-all ${
                        active === section.id
                          ? 'border-brand bg-brand text-white'
                          : 'border-border bg-tile text-muted'
                      }`}
                    >
                      {section.name}
                    </button>
                  ))}
                </div>
              </nav>
            )}

            <main className="pb-32 lg:pb-6">
              {sections.length === 0 && (
                <p className="px-4 pt-10 text-center text-sm text-muted">
                  Nothing on the menu yet. Check back soon.
                </p>
              )}
              {sections.map((section) => (
                <section
                  key={section.id}
                  ref={(element) => {
                    refs.current[section.id] = element;
                  }}
                  className="scroll-mt-16 px-4 pt-5"
                >
                  <h2 className="mb-3 text-base font-semibold text-ink">{section.name}</h2>
                  <div className="space-y-2">
                    {section.items.map((item) => (
                      <ItemCard
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
          </div>
        </div>

        <aside className="hidden lg:flex lg:w-96 lg:flex-col lg:border-l lg:border-border lg:bg-card">
          <div className="border-b border-border p-5">
            <h2 className="font-semibold text-ink">Your order</h2>
          </div>
          <div className="scrollbar-hide flex-1 overflow-y-auto p-4">
            {priced.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center opacity-60">
                <p className="text-4xl" aria-hidden="true">
                  🛒
                </p>
                <p className="text-sm text-muted">Nothing added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {priced.map((line) => (
                  <div
                    key={line.uid}
                    className="flex items-start justify-between gap-2 rounded-xl bg-tile p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <LineWords line={line} />
                      {!line.problem && (
                        <div className="mt-2">
                          <Qty
                            value={line.quantity}
                            onDec={() => setQuantity(line.uid, line.quantity - 1)}
                            onInc={() => setQuantity(line.uid, line.quantity + 1)}
                          />
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-medium">{ghs(line.lineTotal)}</p>
                      <button
                        type="button"
                        onClick={() => remove(line.uid)}
                        className="mt-1 text-xs text-muted underline hover:text-ink"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {priced.length > 0 && (
            <div className="border-t border-border p-4">
              <div className="mb-3 flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span className="font-mono">{ghs(subtotal)}</span>
              </div>
              <button
                type="button"
                onClick={onCheckout}
                disabled={!store.open || priced.some((line) => line.problem)}
                className={primary}
              >
                Checkout
              </button>
            </div>
          )}
        </aside>
      </div>

      {count > 0 && (
        <div className="fixed right-0 bottom-0 left-0 mx-auto max-w-[430px] px-4 pt-3 pb-6 lg:hidden">
          <button
            type="button"
            onClick={onCart}
            className="flex h-14 w-full items-center justify-between rounded-xl bg-brand px-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-brand-hover active:scale-[0.98]"
          >
            <span className="rounded-lg bg-white/25 px-2.5 py-1 font-mono text-xs font-bold">
              {count}
            </span>
            <span>View cart</span>
            <span className="font-mono">{ghs(subtotal)}</span>
          </button>
        </div>
      )}
    </div>
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
          className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-all ${
            value === option
              ? 'border-brand bg-brand-tint text-brand'
              : 'border-border bg-tile text-muted'
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

function ItemCard({
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
      className={`flex w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-all ${
        orderable ? 'hover:shadow-sm active:scale-[0.99]' : 'cursor-default opacity-60'
      }`}
    >
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-ink">{item.name}</p>
          {item.soldOut && <Badge tone="muted" text="Sold out" />}
        </div>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">
            {item.description}
          </p>
        )}
        <p className="mt-2 font-mono text-sm font-medium text-ink">{priceWords(item)}</p>
      </div>
      <div className="relative h-24 w-24 flex-shrink-0 bg-tile">
        {item.photoUrl ? (
          <img src={item.photoUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <PhotoPlaceholder name={item.name} />
        )}
        {orderable && (
          <div className="absolute right-1.5 bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand shadow-sm">
            <svg
              width="12"
              height="12"
              fill="none"
              viewBox="0 0 12 12"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 2v8M2 6h8" />
            </svg>
          </div>
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
      <div className="sheet-enter relative flex max-h-[92vh] flex-col rounded-t-2xl bg-card lg:w-[480px] lg:rounded-2xl">
        <div className="flex flex-shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-tile" />
        </div>

        <div className="scrollbar-hide flex-1 overflow-y-auto">
          {item.photoUrl && (
            <div className="relative mx-4 h-52 flex-shrink-0 overflow-hidden rounded-xl bg-tile">
              <img src={item.photoUrl} alt="" className="h-full w-full object-cover" />
            </div>
          )}

          <div className="px-4 pt-4 pb-2">
            <h2 className="text-xl font-semibold text-ink">{item.name}</h2>
            {item.description && (
              <p className="mt-1 text-sm leading-relaxed text-muted">{item.description}</p>
            )}
            <p className="mt-2 font-mono font-medium text-ink">{ghs(unit)}</p>
          </div>

          {item.variants.length > 0 && (
            <section className="border-t border-border px-4 pt-3 pb-2">
              <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Size</p>
              <div className="flex flex-wrap gap-2">
                {item.variants.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => setVariantId(size.id)}
                    aria-pressed={size.id === variantId}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                      size.id === variantId
                        ? 'border-brand bg-brand-tint text-brand'
                        : 'border-border bg-tile text-ink'
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
              <section key={group.id} className="border-t border-border px-4 pt-3 pb-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold tracking-wider text-muted uppercase">
                    {group.name}
                  </p>
                  <Badge tone={group.minSelect > 0 ? 'amber' : 'muted'} text={ruleOf(group)} />
                </div>
                <div className="space-y-1">
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
                        className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
                          on
                            ? 'border-brand bg-brand-tint'
                            : full
                              ? 'cursor-default border-transparent bg-tile opacity-50'
                              : 'border-transparent bg-tile hover:border-border'
                        }`}
                      >
                        <span className="flex items-center gap-3">
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
                            className="h-4 w-4 accent-[var(--brand)]"
                          />
                          <span className="text-sm text-ink">{option.name}</span>
                        </span>
                        <span className="font-mono text-sm text-muted">
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

        <div className="flex-shrink-0 border-t border-border bg-card px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <Qty
              value={quantity}
              onDec={() => setQuantity((q) => Math.max(1, q - 1))}
              onInc={() => setQuantity((q) => Math.min(50, q + 1))}
            />
            {missing && (
              <p className="ml-2 text-xs text-amber">
                Choose your {missing.name.toLowerCase()} first
              </p>
            )}
          </div>
          <button type="button" onClick={add} disabled={Boolean(missing)} className={primary}>
            Add to order · <span className="font-mono">{ghs(unit * quantity)}</span>
          </button>
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

function Header({ title, onBack, extra }: { title: string; onBack: () => void; extra?: string }) {
  return (
    <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-4">
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
    </header>
  );
}

function CartScreen({
  priced,
  subtotal,
  onBack,
  onCheckout,
  setQuantity,
  remove,
}: {
  priced: PricedLine[];
  subtotal: number;
  onBack: () => void;
  onCheckout: () => void;
  setQuantity: (uid: string, quantity: number) => void;
  remove: (uid: string) => void;
}) {
  const blocked = priced.some((line) => line.problem);
  if (priced.length === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col">
        <Header title="Your cart" onBack={onBack} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="mb-2 text-5xl" aria-hidden="true">
            🛒
          </div>
          <p className="font-semibold text-ink">Your cart is empty</p>
          <p className="text-sm text-muted">Add something from the menu to get started.</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white"
          >
            Browse the menu
          </button>
        </div>
      </div>
    );
  }

  const items = priced.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col">
      <Header title="Your cart" onBack={onBack} extra={`${items} item${items === 1 ? '' : 's'}`} />
      <div className="flex-1 pb-32">
        <div className="mx-4 mt-4 overflow-hidden rounded-xl border border-border bg-card">
          {priced.map((line, index) => (
            <div
              key={line.uid}
              className={`px-4 py-4 ${index > 0 ? 'border-t border-border' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`min-w-0 flex-1 ${line.problem ? 'opacity-70' : ''}`}>
                  <LineWords line={line} />
                </div>
                {!line.problem && (
                  <p className="flex-shrink-0 font-mono text-sm font-medium text-ink">
                    {ghs(line.lineTotal)}
                  </p>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
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
            </div>
          ))}
        </div>

        <div className="mx-4 mt-4 flex justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold">
          <span>Subtotal</span>
          <span className="font-mono">{ghs(subtotal)}</span>
        </div>
        {blocked && (
          <p className="mx-4 mt-3 text-xs text-red">
            Take off what’s marked above before you check out.
          </p>
        )}
      </div>

      <div className="fixed right-0 bottom-0 left-0 mx-auto max-w-[430px] border-t border-border bg-page px-4 pt-3 pb-6">
        <button type="button" onClick={onCheckout} disabled={blocked} className={primary}>
          Checkout
        </button>
      </div>
    </div>
  );
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

const field =
  'w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand';

function Checkout({
  store,
  priced,
  subtotal,
  fulfilment,
  setFulfilment,
  zoneId,
  setZoneId,
  onBack,
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
  onPlaced: (result: { token: string; payUrl: string | null }) => void;
}) {
  // One order per checkout: sending it again after a lost answer records it once.
  const [orderId] = useState(() => ulid());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [chosenPayment, setPayment] = useState<'ONLINE' | 'CASH'>('ONLINE');
  const [showZones, setShowZones] = useState(false);
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
  const ready =
    store.open &&
    priced.length > 0 &&
    !priced.some((line) => line.problem) &&
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

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col">
      <Header title="Checkout" onBack={onBack} />

      <div className="mt-4 flex-1 space-y-4 px-4 pb-36">
        {store.zones.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
              How you’ll get it
            </p>
            <FulfilmentChoice value={fulfilment} onChange={setFulfilment} />
          </section>
        )}

        {fulfilment === 'DELIVERY' && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">
              Delivery area
            </p>
            <button
              type="button"
              onClick={() => setShowZones(!showZones)}
              aria-expanded={showZones}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-tile px-3 py-2.5 text-sm"
            >
              <span className={zone ? 'text-ink' : 'text-muted'}>
                {zone ? `${zone.name} · ${ghs(zone.fee)}` : 'Choose your area'}
              </span>
              <ChevronDown size={16} />
            </button>
            {showZones && (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {store.zones.map((row, index) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setZoneId(row.id);
                      setShowZones(false);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-3 text-sm text-ink hover:bg-tile ${
                      index > 0 ? 'border-t border-border' : ''
                    }`}
                  >
                    <span>{row.name}</span>
                    <span className="font-mono text-muted">{ghs(row.fee)}</span>
                  </button>
                ))}
              </div>
            )}
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="House no., street, landmark"
              maxLength={300}
              autoComplete="street-address"
              className={field}
            />
          </section>
        )}

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Your details</p>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            maxLength={80}
            autoComplete="name"
            className={field}
          />
          <div className="flex gap-2">
            <span className="rounded-lg border border-border bg-tile px-3 py-2.5 text-sm text-muted">
              +233
            </span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="24 000 0000"
              type="tel"
              autoComplete="tel-national"
              maxLength={16}
              className={`flex-1 ${field}`}
            />
          </div>
          <p className="text-xs text-muted">
            The store calls or texts this number about your order.
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note for the kitchen (optional)"
            rows={2}
            maxLength={300}
            className={`resize-none ${field}`}
          />
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
            How you’ll pay
          </p>
          {canOnline && (
            <PayChoice
              on={payment === 'ONLINE'}
              onChoose={() => setPayment('ONLINE')}
              title="Pay now with mobile money"
              detail="On a secure payment page"
            />
          )}
          {canCash && (
            <PayChoice
              on={payment === 'CASH'}
              onChoose={() => setPayment('CASH')}
              title="Pay cash when I collect"
            />
          )}
          {payment === null && (
            <p className="text-sm text-amber">
              {fulfilment === 'DELIVERY'
                ? 'This store can’t take payment for deliveries online yet. Choose pickup, or call the store.'
                : 'This store can’t take payment online yet. Call the store to order.'}
            </p>
          )}
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
            Order summary
          </p>
          {priced.map((line) => (
            <div key={line.uid} className="flex justify-between gap-3 text-sm">
              <span className="text-ink">
                {line.quantity}× {line.name}
                {line.variantName ? ` (${line.variantName})` : ''}
              </span>
              <span className="font-mono text-muted">{ghs(line.lineTotal)}</span>
            </div>
          ))}
          <div className="mt-2 space-y-1 border-t border-border pt-2">
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
            <div className="flex justify-between text-sm font-semibold">
              <span>Total</span>
              <span className="font-mono">{ghs(total)}</span>
            </div>
          </div>
        </section>

        {!store.open && (
          <p className="text-sm text-red">The store isn’t taking orders right now.</p>
        )}
        {problem && (
          <p className="rounded-xl bg-red-bg px-4 py-3 text-sm text-red" role="alert">
            {problem}
          </p>
        )}
      </div>

      <div className="fixed right-0 bottom-0 left-0 mx-auto max-w-[430px] border-t border-border bg-page px-4 pt-3 pb-6">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!ready || busy}
          className={primary}
        >
          {busy ? (
            'Sending your order…'
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

function PayChoice({
  on,
  onChoose,
  title,
  detail,
}: {
  on: boolean;
  onChoose: () => void;
  title: string;
  detail?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-tile px-3 py-3 transition-all ${
        on ? 'border-brand' : 'border-border'
      }`}
    >
      <input
        type="radio"
        name="payment"
        checked={on}
        onChange={onChoose}
        className="h-4 w-4 accent-[var(--brand)]"
      />
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        {detail && <span className="mt-0.5 block text-xs text-muted">{detail}</span>}
      </span>
    </label>
  );
}

/** On the way to Moolre's payment page. */
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
