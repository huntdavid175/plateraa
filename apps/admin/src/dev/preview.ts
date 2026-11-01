import type {
  Analytics,
  AuditRow,
  BusinessDetail,
  BusinessRow,
  Health,
  Me,
  Overview,
  Request as JoinRequest,
  RequestDetail,
  SearchResult,
  Tablet,
  TeamMember,
} from '@/lib/api';
import { api } from '@/lib/api';
import { session } from '@/lib/session';

/**
 * Dev only: `?preview` answers every API call with made-up sample data, so the screens can be
 * seen and screenshotted without a login or the database. The built app leaves this file out.
 */

const KEY = 'brixx.admin.preview';

export function previewWanted() {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(location.search);
  try {
    if (params.has('preview')) sessionStorage.setItem(KEY, params.get('preview') || 'ADMIN');
    if (params.has('live')) sessionStorage.removeItem(KEY);
    return sessionStorage.getItem(KEY);
  } catch {
    return params.has('preview') ? 'ADMIN' : false;
  }
}

/* ── Made-up data ─────────────────────────────────────────────────────────── */

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)]!;
const id = (n: number) => `01JPREVIEW${String(n).padStart(16, '0')}`.slice(0, 26).toUpperCase();

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
const dayOffset = (d: number) =>
  new Date(Date.parse(today) - d * 86_400_000).toISOString().slice(0, 10);

const NAMES = [
  ["Nana's Kitchen", 'East Legon', 'CHOP_BAR', 62],
  ["Papa's Kenkey", 'Kaneshie', 'CHOP_BAR', 41],
  ['Sweet Bite Café', 'Osu', 'CAFE_BAKERY', 28],
  ['Chop Corner', 'Madina', 'FAST_FOOD', 25],
  ["Abena's Rice House", 'Tema C.25', 'CHOP_BAR', 19],
  ['Kumasi Kitchen', 'Dzorwulu', 'CHOP_BAR', 17],
  ['Fresh Sobolo Bar', 'Labone', 'JUICE', 15],
  ['Auntie Akos Waakye', 'Achimota', 'CHOP_BAR', 14],
  ['Grill Masters', 'Cantonments', 'FAST_FOOD', 12],
  ['Mama Efe Jollof', 'Adenta', 'CLOUD_KITCHEN', 9],
  ["Yaa's Fufu Joint", 'Dansoman', 'CHOP_BAR', 0],
  ['Accra Shawarma Hub', 'Spintex', 'FAST_FOOD', 0],
] as const;

const businesses: BusinessRow[] = NAMES.map(([name, area, type, perDay], i) => {
  const quiet = perDay === 0;
  const orders7d = quiet ? 0 : Math.round(perDay * 7 * (0.8 + rand() * 0.4));
  return {
    id: id(i + 1),
    name,
    slug: name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    vendorType: type,
    status: i === 8 ? 'SUSPENDED' : 'ACTIVE',
    statusReason: i === 8 ? 'Asked us to pause while they move premises' : null,
    area,
    contactPhone: `+23324${String(1000000 + i * 7919).slice(0, 7)}`,
    ownerName: pick([
      'Ama Owusu',
      'Kofi Mensah',
      'Efua Asante',
      'Kwabena Boateng',
      'Akua Darko',
      'Yaw Appiah',
    ]),
    ownerEmail: `${name.split(/[^A-Za-z]/)[0]!.toLowerCase()}@gmail.com`,
    createdAt: minutesAgo((40 - i) * 1440),
    approvedAt: minutesAgo((39 - i) * 1440),
    orders7d,
    value7d: orders7d * (3500 + Math.round(rand() * 2500)),
    lastOrderOn: quiet ? dayOffset(i === 10 ? 9 : 8) : dayOffset(0),
    tablets: 1,
    tabletAlerts: i === 1 || i === 2 ? 1 : 0,
    paymentConnected: i % 4 !== 3,
    storeOn: i % 3 !== 2,
  };
});

