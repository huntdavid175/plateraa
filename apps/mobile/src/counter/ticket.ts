import { priceOrder, type Pesewas, type PricedOrder } from '@plateraa/shared';

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
