import { STOREFRONT_THEMES } from '@plateraa/shared';
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
    'settings.manage',
    'discounts.apply',
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
    id: 'tablet-1',
    name: 'Counter 1',
    code: 'A',
    signedOut: false,
    lastSeenAt: at(13, 39),
    lastSyncedAt: at(13, 38),
    alerts: [],
  },
  {
    id: 'tablet-2',
    name: 'Counter 2',
    code: 'B',
    signedOut: false,
    lastSeenAt: at(12, 50),
    lastSyncedAt: at(12, 40),
    alerts: [{ kind: 'WAITING', count: 4, since: at(12, 50) }],
  },
] as unknown as Tablet[];

const TEAM = {
  staff: [
    ['me', 'Ama Owusu', 'OWNER', true, false, true, true],
    ['st1', 'Kofi Mensah', 'MANAGER', true, false, true, false],
    ['st2', 'Esi Asante', 'STAFF', true, true, true, false],
    ['st3', 'Yaw Boateng', 'RIDER', true, false, false, false],
    ['st4', 'Abena Darko', 'STAFF', false, false, true, false],
  ].map(([id, displayName, role, active, pinLocked, hasPin, you]) => ({
    id,
    displayName,
    role,
    active,
    pinLocked,
    hasPin,
    you,
    seesRevenue: null,
  })),
  revenueByRole: { MANAGER: true, STAFF: false, RIDER: false },
};

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

const daysAgo = (days: number) => {
  const day = new Date();
  day.setDate(day.getDate() - days);
  return day.toLocaleDateString('en-CA');
};

const CUSTOMERS = [
  ['customer-1', 'Yaw Mensah', '+233241234567', 14, 0, 98_500],
  ['customer-2', 'Akosua Boateng', '+233201112233', 9, 1, 61_000],
  ['customer-3', null, '+233559876543', 3, 2, 19_500],
  ['customer-4', 'Kwame Asante', '+233271234500', 22, 4, 154_000],
  ['customer-5', 'Efua Darko', '+233244550011', 1, 9, 6_500],
].map(([id, name, phone, orders, ago, spent]) => ({
  id,
  name,
  phone,
  orders,
  lastOrderOn: daysAgo(ago as number),
  spent,
}));

const CUSTOMER_DETAIL = {
  ...CUSTOMERS[0],
  notes: 'Gate is on the left. Call on arrival.',
  firstOrderOn: daysAgo(60),
  recentOrders: [
    RECENT[4],
    order('A12', 'DELIVERY', [['Waakye special', 2]], 13_000, 13_000, { businessDate: daysAgo(2) }),
    order('W7', 'PICKUP', [['Jollof with chicken', 1]], 4_500, 4_500, { businessDate: daysAgo(5) }),
  ],
};

const menuItem = (
  id: string,
  name: string,
  categoryId: string,
  price: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name,
  categoryId,
  price,
  costPrice: null,
  prepMinutes: null,
  station: 'KITCHEN',
  variants: [],
  groups: [],
  soldOutToday: false,
  photoUrl: null,
  channelPrices: {},
  ...extra,
});

const MENU = {
  categories: [
    { id: 'rice', name: 'Rice' },
    { id: 'local', name: 'Local dishes' },
    { id: 'drinks', name: 'Drinks' },
  ],
  items: [
    menuItem('jollof', 'Jollof with chicken', 'rice', 4_500, {
      costPrice: 2_600,
      prepMinutes: 10,
      variants: [
        { id: 'v1', name: 'Regular', price: 4_500, costPrice: 2_600, channelPrices: {} },
        { id: 'v2', name: 'Large', price: 6_000, costPrice: 3_300, channelPrices: {} },
      ],
      groups: [
        {
          id: 'g1',
          name: 'Choose your protein',
          required: true,
          maxSelect: 1,
          options: [
            { id: 'o1', name: 'Chicken', priceDelta: 0 },
            { id: 'o2', name: 'Fish', priceDelta: 500 },
          ],
          sharedWith: ['Fried rice'],
        },
      ],
    }),
    menuItem('fried-rice', 'Fried rice', 'rice', 4_000, { costPrice: 2_900, prepMinutes: 12 }),
    menuItem('waakye', 'Waakye special', 'local', 6_500, { soldOutToday: true }),
    menuItem('banku', 'Banku and tilapia', 'local', 7_000, { costPrice: 4_200, prepMinutes: 20 }),
    menuItem('kelewele', 'Kelewele', 'local', 1_500),
    menuItem('sobolo', 'Sobolo', 'drinks', 1_000, { station: 'DRINKS' }),
  ],
};