const requests: JoinRequest[] = [
  ["Auntie Esi's Waakye", 'Madina', 'CHOP_BAR', ['WALK_INS', 'WHATSAPP'], 2900],
  ['Kofi Broni Grills', 'Osu', 'FAST_FOOD', ['WALK_INS', 'PHONE_CALLS', 'BOLT_FOOD'], 1300],
  ['Mama Pat Chop Bar', 'Tema Comm. 1', 'CHOP_BAR', ['WALK_INS'], 95],
].map(([name, area, type, ways, mins], i) => ({
  id: id(100 + i),
  name: name as string,
  slug: (name as string)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-$/, ''),
  vendorType: type as string,
  status: 'PENDING' as const,
  statusReason: null,
  statusChangedAt: null,
  area: area as string,
  contactPhone: `+2332055${String(10000 + i * 371)}`,
  orderWays: ways as string[],
  ownerName: pick(['Esi Quaye', 'Kofi Broni', 'Patience Amoah']),
  ownerEmail: `owner${i + 1}@gmail.com`,
  createdAt: minutesAgo(mins as number),
}));
requests.push({
  ...requests[0]!,
  id: id(110),
  name: 'Test Shop 2',
  slug: 'test-shop-2',
  status: 'DECLINED',
  statusReason: 'Duplicate of Chop Corner',
  statusChangedAt: minutesAgo(3000),
  createdAt: minutesAgo(3100),
});

const tablets: Tablet[] = businesses.map((b, i) => ({
  id: id(200 + i),
  tenantId: b.id,
  businessName: b.name,
  businessSlug: b.slug,
  name: 'Counter tablet',
  code: 'A',
  appVersion: i % 5 === 0 ? '1.3.0' : '1.4.2',
  lastSeenAt: minutesAgo(i === 1 ? 34 : i >= 10 ? 60 * 24 * 8 : 1 + (i % 4)),
  lastSyncedAt: minutesAgo(i === 1 ? 52 : i === 2 ? 14 : i >= 10 ? 60 * 24 * 8 : 1),
  pendingChanges: i === 1 ? 41 : i === 2 ? 12 : 0,
  oldestPendingAt: i === 1 ? minutesAgo(52) : i === 2 ? minutesAgo(14) : null,
  signedOut: false,
  alerts:
    i === 1
      ? [{ kind: 'STUCK', count: 41, since: minutesAgo(52) }]
      : i === 2
        ? [{ kind: 'WAITING', count: 12, since: minutesAgo(14) }]
        : [],
}));

const team: TeamMember[] = [
  ['Kwame Asare', 'kwame@brixx.africa', 'ADMIN', 12],
  ['Akosua Mensah', 'akosua@brixx.africa', 'SUPPORT', 40],
  ['Esi Darko', 'esi@brixx.africa', 'SUPPORT', 60 * 26],
].map(([name, email, role, mins], i) => ({
  userId: id(300 + i),
  name: name as string,
  email: email as string,
  role: role as 'ADMIN' | 'SUPPORT',
  active: true,
  addedByName: i ? 'Kwame Asare' : null,
  createdAt: minutesAgo(60 * 24 * (30 - i * 5)),
  lastSignInAt: minutesAgo(mins as number),
}));

const ACTIONS: [string, string, boolean][] = [
  ['tenant.approved', 'Kwame Asare (Brixx)', true],
  ['device.signed_out', 'Akosua Mensah (Brixx)', true],
  ['staff.pin_reset', 'Akosua Mensah (Brixx)', true],
  ['refund.recorded', 'Ama Owusu', false],
  ['shift.closed', 'Kojo', false],
  ['item.sold_out', 'Abla', false],
  ['payment.recorded', 'Kojo', false],
  ['tenant.declined', 'Kwame Asare (Brixx)', true],
];

