import { useState } from 'react';
import { Outlet } from 'react-router';
import { queryClient, type Me } from '../lib/query';
import { useSession } from '../lib/session';
import type { Drawer } from '../lib/manager';
import type { OrderRow } from '../lib/orders';
import type { DaySummary } from '../lib/reports';
import type { Tablet } from '../lib/team';
import { ShellFrame } from '../shell/Shell';

/*
 * Development only (`pnpm dev`; the built dashboard leaves it out): the real screens inside the
 * real frame at /__preview, filled with made-up sample data instead of calling the API, so a
 * screen can be looked at (and screenshotted) without signing in. It never touches the saved
 * login. Add a screen's queries to `seed` when its step of the rework is built.
 */

const ME = {
  businessName: 'Auntie Ama’s Kitchen',
  vendorType: 'CHOP_BAR',
  displayName: 'Ama Owusu',
  role: 'OWNER',
  capabilities: [
    'reports.revenue.view',
    'refunds.record',
    'payouts.record',
    'devices.manage',
    'catalog.manage',
    'storefront.manage',
    'staff.manage',
    'expenses.manage',
    'customers.manage',
  ],
  offersDineIn: true,
} as unknown as Me;

const today = new Date().toLocaleDateString('en-CA');
const at = (hour: number, minute: number) => {
  const moment = new Date();
  moment.setHours(hour, minute, 0, 0);
  return moment.toISOString();
};

const DAY = {
  date: today,
  orders: 38,
  sales: 248_000,
  moneyIn: 231_500,
  notYetCollected: 16_500,
  platformOwed: 0,
  unpaid: 16_500,
  commissionEstimate: 0,
  moneyOut: 64_000,
  expenses: 3,
  left: 167_500,
  profit: 184_000,
  byHour: [
    { hour: 7, orders: 2, moneyIn: 9_000 },
    { hour: 8, orders: 5, moneyIn: 27_500 },
    { hour: 9, orders: 3, moneyIn: 16_000 },
    { hour: 11, orders: 6, moneyIn: 39_000 },
    { hour: 12, orders: 11, moneyIn: 72_000 },
    { hour: 13, orders: 7, moneyIn: 44_000 },
    { hour: 14, orders: 4, moneyIn: 24_000 },
  ],
  bySource: [],
  byType: [
    { type: 'DINE_IN', orders: 9, sales: 52_000 },
    { type: 'PICKUP', orders: 23, sales: 151_000 },
    { type: 'DELIVERY', orders: 6, sales: 45_000 },
  ],
  byMethod: [
    { method: 'CASH', amount: 158_000 },
    { method: 'LINK', amount: 73_500 },
  ],
} as unknown as DaySummary;

const order = (
  n: string,
  type: string,
  items: [string, number][],
  total: number,
  paid: number,
  extra: Record<string, unknown> = {},
) =>
  ({
    id: `order-${n}`,
    displayNumber: n,
    businessDate: today,
    status: 'PREPARING',
    type,
    source: n.startsWith('W') ? 'STOREFRONT' : 'POS',
    items: items.map(([name, quantity]) => ({ name, quantity })),
    total,
    amountDue: total,
    amountPaid: paid,
    refundOwed: 0,
    takenAt: at(13, 40),
    takenBy: 'Kofi',
    ...extra,
  }) as unknown as OrderRow;

const RECENT = [
  order(
    'A38',
    'PICKUP',
    [
      ['Jollof with chicken', 2],
      ['Sobolo', 2],
    ],
    9_000,
    9_000,
  ),
  order('W12', 'DELIVERY', [['Waakye special', 1]], 6_500, 6_500),
  order(
    'A37',
    'DINE_IN',
    [
      ['Banku and tilapia', 1],
      ['Kelewele', 1],
    ],
    8_500,
    0,
  ),
  order('A36', 'PICKUP', [['Fried rice', 3]], 12_000, 12_000),
  order('A35', 'PICKUP', [['Kenkey and fish', 1]], 3_500, 3_500, {
    status: 'CANCELLED',
    refundOwed: 3_500,
  }),
];

