import {
  ArrowLeftRight,
  Ban,
  Banknote,
  BookOpenText,
  Building2,
  CircleCheck,
  CircleSlash,
  CircleX,
  Coins,
  Eye,
  Flag,
  HandCoins,
  History,
  ImageIcon,
  Inbox,
  KeyRound,
  Link2,
  LogOut,
  MapPin,
  Package,
  Percent,
  ReceiptText,
  RotateCcw,
  Settings,
  Store,
  Tablet,
  Trash2,
  Undo2,
  UserCog,
  UserPlus,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { TimelineEvent } from '@/components/arc/timeline/timeline';

type Tone = NonNullable<TimelineEvent['tone']>;

/**
 * The icon for each part of a business, the same ones the vendor dashboard's sidebar uses (Menu is
 * the book, Cash the coins), so the team and the vendor see the same pictures.
 */
const AREA_ICONS: Record<string, LucideIcon> = {
  tenant: Building2,
  device: Tablet,
  staff: UserCog,
  item: BookOpenText,
  refund: Undo2,
  order: ReceiptText,
  payment: Banknote,
  payment_link: Link2,
  shift: Coins,
  stock: Package,
  customer: UserRound,
  settings: Settings,
  storefront: Store,
  delivery_zone: MapPin,
  expense: Wallet,
};

/**
 * Where one action needs its own icon or a colour. Colour marks an outcome someone may want to
 * see at a glance: green when a business can go on (approved, paid), amber for something to look
 * at (flagged, refunded, sold out), red when a business is stopped. Everything else stays quiet.
 */
const ACTION_LOOKS: Record<string, { icon?: LucideIcon; tone?: Tone }> = {
  'tenant.created': { icon: Inbox },
  'tenant.approved': { icon: CircleCheck, tone: 'success' },
  'tenant.declined': { icon: CircleX, tone: 'danger' },
  'tenant.suspended': { icon: Ban, tone: 'danger' },
  'tenant.restored': { icon: RotateCcw, tone: 'success' },
  'device.signed_out': { icon: LogOut, tone: 'warning' },
  'staff.created': { icon: UserPlus },
  'staff.pin_reset': { icon: KeyRound },
  'staff.pin_changed': { icon: KeyRound },
  'staff.pin_disabled': { icon: KeyRound },
  'item.photo': { icon: ImageIcon },
  'item.sold_out': { icon: CircleSlash, tone: 'warning' },
  'item.back_in_stock': { icon: CircleCheck, tone: 'success' },
  'item.removed': { icon: Trash2 },
  'refund.recorded': { tone: 'warning' },
  'order.discount_set': { icon: Percent },
  'order.flagged': { icon: Flag, tone: 'warning' },
  'payment.recorded': { tone: 'success' },
  'shift.payout': { icon: HandCoins },
  'shift.cash_movement': { icon: ArrowLeftRight },
  'settings.storefront': { icon: Store },
  'settings.revenue_visibility': { icon: Eye },
  'settings.moolre_account': { icon: Wallet },
  'settings.commissions': { icon: Percent },
  'storefront.cover': { icon: ImageIcon },
  'storefront.logo': { icon: ImageIcon },
  'delivery_zone.removed': { icon: Trash2 },
  'expense.removed': { icon: Trash2 },
  'stock.item_removed': { icon: Trash2 },
};

/** The icon and colour in an action's circle in a feed, so no circle is ever empty. */
export function actionMarker(action: string): Pick<TimelineEvent, 'icon' | 'tone'> {
  const look = ACTION_LOOKS[action];
  const Icon = look?.icon ?? AREA_ICONS[action.split('.')[0] ?? ''] ?? History;
  return { icon: <Icon aria-hidden />, tone: look?.tone ?? 'neutral' };
}