const audit: AuditRow[] = Array.from({ length: 60 }, (_, i) => {
  const [action, actorName, byBrixx] = ACTIONS[i % ACTIONS.length]!;
  const b = businesses[i % 9]!;
  return {
    id: id(1000 - i),
    tenantId: b.id,
    businessName: b.name,
    actorName,
    byBrixx,
    action,
    entityType: action.split('.')[0]!,
    entityId: id(5000 + i),
    before: action === 'tenant.approved' ? { status: 'PENDING' } : null,
    after:
      action === 'staff.pin_reset'
        ? { reason: 'Owner forgot it, called from the shop' }
        : action === 'tenant.approved'
          ? { status: 'ACTIVE' }
          : null,
    createdAt: minutesAgo(18 + i * 47),
  };
});

const shape = [0, 0, 0, 0, 0, 0, 1, 3, 6, 9, 11, 16, 28, 31, 22, 14, 12, 15, 21, 24, 17, 9, 4, 1];
const hourNow = Number(
  new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Accra' }),
);
const byHour = shape.map((v, h) => (h <= hourNow ? v : 0));
const ordersToday = byHour.reduce((s, v) => s + v, 0);

const overview: Overview = {
  today,
  ordersToday,
  valueToday: ordersToday * 4380,
  activeBusinessesToday: 9,
  ordersSameTimeLastWeek: Math.round(ordersToday * 0.86),
  businesses: { active: 11, pending: 3, suspended: 1 },
  requests: requests.filter((r) => r.status === 'PENDING'),
  tablets: tablets.filter((t) => t.alerts.length),
  failedLinks: [
    {
      id: id(400),
      tenantId: businesses[0]!.id,
      businessName: businesses[0]!.name,
      orderNumber: 'W14',
      status: 'FAILED',
      amount: 8600,
      phone: '+233241112223',
      failure: 'Customer’s wallet declined',
      createdAt: minutesAgo(75),
    },
  ],
  quiet: businesses
    .filter((b) => b.orders7d === 0)
    .map((b) => ({ id: b.id, name: b.name, area: b.area, lastOrderOn: b.lastOrderOn })),
  byHour,
  recentActions: audit.filter((a) => a.byBrixx).slice(0, 6),
};

