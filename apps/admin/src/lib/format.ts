import { formatCedis, pesewas } from '@brixx/shared';

/** Pesewas as "GH₵1,234.50". */
export const cedis = (amount: number) => formatCedis(pesewas(amount));

/** Pesewas as whole cedis, for charts and tight columns: "GH₵1,235". */
export function wholeCedis(amount: number) {
  const whole = Math.round(amount / 100);
  return `GH₵${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export const count = (n: number) => n.toLocaleString('en-GH');

const ZONE = 'Africa/Accra';

/** "Tuesday 27 October" for a YYYY-MM-DD trading day. */
export function longDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** "27 Oct" for a YYYY-MM-DD day. */
export function shortDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "14:05" in Ghana. */
export function clock(at: string) {
  return new Date(at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONE,
  });
}

/** "27 Oct, 14:05" in Ghana. */
export function stamp(at: string) {
  return new Date(at).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONE,
  });
}

/** "just now", "12 min ago", "3 h ago", "4 days ago". */
export function ago(at: string | null | undefined, now = Date.now()) {
  if (!at) return 'never';
  const minutes = Math.round((now - new Date(at).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Days since a YYYY-MM-DD day, in Ghana. */
export function daysSince(date: string | null | undefined) {
  if (!date) return null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: ZONE });
  return Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
}

/** "+12%" / "−8%" / "new", against the previous period. */
export function change(now: number, before: number) {
  if (before === 0) return now === 0 ? '0%' : 'new';
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`;
}

export const percent = (share: number) => `${Math.round(share * 100)}%`;

const VENDOR_TYPES: Record<string, string> = {
  CHOP_BAR: 'Chop bar',
  FAST_FOOD: 'Fast food',
  CAFE_BAKERY: 'Café or bakery',
  JUICE: 'Juice bar',
  CLOUD_KITCHEN: 'Cloud kitchen',
  FOOD_TRUCK: 'Food truck',
  OTHER: 'Other',
};
export const vendorType = (key: string) => VENDOR_TYPES[key] ?? sentence(key);

const ORDER_WAYS: Record<string, string> = {
  WALK_INS: 'Walk-ins',
  PHONE_CALLS: 'Phone calls',
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  BOLT_FOOD: 'Bolt Food',
  CHOWDECK: 'Chowdeck',
};
export const orderWay = (key: string) => ORDER_WAYS[key] ?? sentence(key);

const ORDER_WORDS: Record<string, string> = {
  DINE_IN: 'Dine-in',
  PICKUP: 'Pickup',
  DELIVERY: 'Delivery',
  POS: 'Counter',
  PHONE: 'Phone',
  STOREFRONT: 'Online store',
  BOLT_FOOD: 'Bolt Food',
  CHOWDECK: 'Chowdeck',
};
export const orderWord = (key: string) => ORDER_WORDS[key] ?? sentence(key);

/** "PIN_RESET" → "Pin reset"; "tenant.approved" → "Tenant approved". */
export function sentence(key: string) {
  const words = key.replace(/[._]/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ACTIONS: Record<string, string> = {
  'tenant.created': 'asked to join',
  'tenant.approved': 'approved the business',
  'tenant.declined': 'declined the request',
  'tenant.suspended': 'suspended the business',
  'tenant.restored': 'restored the business',
  'device.signed_out': 'signed a tablet out',
  'device.registered': 'set up a tablet',
  'staff.pin_reset': 'reset a PIN',
  'staff.pin_changed': 'changed their PIN',
  'staff.pin_disabled': 'turned a PIN off',
  'staff.created': 'added a staff member',
  'staff.updated': 'changed a staff member',
  'item.removed': 'removed a menu item',
  'item.sold_out': 'marked an item sold out',
  'item.photo': 'changed an item photo',
  'refund.recorded': 'recorded a refund',
  'order.discount_set': 'discounted an order',
  'order.flagged': 'flagged an order',
  'payment.recorded': 'recorded a payment',
  'payment_link.requested': 'sent a payment link',
  'shift.opened': 'opened a drawer',
  'shift.closed': 'closed a drawer',
  'shift.payout': 'paid out of a drawer',
  'shift.cash_movement': 'moved cash in a drawer',
  'stock.counted': 'counted stock',
  'customer.updated': 'changed a customer',
  'settings.storefront': 'changed store settings',
  'settings.revenue_visibility': 'changed who sees sales',
  'delivery_zone.saved': 'saved a delivery zone',
  'delivery_zone.removed': 'removed a delivery zone',
};
export const actionWords = (action: string) => ACTIONS[action] ?? sentence(action).toLowerCase();

export const STATUS_WORDS: Record<string, string> = {
  ACTIVE: 'Open',
  PENDING: 'Waiting',
  SUSPENDED: 'Suspended',
  DECLINED: 'Declined',
};

/** What a tablet warning means, in a support person's words. */
export function tabletAlertWords(alert: { kind: string; count: number; since: string | null }) {
  switch (alert.kind) {
    case 'STUCK':
      return `Stuck: ${alert.count} change${alert.count === 1 ? '' : 's'} won't upload`;
    case 'OUT_OF_TOUCH':
      return `Out of touch ${ago(alert.since)} with its drawer open`;
    case 'WAITING':
      return `${alert.count} change${alert.count === 1 ? '' : 's'} waiting since ${ago(alert.since)}`;
    case 'REFUSED':
      return `${alert.count} change${alert.count === 1 ? '' : 's'} refused today`;
    default:
      return sentence(alert.kind);
  }
}

/** +233241234567 → "024 123 4567", as Ghanaians say it. */
export function localPhone(phone: string | null | undefined) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  const national = digits.startsWith('233') ? `0${digits.slice(3)}` : digits;
  return national.replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3');
}

/** A YYYY-MM-DD trading day in words: "today", "yesterday", "9 days ago". */
export function dayAgo(date: string | null | undefined) {
  const days = daysSince(date);
  if (days === null) return 'never';
  if (days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** A space that never collapses, for a figure's suffix ("9 of 11"): Arc's metric card trims plain ones. */
export const NBSP = String.fromCharCode(0xa0);
