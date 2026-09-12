import { priceOrder, type OrderSource, type Pesewas, type PricedOrder } from '@plateraa/shared';

export interface TicketModifier {
  modifierId: string;
  name: string;
  unitPriceDelta: Pesewas;
  quantity: number;
}

/** One line of the order being typed in, with its names and prices from the tablet's menu. */
export interface TicketLine {
  lineId: string;
  itemId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  unitPrice: Pesewas;
  modifiers: TicketModifier[];
  quantity: number;
  note?: string;
}

const choiceKey = (line: TicketLine) =>
  JSON.stringify([
    line.itemId,
    line.variantId ?? '',
    line.note ?? '',
    line.modifiers.map((m) => `${m.modifierId}x${m.quantity}`).sort(),
  ]);

/** Adds a line, or one more of the same thing if it's already on the ticket. */
export function addToTicket(lines: TicketLine[], line: TicketLine): TicketLine[] {
  const key = choiceKey(line);
  const same = lines.find((existing) => choiceKey(existing) === key);
  if (!same) return [...lines, line];
  return lines.map((existing) =>
    existing === same ? { ...existing, quantity: existing.quantity + line.quantity } : existing,
  );
}

/** Changes a line's quantity; at zero the line goes. */
export function changeQuantity(lines: TicketLine[], lineId: string, by: number): TicketLine[] {
  return lines.flatMap((line) => {
    if (line.lineId !== lineId) return [line];
    const quantity = line.quantity + by;
    return quantity > 0 ? [{ ...line, quantity }] : [];
  });
}

export function replaceLine(lines: TicketLine[], updated: TicketLine): TicketLine[] {
  return lines.map((line) => (line.lineId === updated.lineId ? updated : line));
}

/** Bolt Food and Chowdeck prices set on the dashboard, keyed by `platformPriceKey`. */
export type PlatformPrices = ReadonlyMap<string, Pesewas>;

export const platformPriceKey = (source: OrderSource, itemId: string, variantId?: string | null) =>
  `${source}:${itemId}:${variantId ?? ''}`;

/**
 * The lines as an order from `source` carries them. On Bolt Food and Chowdeck each item is at the
 * platform's own price where the owner set one, so it matches what the platform charged; every
 * other source keeps the menu price. The ticket itself keeps menu prices, so changing the source
 * back puts them back.
 */
export function forSource(
  lines: TicketLine[],
  source: OrderSource,
  prices: PlatformPrices,
): TicketLine[] {
  if (source !== 'BOLT_FOOD' && source !== 'CHOWDECK') return lines;
  return lines.map((line) => {
    const price = prices.get(platformPriceKey(source, line.itemId, line.variantId));
    return price === undefined ? line : { ...line, unitPrice: price };
  });
}

/** The provisional total, from the same pricing function the server uses. */
export function priceTicket(lines: TicketLine[], deliveryFee?: Pesewas): PricedOrder {
  return priceOrder({ lines, deliveryFee });
}

/** The lines as `order.create` and `order.update_items` send them. */
export function payloadLines(lines: TicketLine[]) {
  return lines.map((line) => ({
    lineId: line.lineId,
    itemId: line.itemId,
    ...(line.variantId ? { variantId: line.variantId } : {}),
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    modifiers: line.modifiers.map(({ modifierId, unitPriceDelta, quantity }) => ({
      modifierId,
      unitPriceDelta,
      quantity,
    })),
    ...(line.note ? { note: line.note } : {}),
  }));
}