function analytics(days: number): Analytics {
  const daily = Array.from({ length: days }, (_, i) => {
    const d = days - 1 - i;
    const weekday = new Date(Date.parse(dayOffset(d))).getUTCDay();
    const base = 150 + (days - d) * 1.6 + (weekday === 5 || weekday === 6 ? 60 : 0);
    const orders = Math.round(base * (0.85 + rand() * 0.3));
    return {
      date: dayOffset(d),
      orders,
      value: orders * 4300,
      businesses: 8 + Math.round(rand() * 3),
    };
  });
  const orders = daily.reduce((s, d) => s + d.orders, 0);
  return {
    days,
    from: daily[0]!.date,
    to: today,
    totals: {
      orders,
      value: orders * 4300,
      activeBusinesses: 10,
      averageOrder: 4300,
      onlineShare: 0.18,
    },
    previous: {
      orders: Math.round(orders * 0.88),
      value: Math.round(orders * 0.88) * 4150,
      activeBusinesses: 8,
    },
    daily,
    funnel: {
      requested: 19,
      approved: 15,
      menu: 14,
      tablet: 12,
      firstOrder: 11,
      activeThisWeek: 9,
    },
    byType: [
      { key: 'PICKUP', orders: Math.round(orders * 0.55), value: Math.round(orders * 0.55) * 4100 },
      { key: 'DINE_IN', orders: Math.round(orders * 0.3), value: Math.round(orders * 0.3) * 4000 },
      {
        key: 'DELIVERY',
        orders: Math.round(orders * 0.15),
        value: Math.round(orders * 0.15) * 5600,
      },
    ],
    bySource: [
      { key: 'POS', orders: Math.round(orders * 0.82), value: Math.round(orders * 0.82) * 4200 },
      {
        key: 'STOREFRONT',
        orders: Math.round(orders * 0.18),
        value: Math.round(orders * 0.18) * 4800,
      },
    ],
    businesses: businesses.map((b, i) => {
      const spark = Array.from({ length: days }, () =>
        b.orders7d ? Math.round((b.orders7d / 7) * (0.6 + rand() * 0.8)) : 0,
      );
      if (i === 5)
        spark.forEach(
          (_, j) => (spark[j] = j > days / 2 ? Math.round(spark[j]! * 0.4) : spark[j]!),
        );
      const total = spark.reduce((s, v) => s + v, 0);
      return {
        id: b.id,
        name: b.name,
        area: b.area,
        orders: total,
        previousOrders:
          i === 5
            ? Math.round(total * 1.9)
            : i >= 10
              ? 30 + i
              : Math.round(total * (0.8 + rand() * 0.3)),
        value: total * 4200,
        activeDays: spark.filter(Boolean).length,
        lastOrderOn: b.lastOrderOn,
        spark,
        averageOrder: 3600 + Math.round(rand() * 2400),
        cancelled: Math.round(total * 0.03),
        onlineShare: i % 3 === 2 ? 0 : 0.08 + rand() * 0.3,
      };
    }),
    previousDaily: daily.map((d) => Math.round(d.orders * (0.8 + rand() * 0.15))),
    losses: {
      cancelled: Math.round(orders * 0.035),
      cancelledShare: 0.035,
      refunds: 184_500,
      refunded: 27,
    },
    newCustomers: Math.round(orders * 0.11),
    byMethod: [
      { key: 'CASH', orders: Math.round(orders * 0.71), value: Math.round(orders * 0.71) * 4100 },
      { key: 'LINK', orders: Math.round(orders * 0.27), value: Math.round(orders * 0.27) * 4900 },
      {
        key: 'PLATFORM',
        orders: Math.round(orders * 0.02),
        value: Math.round(orders * 0.02) * 5200,
      },
    ],
    byHour: shape.map((v) => Math.round(v * days * 1.05)),
    byWeekday: [0.85, 0.8, 0.9, 0.95, 1.25, 1.35, 1.0].map((f) => Math.round((orders / 7) * f)),
    topItems: [
      ['Jollof rice and chicken', 980],
      ['Waakye special', 812],
      ['Banku and tilapia', 640],
      ['Fried rice and chicken', 590],
      ['Kenkey and fish', 455],
      ['Fufu and light soup', 402],
      ['Sobolo', 388],
      ['Red red', 301],
      ['Kelewele', 260],
      ['Indomie and egg', 214],
    ].map(([name, q], i) => ({
      name: name as string,
      quantity: Math.round(((q as number) * days) / 30),
      value: Math.round(((q as number) * days) / 30) * (3000 + i * 150),
      businesses: Math.max(1, 7 - Math.floor(i / 2)),
    })),
    byArea: [
      ['East Legon', 2],
      ['Osu', 2],
      ['Kaneshie', 1],
      ['Madina', 2],
      ['Tema', 1],
      ['Dzorwulu', 1],
      ['Labone', 1],
    ].map(([key, b], i) => {
      const share = [0.24, 0.19, 0.17, 0.14, 0.11, 0.09, 0.06][i]!;
      return {
        key: key as string,
        businesses: b as number,
        orders: Math.round(orders * share),
        value: Math.round(orders * share) * 4300,
      };
    }),
    byVendorType: [
      {
        key: 'CHOP_BAR',
        businesses: 6,
        orders: Math.round(orders * 0.58),
        value: Math.round(orders * 0.58) * 3900,
      },
      {
        key: 'FAST_FOOD',
        businesses: 3,
        orders: Math.round(orders * 0.27),
        value: Math.round(orders * 0.27) * 5100,
      },
      {
        key: 'CAFE_BAKERY',
        businesses: 1,
        orders: Math.round(orders * 0.09),
        value: Math.round(orders * 0.09) * 3200,
      },
      {
        key: 'JUICE',
        businesses: 1,
        orders: Math.round(orders * 0.06),
        value: Math.round(orders * 0.06) * 2000,
      },
    ],
    signups: Array.from({ length: Math.ceil(days / 7) }, (_, i) => ({
      week: dayOffset((Math.ceil(days / 7) - 1 - i) * 7),
      requested: 1 + Math.round(rand() * 4),
      approved: Math.round(rand() * 3),
    })),
  };
}

