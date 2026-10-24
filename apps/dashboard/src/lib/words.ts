import type {
  ExpenseCategory,
  OrderSource,
  OrderStatus,
  OrderWay,
  OrderType,
  PaymentLinkStatus,
  PaymentMethod,
  Role,
  VendorType,
} from '@brixx/shared';

/** How a business takes orders before Brixx, asked when it requests to join. */
export const ORDER_WAY_WORDS: Record<OrderWay, string> = {
  WALK_INS: 'Walk-ins at the counter',
  PHONE_CALLS: 'Phone calls',
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  BOLT_FOOD: 'Bolt Food',
  CHOWDECK: 'Chowdeck',
};

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
  POS: 'Counter',
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
  DINE_IN: 'Dine-in',
  PICKUP: 'Pickup',
  DELIVERY: 'Delivery',
};

/**
 * What kind of order it is, as the tablet says it: "Dine-in", or "Bolt · Pickup" for one that
 * didn't come in at the counter (older phone orders, and later the platforms' own).
 */
export function kindWords(order: { source: OrderSource; type: OrderType }): string {
  return order.source === 'POS'
    ? TYPE_WORDS[order.type]
    : `${SOURCE_WORDS[order.source]} · ${TYPE_WORDS[order.type]}`;
}

export const METHOD_WORDS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  LINK: 'Payment link',
  PLATFORM: 'Paid via platform',
};

/** How money went back to a customer. */
export const REFUND_METHOD_WORDS = { CASH: 'Cash', LINK: 'Mobile money' } as const;

export const EXPENSE_WORDS: Record<ExpenseCategory, string> = {
  INGREDIENTS: 'Ingredients',
  GAS: 'Gas',
  PACKAGING: 'Packaging',
  TRANSPORT: 'Transport',
  RENT: 'Rent',
  ELECTRICITY: 'Electricity',
  WATER: 'Water',
  SALARIES: 'Wages',
  AIRTIME_DATA: 'Airtime and data',
  RIDER_PAYMENTS: 'Rider payments',
  MARKETING: 'Marketing',
  OTHER: 'Other',
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
