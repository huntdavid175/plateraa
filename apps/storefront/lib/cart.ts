import { pesewas, priceOrder } from '@plateraa/shared';
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

const keyOf = (slug: string) => `plateraa-cart-${slug}`;

/** The cart kept in this browser, so a refresh or a closed tab doesn't lose it. */
export function loadCart(slug: string): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(keyOf(slug)) ?? '[]');
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function saveCart(slug: string, lines: CartLine[]) {
  try {
    if (lines.length) localStorage.setItem(keyOf(slug), JSON.stringify(lines));
    else localStorage.removeItem(keyOf(slug));
  } catch {
    // A private window or full storage: the cart just isn't kept.
  }
}
