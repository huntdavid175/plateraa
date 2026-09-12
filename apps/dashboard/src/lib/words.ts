import type {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentLinkStatus,
  PaymentMethod,
  Role,
  VendorType,
} from '@plateraa/shared';

export const VENDOR_TYPE_WORDS: Record<VendorType, string> = {
  CHOP_BAR: 'Chop bar',
  FAST_FOOD: 'Fast food',
  CAFE_BAKERY: 'Café or bakery',
  JUICE: 'Juice spot',
  CLOUD_KITCHEN: 'Cloud kitchen',
  FOOD_TRUCK: 'Food truck',
  OTHER: 'Food business',
};

export const ROLE_WORDS: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
  RIDER: 'Rider',
};

/** The same words the tablet uses. */
export const SOURCE_WORDS: Record<OrderSource, string> = {
  POS: 'Walk-in',
  PHONE: 'Phone',
  STOREFRONT: 'Online',
  BOLT_FOOD: 'Bolt',
  CHOWDECK: 'Chowdeck',
  OTHER: 'Other',
};

export const STATUS_WORDS: Record<OrderStatus, string> = {
  NEW: 'New',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export const TYPE_WORDS: Record<OrderType, string> = {
  WALK_IN: 'Eat in or take away',
  PICKUP: 'Pickup',
  DELIVERY: 'Delivery',
};

export const METHOD_WORDS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  LINK: 'Payment link',
  PLATFORM: 'Paid via platform',
};

/** Why the server flagged an order for the owner to look at. */
export const REVIEW_WORDS: Record<string, string> = {
  PRICE_MISMATCH: 'A price on this order didn’t match the menu when it synced.',
  UNAPPROVED_DISCOUNT: 'This order has a discount no manager applied.',
};

/** "+233241234567" as people write it: "024 123 4567". */
export function phoneWords(phone: string): string {
  if (!/^\+233\d{9}$/.test(phone)) return phone;
  const national = `0${phone.slice(4)}`;
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/** A payment link's state, in the tablet's words, with the colour that goes with it. */
export function linkWords(link: {
  status: PaymentLinkStatus;
  phone: string;
  failure: string | null;
}): { text: string; tone: 'blue' | 'green' | 'amber' | 'red' } {
  switch (link.status) {
    case 'QUEUED':
      return {
        text: `Payment link to ${phoneWords(link.phone)} goes out as soon as the tablet is online.`,
        tone: 'blue',
      };
    case 'SENT':
      return {
        text: `Payment link texted to ${phoneWords(link.phone)}. Waiting for them to pay.`,
        tone: 'blue',
      };
    case 'PAID':
      return { text: `Paid by payment link from ${phoneWords(link.phone)}.`, tone: 'green' };
    case 'FAILED':
      return {
        text: `The payment link didn’t go. ${link.failure ?? 'Send it again from the tablet.'}`,
        tone: 'red',
      };
    case 'EXPIRED':
      return { text: 'The payment link expired unpaid.', tone: 'amber' };
  }
}
