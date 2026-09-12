import type { Role, VendorType } from '@plateraa/shared';

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
