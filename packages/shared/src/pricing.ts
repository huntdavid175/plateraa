import { ZERO, add, bpsOf, min, mul, pesewas, sub, type Pesewas } from './money.js';

export class PricingError extends Error {
  override name = 'PricingError';
}

export interface ModifierInput {
  /** Price change per unit of the modifier; may be negative ("no drink") but the line can't go below zero. */
  unitPriceDelta: Pesewas;
  quantity: number;
}

export interface LineInput {
  /** Unit price snapshot of the item or variant when the order was taken. */
  unitPrice: Pesewas;
  quantity: number;
  modifiers?: readonly ModifierInput[];
}

export type Discount = { kind: 'percent'; bps: number } | { kind: 'amount'; amount: Pesewas };

export interface OrderInput {
  lines: readonly LineInput[];
  discount?: Discount | null;
  deliveryFee?: Pesewas;
}

export interface PricedLine {
  /** Unit price including modifiers. */
  unitTotal: Pesewas;
  lineTotal: Pesewas;
}

export interface PricedOrder {
  lines: PricedLine[];
  subtotal: Pesewas;
  discount: Pesewas;
  deliveryFee: Pesewas;
  total: Pesewas;
}

function assertQuantity(quantity: number, what: string): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new PricingError(
      `${what} quantity must be a whole number of at least 1, got ${quantity}`,
    );
  }
}

function priceLine(line: LineInput): PricedLine {
  assertQuantity(line.quantity, 'Line');
  if (line.unitPrice < 0) throw new PricingError(`Unit price can't be negative: ${line.unitPrice}`);

  let unitTotal = line.unitPrice;
  for (const modifier of line.modifiers ?? []) {
    assertQuantity(modifier.quantity, 'Modifier');
    unitTotal = add(unitTotal, mul(modifier.unitPriceDelta, modifier.quantity));
  }
  if (unitTotal < 0)
    throw new PricingError(`Modifiers take the unit price below zero: ${unitTotal}`);

  return { unitTotal, lineTotal: mul(unitTotal, line.quantity) };
}

function priceDiscount(subtotal: Pesewas, discount: Discount | null | undefined): Pesewas {
  if (!discount) return ZERO;
  if (discount.kind === 'percent') return bpsOf(subtotal, discount.bps);
  if (discount.amount < 0) throw new PricingError(`Discount can't be negative: ${discount.amount}`);
  return min(discount.amount, subtotal);
}

/**
 * The one pricing function. The phone uses it for provisional totals, the server for the
 * authoritative ones, so both always agree on the same inputs.
 */
export function priceOrder(input: OrderInput): PricedOrder {
  const lines = input.lines.map(priceLine);
  const subtotal = add(...lines.map((line) => line.lineTotal));
  const discount = priceDiscount(subtotal, input.discount);
  const deliveryFee = input.deliveryFee ?? pesewas(0);
  if (deliveryFee < 0) throw new PricingError(`Delivery fee can't be negative: ${deliveryFee}`);

  return {
    lines,
    subtotal,
    discount,
    deliveryFee,
    total: add(sub(subtotal, discount), deliveryFee),
  };
}
