import { pesewas, priceOrder } from '@brixx/shared';
import type { Store } from './api';

/** One line of the cart, as the customer chose it. Prices come from the menu each time. */
export interface CartLine {
  uid: string;
  itemId: string;
  variantId?: string;
  optionIds: string[];
  quantity: number;
}

/** A cart line with today's names and prices, or why it can't be ordered any more. */
export interface PricedLine extends CartLine {
  name: string;
  /** The item's photo, so the order page can show it beside each line. */
  photoUrl: string | null;
  variantName: string | null;
  extras: string[];
  unitTotal: number;
  lineTotal: number;
  problem: 'SOLD_OUT' | 'GONE' | null;
}

const sameChoice = (a: CartLine, b: CartLine) =>
  a.itemId === b.itemId &&
  a.variantId === b.variantId &&
  [...a.optionIds].sort().join() === [...b.optionIds].sort().join();

/** Adds a line, or more of the same thing when it's already in the cart. */
export function addLine(lines: CartLine[], line: CartLine): CartLine[] {
  const same = lines.find((existing) => sameChoice(existing, line));
  if (!same) return [...lines, line];
  return lines.map((existing) =>
    existing === same ? { ...existing, quantity: existing.quantity + line.quantity } : existing,
  );
}

/**
 * The cart at the menu's prices, with the same pricing the server uses. The server prices the
 * order again when it's placed; these figures are for showing.
 */
export function priceCart(store: Store, lines: CartLine[]): PricedLine[] {
  return lines.map((line) => {
    const item = store.items.find((row) => row.id === line.itemId);
    if (!item) {
      return {
        ...line,
        name: 'Something no longer on the menu',
        photoUrl: null,
        variantName: null,
        extras: [],
        unitTotal: 0,
        lineTotal: 0,
        problem: 'GONE',
      };
    }
    const variant = item.variants.find((row) => row.id === line.variantId);
    const options = item.groups
      .flatMap((group) => group.options)
      .filter((option) => line.optionIds.includes(option.id));
    const [priced] = priceOrder({
      lines: [
        {
          unitPrice: pesewas(variant?.price ?? item.price),
          quantity: line.quantity,
          modifiers: options.map((option) => ({
            unitPriceDelta: pesewas(option.priceDelta),
            quantity: 1,
          })),
        },
      ],
    }).lines;
    const changed =
      (item.variants.length > 0 && !variant) || options.length !== line.optionIds.length;
    return {
      ...line,
      name: item.name,
      photoUrl: item.photoUrl,
      variantName: variant?.name ?? null,
      extras: options.map((option) => option.name),
      unitTotal: priced!.unitTotal,
      lineTotal: priced!.lineTotal,
      problem: item.soldOut ? 'SOLD_OUT' : changed ? 'GONE' : null,
    };
  });
}

const keyOf = (slug: string) => `brixx-cart-${slug}`;

/**
 * How long a cart that isn't ordered is kept (user request, 19 Nov): a day since it last changed.
 * Long enough for a refresh, a closed tab or coming back after lunch; not so long that last
 * week's basket greets someone who has come for something else.
 */
export const CART_KEEPS_MS = 24 * 60 * 60 * 1000;

/** The cart as it's kept: its lines and when it last changed. */
interface KeptCart {
  lines: CartLine[];
  changedAt: number;
}

/**
 * What was kept, if it's still worth bringing back. A cart from before carts were stamped
 * (a bare list) comes back once and is stamped when it next changes.
 */
export function keptLines(raw: string | null, now: number): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as CartLine[];
    const kept = parsed as Partial<KeptCart> | null;
    if (!kept || !Array.isArray(kept.lines) || typeof kept.changedAt !== 'number') return [];
    return now - kept.changedAt > CART_KEEPS_MS ? [] : kept.lines;
  } catch {
    return [];
  }
}

/** The cart kept in this browser, so a refresh or a closed tab doesn't lose it, for a day. */
export function loadCart(slug: string): CartLine[] {
  try {
    const lines = keptLines(localStorage.getItem(keyOf(slug)), Date.now());
    if (lines.length === 0) localStorage.removeItem(keyOf(slug));
    return lines;
  } catch {
    return [];
  }
}

export function saveCart(slug: string, lines: CartLine[]) {
  try {
    if (lines.length) {
      const kept: KeptCart = { lines, changedAt: Date.now() };
      localStorage.setItem(keyOf(slug), JSON.stringify(kept));
    } else localStorage.removeItem(keyOf(slug));
  } catch {
    // A private window or full storage: the cart just isn't kept.
  }
}

/** The customer's name and number, remembered on their own phone for their next order. */
export interface KnownCustomer {
  name: string;
  phone: string;
}

/** One key for every Brixx store: someone's name and number are the same at each. */
const CUSTOMER_KEY = 'brixx-customer';

/** Who ordered last on this phone, if they did (user request, 19 Nov: regulars typed it every time). */
export function knownCustomer(raw: string | null): KnownCustomer | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<KnownCustomer> | null;
    return parsed && typeof parsed.name === 'string' && typeof parsed.phone === 'string'
      ? { name: parsed.name, phone: parsed.phone }
      : null;
  } catch {
    return null;
  }
}

export function loadCustomer(): KnownCustomer | null {
  try {
    return knownCustomer(localStorage.getItem(CUSTOMER_KEY));
  } catch {
    return null;
  }
}

/** Kept after an order goes through, never while it's being typed. */
export function saveCustomer(customer: KnownCustomer) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
  } catch {
    // Not kept: they'll type it next time.
  }
}

/** "Not you?": a shared phone can forget them. */
export function forgetCustomer() {
  try {
    localStorage.removeItem(CUSTOMER_KEY);
  } catch {
    // Nothing kept to forget.
  }
}