/** What each screen's queries would have fetched. Keys match the screens' own. */
function seed(tenant: string | null) {
  // Sample data never goes stale here, so nothing is fetched over it.
  queryClient.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } });
  queryClient.setQueryData(['day', tenant, 'today'], DAY);
  queryClient.setQueryData(['orders', tenant, { limit: 8 }], DAY_ORDERS.slice(0, 8));
  queryClient.setQueryData(['refunds-owed', tenant], [{ ...RECENT[4], paidWith: ['LINK'] }]);
  queryClient.setQueryData(['tablets', tenant], TABLETS);
  queryClient.setQueryData(['team', tenant], TEAM);
  queryClient.setQueryData(['settings', tenant], {
    business: { name: 'Auntie Ama’s Kitchen', vendorType: 'CHOP_BAR' },
    orders: {
      offersDineIn: true,
      requirePaymentBeforePrep: true,
      countPortions: false,
      idleLockSeconds: 300,
    },
    moolre: {
      connected: true,
      accountEnding: '4821',
      apiUser: 'auntieama',
      email: 'ama@example.com',
    },
  });
  queryClient.setQueryData(
    ['zones', tenant],
    [
      { id: 'z1', name: 'Osu', fee: 1_500, active: true },
      { id: 'z2', name: 'Labone', fee: 2_000, active: true },
      { id: 'z3', name: 'Airport', fee: 3_500, active: false },
    ],
  );
  queryClient.setQueryData(['drawers', tenant], DRAWERS);
  queryClient.setQueryData(['orders', tenant, { date: today, limit: 500 }], DAY_ORDERS);
  queryClient.setQueryData(['order', tenant, 'order-A35'], ORDER_DETAIL);
  queryClient.setQueryData(['customers', tenant, ''], CUSTOMERS);
  queryClient.setQueryData(['customer', tenant, 'customer-1'], CUSTOMER_DETAIL);
  queryClient.setQueryData(['menu', tenant], MENU);
  queryClient.setQueryData(
    ['orders', tenant, { source: 'STOREFRONT', limit: 100 }],
    [
      order('W12', 'DELIVERY', [['Waakye special', 1]], 6_500, 6_500, { takenAt: at(13, 22) }),
      order('W11', 'PICKUP', [['Jollof with chicken', 2]], 9_000, 9_000, { takenAt: at(12, 5) }),
      order('W10', 'PICKUP', [['Fried rice', 1]], 4_000, 0, { takenAt: at(11, 48) }),
    ],
  );
  queryClient.setQueryData(['period', tenant, daysAgo(6), today], {
    from: daysAgo(6),
    to: today,
    totals: {
      sales: 1_412_000,
      orders: 241,
      moneyIn: 1_350_500,
      moneyOut: 102_500,
      profit: 1_248_000,
      platformOwed: 0,
      commissionEstimate: 0,
      purchases: 45_000,
      otherExpenses: 57_500,
    },
    byHour: DAY.byHour.map((row) => ({ ...row, orders: row.orders * 6 })),
    byItem: [
      { name: 'Jollof with chicken', quantity: 96, sales: 462_000 },
      { name: 'Waakye special', quantity: 41, sales: 266_500 },
      { name: 'Banku and tilapia', quantity: 28, sales: 196_000 },
      { name: 'Fried rice', quantity: 37, sales: 148_000 },
      { name: 'Sobolo', quantity: 88, sales: 88_000 },
    ],
    byDay: [6, 5, 4, 3, 2, 1, 0].map((ago, index) => ({
      date: daysAgo(ago),
      orders: 30 + ((index * 7) % 12),
      sales: 180_000 + ((index * 23_000) % 90_000),
      moneyIn: 170_000 + ((index * 21_000) % 90_000),
      moneyOut: ago % 3 === 0 ? 30_000 : 8_500,
    })),
    byType: DAY.byType,
    byMethod: [
      { method: 'CASH', amount: 902_000 },
      { method: 'LINK', amount: 448_500 },
    ],
    byCategory: [
      { category: 'INGREDIENTS', amount: 45_000 },
      { category: 'ELECTRICITY', amount: 30_000 },
      { category: 'GAS', amount: 19_000 },
      { category: 'PACKAGING', amount: 8_500 },
    ],
    staff: [
      { staffId: 'st1', name: 'Kofi', orders: 132, sales: 781_000, cash: 512_000 },
      { staffId: 'st2', name: 'Esi', orders: 109, sales: 631_000, cash: 390_000 },
    ],
    drawerCloses: [
      {
        shiftId: 'sh1',
        tablet: 'Counter 1',
        closedAt: at(21, 5),
        closedBy: 'Kofi',
        expected: 142_000,
        counted: 140_500,
        variance: -1_500,
      },
      {
        shiftId: 'sh2',
        tablet: 'Counter 2',
        closedAt: at(21, 12),
        closedBy: 'Esi',
        expected: 96_000,
        counted: 96_000,
        variance: 0,
      },
    ],
  });
  const expense = (id: string, ago: number, category: string, amount: number, extra = {}) => ({
    id,
    spentOn: daysAgo(ago),
    category,
    amount,
    method: 'OWNER_CASH',
    by: 'Ama Owusu',
    purchase: null,
    supplierName: null,
    note: null,
    fromDrawer: false,
    ...extra,
  });
  queryClient.setQueryData(
    ['expenses', tenant, { from: daysAgo(6), to: today }],
    [
      expense('e1', 0, 'INGREDIENTS', 45_000, {
        purchase: { quantity: 1, unit: 'bag', name: 'Rice' },
        supplierName: 'Makola market',
      }),
      expense('e2', 0, 'GAS', 19_000, { method: 'CASH_DRAWER', fromDrawer: true, by: 'Kofi' }),
      expense('e3', 2, 'PACKAGING', 8_500, { method: 'MOMO', note: 'Takeaway boxes' }),
      expense('e4', 5, 'ELECTRICITY', 30_000, { method: 'BANK' }),
    ],
  );
  const day = (open: boolean) => ({ open, from: '08:00', to: '20:00' });
  queryClient.setQueryData(['storefront', tenant], {
    enabled: true,
    takingOrders: true,
    cashOnPickup: true,
    acceptFirst: false,
    theme: STOREFRONT_THEMES[0],
    area: 'Osu, Accra',
    phone: '+233241234567',
    hours: {
      mon: day(true),
      tue: day(true),
      wed: day(true),
      thu: day(true),
      fri: day(true),
      sat: day(true),
      sun: day(false),
    },
    url: 'https://plateraa-storefront-bvos.vercel.app/s/auntie-amas-kitchen',
    moolreConnected: false,
    deliveryZones: 0,
    photosReady: true,
    coverUrl: null,
    logoUrl: null,
  });
  queryClient.setQueryData(
    ['stock', tenant],
    [
      { id: 's1', name: 'Rice', unit: 'bag', onHand: 3, lowThreshold: 2, low: false },
      { id: 's2', name: 'Cooking oil', unit: 'gallon', onHand: 1, lowThreshold: 2, low: true },
      { id: 's3', name: 'Eggs', unit: 'crate', onHand: 6, lowThreshold: null, low: false },
      { id: 's4', name: 'Gas', unit: 'cylinder', onHand: 1, lowThreshold: 1, low: true },
    ],
  );
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