function detail(tenantId: string): BusinessDetail {
  const b = businesses.find((x) => x.id === tenantId) ?? businesses[1]!;
  const tabletList = tablets.filter((t) => t.tenantId === b.id);
  return {
    ...b,
    orderWays: ['WALK_INS', 'PHONE_CALLS', 'WHATSAPP'],
    timezone: 'Africa/Accra',
    storeUrl: `https://brixxstorefront.vercel.app/${b.slug}`,
    paymentAccountLast4: b.paymentConnected ? '4821' : null,
    menuItems: 34,
    customers: 212,
    logins: [
      { name: b.ownerName ?? 'Owner', email: b.ownerEmail ?? '', role: 'OWNER', active: true },
    ],
    staff: [
      {
        id: id(600),
        name: b.ownerName ?? 'Owner',
        role: 'OWNER',
        active: true,
        hasPin: true,
        lockedUntil: null,
      },
      {
        id: id(601),
        name: 'Kojo',
        role: 'STAFF',
        active: true,
        hasPin: true,
        lockedUntil: minutesAgo(-10),
      },
      { id: id(602), name: 'Abla', role: 'STAFF', active: true, hasPin: true, lockedUntil: null },
      {
        id: id(603),
        name: 'Senyo',
        role: 'RIDER',
        active: false,
        hasPin: false,
        lockedUntil: null,
      },
    ],
    tabletList,
    trend: Array.from({ length: 30 }, (_, i) => {
      const orders = b.orders7d
        ? Math.round((b.orders7d / 7) * (0.6 + rand() * 0.8))
        : i < 20
          ? Math.round(rand() * 20)
          : 0;
      return { date: dayOffset(29 - i), orders, value: orders * 4300 };
    }),
    recentOrders: Array.from({ length: 12 }, (_, i) => {
      const total = 2500 + Math.round(rand() * 9000);
      const status = i === 0 ? 'PREPARING' : i === 3 ? 'CANCELLED' : 'COMPLETED';
      return {
        id: id(700 + i),
        displayNumber: i % 4 === 1 ? `W${14 - i}` : String(120 - i).padStart(3, '0'),
        businessDate: today,
        createdAt: minutesAgo(8 + i * 23),
        type: pick(['PICKUP', 'DINE_IN', 'DELIVERY']),
        source: i % 4 === 1 ? 'STOREFRONT' : 'POS',
        status,
        total,
        amountPaid: i === 0 ? 0 : total,
      };
    }),
    recentLinks: [
      {
        id: id(800),
        orderNumber: 'W14',
        status: 'FAILED',
        amount: 8600,
        phone: '+233241112223',
        failure: 'Customer’s wallet declined',
        createdAt: minutesAgo(75),
      },
      {
        id: id(801),
        orderNumber: '108',
        status: 'PAID',
        amount: 4500,
        phone: '+233205554444',
        failure: null,
        createdAt: minutesAgo(190),
      },
      {
        id: id(802),
        orderNumber: 'W11',
        status: 'SENT',
        amount: 6200,
        phone: '+233246667777',
        failure: null,
        createdAt: minutesAgo(12),
      },
    ],
    notes: [
      {
        id: id(900),
        body: 'Called: tablet was on mobile data with no bundle. Told them to join the shop Wi-Fi.',
        authorName: 'Akosua Mensah',
        createdAt: minutesAgo(30),
      },
      {
        id: id(901),
        body: 'Owner wants delivery zones for East Legon and Shiashie. Showed her Settings.',
        authorName: 'Kwame Asare',
        createdAt: minutesAgo(60 * 50),
      },
    ],
    activity: audit.filter((a) => a.tenantId === b.id).slice(0, 10),
  };
}

