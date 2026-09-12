import type { OrderSource, PaymentMethod, Role, VendorType } from '@plateraa/shared';

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

export const SOURCE_WORDS: Record<OrderSource, string> = {
  POS: 'Walk-in',
  PHONE: 'Phone',
  STOREFRONT: 'Storefront',
  BOLT_FOOD: 'Bolt',
  CHOWDECK: 'Chowdeck',
  OTHER: 'Other',
};

export const METHOD_WORDS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  LINK: 'Payment link',
  PLATFORM: 'Paid via platform',
};
