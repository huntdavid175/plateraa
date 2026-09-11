// Value lists shared by the database schema and every client, so they can never drift apart.

export const TENANT_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const VENDOR_TYPES = [
  'CHOP_BAR',
  'FAST_FOOD',
  'CAFE_BAKERY',
  'JUICE',
  'CLOUD_KITCHEN',
  'FOOD_TRUCK',
  'OTHER',
] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

/**
 * Where an order came from. POS = typed in at the counter. No WhatsApp or Instagram: vendors put
 * their storefront link there, so those customers order on the storefront.
 */
export const ORDER_SOURCES = [
  'POS',
  'PHONE',
  'STOREFRONT',
  'BOLT_FOOD',
  'CHOWDECK',
  'OTHER',
] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const STATIONS = ['KITCHEN', 'DRINKS'] as const;
export type Station = (typeof STATIONS)[number];

/** Manually recorded methods only. Moolre methods arrive with R1.5. */
export const PAYMENT_METHODS = ['CASH', 'PLATFORM'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['PENDING', 'CONFIRMED', 'FAILED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Who kept the delivery fee: if the rider kept it, it isn't the vendor's money in. */
export const DELIVERY_FEE_COLLECTORS = ['VENDOR', 'RIDER'] as const;
export type DeliveryFeeCollector = (typeof DELIVERY_FEE_COLLECTORS)[number];

export const SHIFT_STATUSES = ['OPEN', 'CLOSED'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

/** Drawer movements other than sales and refunds (those come from payments and refunds). */
export const CASH_MOVEMENT_TYPES = ['PAYOUT', 'DROP', 'PAY_IN'] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export const STOCK_KINDS = ['SELLABLE', 'RAW'] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

export const STOCK_MOVEMENT_TYPES = ['PREP', 'SALE', 'PURCHASE', 'COUNT_ADJUST', 'WASTE'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const EXPENSE_CATEGORIES = [
  'INGREDIENTS',
  'GAS',
  'PACKAGING',
  'TRANSPORT',
  'RENT',
  'ELECTRICITY',
  'WATER',
  'SALARIES',
  'AIRTIME_DATA',
  'RIDER_PAYMENTS',
  'MARKETING',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_METHODS = ['CASH_DRAWER', 'OWNER_CASH', 'MOMO', 'BANK', 'OTHER'] as const;
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

export const APPROVAL_ACTIONS = ['REFUND', 'PAYOUT', 'DISCOUNT', 'PRICE_OVERRIDE'] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'DENIED', 'EXPIRED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_METHODS = ['ON_SITE_PIN', 'PUSH', 'OFFLINE_CODE'] as const;
export type ApprovalMethod = (typeof APPROVAL_METHODS)[number];