const health: Health = {
  server: {
    startedAt: minutesAgo(60 * 7 + 12),
    commit: 'e7b85db',
    databaseMs: 24,
    nodeVersion: 'v24.11.0',
  },
  tablets,
  tabletCounts: {
    total: tablets.length,
    online: 8,
    today: 2,
    quiet: 2,
    signedOut: 1,
    waitingChanges: tablets.reduce((s, t) => s + t.pendingChanges, 0),
  },
  versions: [
    { version: '1.4.2', tablets: 9 },
    { version: '1.3.0', tablets: 3 },
  ],
  sync: (() => {
    const hourNow = Number(
      new Date().toLocaleString('en-GB', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'Africa/Accra',
      }),
    );
    const byHour = Array.from({ length: 24 }, (_, i) => {
      const hour = (hourNow - 23 + i + 24) % 24;
      return {
        hour: `${String(hour).padStart(2, '0')}:00`,
        applied: Math.round((shape[hour] ?? 0) * 9 * (0.8 + rand() * 0.4)),
        rejected: hour === 13 ? 2 : hour === 16 ? 1 : 0,
      };
    });
    return {
      applied: byHour.reduce((s, h) => s + h.applied, 0),
      rejected: byHour.reduce((s, h) => s + h.rejected, 0),
      byHour,
    };
  })(),
  links: {
    byStatus: [
      { status: 'PAID', count: 46 },
      { status: 'SENT', count: 9 },
      { status: 'FAILED', count: 1 },
      { status: 'EXPIRED', count: 3 },
    ],
    failed: overview.failedLinks,
    byDay: Array.from({ length: 7 }, (_, i) => {
      const sent = 38 + Math.round(rand() * 25);
      const failed = i === 6 ? 1 : Math.round(rand() * 2);
      return { date: dayOffset(6 - i), sent, paid: sent - failed - Math.round(rand() * 6), failed };
    }),
    medianMinutesToPay: 3.4,
  },
  provider: { callbacks: 52, lastAt: minutesAgo(3) },
  refusals: [{ type: 'order.update_items', count: 3, businesses: 1, lastAt: minutesAgo(41) }],
  storesWithoutPayments: businesses
    .filter((b) => b.storeOn && !b.paymentConnected)
    .map(({ id, name, area }) => ({ id, name, area })),
};

function requestDetail(tenantId: string): RequestDetail {
  const r = requests.find((x) => x.id === tenantId) ?? requests[0]!;
  const first = r === requests[0];
  return {
    ...r,
    timezone: 'Africa/Accra',
    owner: {
      name: r.ownerName,
      email: r.ownerEmail,
      emailVerified: !first,
      signedUpAt: new Date(Date.parse(r.createdAt) - 6 * 60_000).toISOString(),
      lastSignInAt: minutesAgo(first ? 130 : 900),
      otherBusinesses: first
        ? [{ id: businesses[7]!.id, name: businesses[7]!.name, status: 'ACTIVE', role: 'MANAGER' }]
        : [],
    },
    lookalikes: first
      ? [
          {
            id: businesses[7]!.id,
            name: businesses[7]!.name,
            status: 'ACTIVE',
            area: businesses[7]!.area,
            createdAt: businesses[7]!.createdAt,
            reasons: ['Same owner login', 'Similar name'],
          },
          {
            id: requests[3]!.id,
            name: requests[3]!.name,
            status: 'DECLINED',
            area: requests[3]!.area,
            createdAt: requests[3]!.createdAt,
            reasons: ['Same phone number'],
          },
        ]
      : [],
    nearby: { open: first ? 2 : 1, waiting: first ? 0 : 1 },
    notes: first
      ? [
          {
            id: id(960),
            body: 'Called twice, no answer. WhatsApp sent asking for a good time.',
            authorName: 'Akosua Mensah',
            createdAt: minutesAgo(200),
          },
        ]
      : [],
    activity: [
      {
        id: id(970),
        tenantId: r.id,
        businessName: r.name,
        actorName: r.ownerName ?? 'Owner',
        byBrixx: false,
        action: 'tenant.created',
        entityType: 'tenant',
        entityId: r.id,
        before: null,
        after: { name: r.name, status: 'PENDING' },
        createdAt: r.createdAt,
      },
    ],
  };
}

