import { normalizeGhanaPhone, pesewas, type Pesewas } from '@plateraa/shared';
import type { OrderDraft } from './actions';
import type { TicketLine } from './ticket';

export type CheckoutSource = 'POS' | 'PHONE' | 'BOLT_FOOD' | 'CHOWDECK';

export const PLATFORM_NAMES: Partial<Record<CheckoutSource, string>> = {
  BOLT_FOOD: 'Bolt',
  CHOWDECK: 'Chowdeck',
};

export const isPlatform = (source: CheckoutSource) =>
  source === 'BOLT_FOOD' || source === 'CHOWDECK';

/** What the order column has collected, before the order is saved. */
export interface Checkout {
  source: CheckoutSource;
  delivery: boolean;
  phone: string;
  name: string;
  address: string;
  zoneId: string | null;
  /** Null when what was typed isn't an amount. */
  fee: Pesewas | null;
  riderKeepsFee: boolean;
  reference: string;
}

export const emptyCheckout = (source: CheckoutSource): Checkout => ({
  source,
  delivery: false,
  phone: '',
  name: '',
  address: '',
  zoneId: null,
  fee: pesewas(0),
  riderKeepsFee: false,
  reference: '',
});

/** A Ghanaian number as customers are keyed (+233…): "24 123 4567" and "024 123 4567" both work. */
export function ghanaPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return normalizeGhanaPhone(digits.length === 9 ? `0${digits}` : value);
}

/**
 * The order to save, or an error saying what's missing. Phone orders and payment links need the
 * customer's number; so does delivery by the vendor's own rider. Bolt and Chowdeck don't.
 */
export function toDraft(checkout: Checkout, lines: TicketLine[], paidByLink: boolean): OrderDraft {
  if (!lines.length) throw new Error('Add something to the order first');
  const typed = checkout.phone.trim();
  const phone = typed ? ghanaPhone(typed) : null;
  if (typed && !phone) throw new Error("That isn't a Ghanaian phone number");

  const platform = isPlatform(checkout.source);
  const ownDelivery = checkout.delivery && !platform;
  if (!phone && (checkout.source === 'PHONE' || paidByLink || ownDelivery)) {
    throw new Error(
      checkout.source === 'PHONE'
        ? "Add the caller's number: the payment link goes there"
        : paidByLink
          ? "Add the customer's number: the payment link goes there"
          : "Add the customer's number for the rider",
    );
  }
  const name = checkout.name.trim();
  const customer = phone ? { phone, ...(name ? { name } : {}) } : undefined;

  if (ownDelivery) {
    if (!checkout.address.trim()) throw new Error('Add the delivery address');
    if (checkout.fee === null) throw new Error("The delivery fee isn't an amount");
    return {
      source: checkout.source,
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
  const reference = checkout.reference.trim();
  return {
    source: checkout.source,
    type: checkout.source === 'POS' ? 'WALK_IN' : 'PICKUP',
    lines,
    customer,
    ...(platform && reference ? { externalReference: reference } : {}),
  };
}
