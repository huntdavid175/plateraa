import { normalizeGhanaPhone, pesewas, type OrderType, type Pesewas } from '@brixx/shared';
import type { OrderDraft } from './actions';
import type { TicketLine } from './ticket';

/** What the order column has collected, before the order is saved. */
export interface Checkout {
  /** Dine-in, pickup or delivery. */
  type: OrderType;
  phone: string;
  name: string;
  address: string;
  zoneId: string | null;
  /** Null when what was typed isn't an amount. */
  fee: Pesewas | null;
  riderKeepsFee: boolean;
}

export const emptyCheckout = (type: OrderType): Checkout => ({
  type,
  phone: '',
  name: '',
  address: '',
  zoneId: null,
  fee: pesewas(0),
  riderKeepsFee: false,
});

/** A Ghanaian number as customers are keyed (+233…): "24 123 4567" and "024 123 4567" both work. */
export function ghanaPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return normalizeGhanaPhone(digits.length === 9 ? `0${digits}` : value);
}

/**
 * The order to save, or an error saying what's missing. Every order is typed in at the counter,
 * a phone call's too. A payment link needs the customer's number, and so does a delivery.
 */
export function toDraft(checkout: Checkout, lines: TicketLine[], paidByLink: boolean): OrderDraft {
  if (!lines.length) throw new Error('Add something to the order first');
  const typed = checkout.phone.trim();
  const phone = typed ? ghanaPhone(typed) : null;
  if (typed && !phone) throw new Error("That isn't a Ghanaian phone number");

  const delivery = checkout.type === 'DELIVERY';
  if (!phone && (paidByLink || delivery)) {
    throw new Error(
      paidByLink
        ? "Add the customer's number: the payment link goes there"
        : "Add the customer's number for the rider",
    );
  }
  const name = checkout.name.trim();
  const customer = phone ? { phone, ...(name ? { name } : {}) } : undefined;

  if (delivery) {
    if (!checkout.address.trim()) throw new Error('Add the delivery address');
    if (checkout.fee === null) throw new Error("The delivery fee isn't an amount");
    return {
      source: 'POS',
      type: 'DELIVERY',
      lines,
      customer,
      delivery: {
        address: checkout.address.trim(),
        ...(checkout.zoneId ? { zoneId: checkout.zoneId } : {}),
        fee: checkout.fee,
        feeCollectedBy: checkout.riderKeepsFee ? 'RIDER' : 'VENDOR',
      },
    };
  }
  return { source: 'POS', type: checkout.type, lines, customer };
}