function search(q: string): SearchResult {
  const text = q.toLowerCase();
  return {
    businesses: businesses
      .filter((b) => b.name.toLowerCase().includes(text) || b.area?.toLowerCase().includes(text))
      .map(({ id, name, slug, status, area, ownerEmail, contactPhone }) => ({
        id,
        name,
        slug,
        status,
        area,
        ownerEmail,
        contactPhone,
      })),
    orders: /^w?\d+$/i.test(q)
      ? detail(businesses[0]!.id)
          .recentOrders.slice(0, 2)
          .map((o, i) => ({ ...o, tenantId: businesses[i]!.id, businessName: businesses[i]!.name }))
      : [],
    customers: /\d{5}/.test(q)
      ? [
          {
            id: id(950),
            tenantId: businesses[0]!.id,
            businessName: businesses[0]!.name,
            phone: '+233241112223',
            name: 'Adwoa',
            orders: 14,
          },
        ]
      : [],
    links: /\d{5}/.test(q) ? overview.failedLinks : [],
  };
}

/* ── The pretend API ──────────────────────────────────────────────────────── */

function answer(method: string, url: URL, role: string): unknown {
  const path = url.pathname.replace(/^\/api\/platform/, '');
  const q = url.searchParams;
  if (method !== 'GET') return null;
  if (path === '/me') {
    const me: Me = {
      id: team[role === 'SUPPORT' ? 1 : 0]!.userId,
      name: role === 'SUPPORT' ? 'Akosua Mensah' : 'Kwame Asare',
      email: role === 'SUPPORT' ? 'akosua@brixx.africa' : 'kwame@brixx.africa',
      role: role === 'SUPPORT' ? 'SUPPORT' : 'ADMIN',
      capabilities:
        role === 'SUPPORT'
          ? ['platform.view', 'requests.decide', 'support.fix', 'notes.write']
          : [
              'platform.view',
              'requests.decide',
              'support.fix',
              'notes.write',
              'businesses.suspend',
              'audit.export',
              'team.manage',
            ],
    };
    return me;
  }
  if (path === '/overview') return overview;
  if (path === '/requests') return requests;
  if (path.startsWith('/requests/')) return requestDetail(path.split('/')[2]!);
  if (path === '/businesses') {
    const filter = q.get('filter') ?? 'ALL';
    const s = (q.get('search') ?? '').toLowerCase();
    return businesses.filter(
      (b) =>
        (filter === 'ALL' ||
          (filter === 'QUIET' ? b.orders7d === 0 && b.status === 'ACTIVE' : b.status === filter)) &&
        (!s || b.name.toLowerCase().includes(s) || b.area?.toLowerCase().includes(s)),
    );
  }
  if (path.startsWith('/businesses/')) return detail(path.split('/')[2]!);
  if (path === '/analytics') return analytics(Number(q.get('days') ?? 30));
  if (path === '/health') return health;
  if (path === '/search') return search(q.get('q') ?? '');
  if (path === '/audit') {
    const who = q.get('who');
    const before = q.get('before');
    return audit
      .filter((a) => (who === 'brixx' ? a.byBrixx : who === 'vendor' ? !a.byBrixx : true))
      .filter((a) => !q.get('tenantId') || a.tenantId === q.get('tenantId'))
      .filter((a) => !before || a.id < before)
      .slice(0, Number(q.get('limit') ?? 100));
  }
  if (path === '/team') return team;
  return null;
}

export function installPreview(role: string) {
  session.signIn('preview');
  api.use({
    async onRequest({ request }) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const body = answer(request.method, new URL(request.url), role);
      return body === null
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
    },
  });
}