const TABLETS = [
  {
    id: 'tablet-2',
    name: 'Counter 2',
    alerts: [{ kind: 'WAITING', count: 4, since: at(12, 50) }],
  },
] as unknown as Tablet[];

const DRAWERS = [
  {
    shiftId: 'shift-1',
    deviceName: 'Counter 1',
    openedAt: at(6, 45),
    openedBy: 'Kofi',
    expectedCash: 142_000,
  },
] as unknown as Drawer[];

/** The whole day's list, for Orders: the recent five and more like them. */
const DAY_ORDERS = [
  ...RECENT.map((row) => row),
  ...Array.from({ length: 7 }, (_, index) =>
    order(
      `A${34 - index}`,
      index % 3 ? 'PICKUP' : 'DINE_IN',
      [['Jollof with chicken', 1 + (index % 2)]],
      4_500 * (1 + (index % 2)),
      4_500 * (1 + (index % 2)),
      {
        takenAt: at(12, 50 - index * 5),
        takenBy: index % 2 ? 'Kofi' : 'Esi',
      },
    ),
  ),
];

/** One order in full: cancelled after it was paid, so a refund is owed. */
const ORDER_DETAIL = {
  ...RECENT[4],
  id: 'order-A35',
  takenAt: at(12, 41),
  takenBy: 'Kofi',
  onHold: false,
  status: 'CANCELLED',
  cancelReason: 'The customer left before it was ready.',
  reviewReasons: [],
  items: [
    {
      name: 'Kenkey and fish',
      quantity: 1,
      variantName: 'Large',
      modifiers: [{ name: 'Extra shito', quantity: 1, unitPriceDelta: 500 }],
      note: 'No pepper',
      lineTotal: 3_500,
    },
  ],
  subtotal: 3_500,
  discount: 0,
  deliveryFee: 0,
  deliveryFeeCollectedBy: null,
  total: 3_500,
  amountDue: 3_500,
  amountPaid: 3_500,
  refundOwed: 3_500,
  payments: [
    {
      id: 'pay-1',
      method: 'LINK',
      status: 'CONFIRMED',
      at: at(12, 43),
      by: null,
      amount: 3_500,
      tendered: null,
    },
  ],
  refunds: [],
  links: [
    {
      id: 'link-1',
      status: 'PAID',
      phone: '+233241234567',
      failure: null,
      amount: 3_500,
      at: at(12, 42),
    },
  ],
  customerName: 'Yaw Mensah',
  customerPhone: '+233241234567',
  customerId: 'customer-1',
  deliveryAddress: null,
  note: null,
  externalReference: null,
  history: [
    { to: 'NEW', at: at(12, 41), by: 'Kofi' },
    { to: 'PREPARING', at: at(12, 43), by: null },
    { to: 'CANCELLED', at: at(12, 58), by: 'Kofi' },
  ],
};

/** What each screen's queries would have fetched. Keys match the screens' own. */
function seed(tenant: string | null) {
  // Sample data never goes stale here, so nothing is fetched over it.
  queryClient.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } });
  queryClient.setQueryData(['day', tenant, 'today'], DAY);
  queryClient.setQueryData(['orders', tenant, { limit: 5 }], RECENT);
  queryClient.setQueryData(['refunds-owed', tenant], [RECENT[4]]);
  queryClient.setQueryData(['tablets', tenant], TABLETS);
  queryClient.setQueryData(['drawers', tenant], DRAWERS);
  queryClient.setQueryData(['orders', tenant, { date: today, limit: 500 }], DAY_ORDERS);
  queryClient.setQueryData(['order', tenant, 'order-A35'], ORDER_DETAIL);
}

export default function Preview() {
  // Under whichever business this browser has chosen (none in a fresh one), as the screens key it.
  const { tenantId } = useSession();
  useState(() => seed(tenantId));
  return (
    <ShellFrame me={ME}>
      <Outlet context={ME} />
    </ShellFrame>
  );
}
