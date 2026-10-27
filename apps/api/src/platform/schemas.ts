import { PLATFORM_CAPABILITIES, PLATFORM_ROLES, ROLES, TENANT_STATUSES } from '@brixx/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableText } from '../openapi';
import { TABLET_ALERT_KINDS } from '../sync/tablet-health';

/** Shapes the admin console reads. Money is integer pesewas throughout. */

export const tabletSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  businessName: z.string(),
  businessSlug: z.string(),
  name: z.string(),
  code: z.string(),
  appVersion: nullableText(),
  lastSeenAt: nullableText(),
  lastSyncedAt: nullableText(),
  pendingChanges: z.number().int(),
  oldestPendingAt: nullableText(),
  signedOut: z.boolean(),
  alerts: z.array(
    z.object({
      kind: z.enum(TABLET_ALERT_KINDS),
      count: z.number().int(),
      since: nullableText(),
    }),
  ),
});

export const businessRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  vendorType: z.string(),
  status: z.enum(TENANT_STATUSES),
  statusReason: nullableText(),
  area: nullableText(),
  contactPhone: nullableText(),
  ownerName: nullableText(),
  ownerEmail: nullableText(),
  createdAt: z.string(),
  approvedAt: nullableText(),
  /** Orders that went ahead in the last 7 trading days, and what they came to. */
  orders7d: z.number().int(),
  value7d: z.number().int(),
  lastOrderOn: nullableText(),
  tablets: z.number().int(),
  /** Tablets with something wrong right now (stuck, out of touch, waiting, refused). */
  tabletAlerts: z.number().int(),
  paymentConnected: z.boolean(),
  storeOn: z.boolean(),
});
export class BusinessRowDto extends createZodDto(businessRowSchema) {}

export const requestSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  vendorType: z.string(),
  status: z.enum(TENANT_STATUSES),
  statusReason: nullableText(),
  statusChangedAt: nullableText(),
  area: nullableText(),
  contactPhone: nullableText(),
  orderWays: z.array(z.string()),
  ownerName: nullableText(),
  ownerEmail: nullableText(),
  createdAt: z.string(),
});
export class RequestDto extends createZodDto(requestSchema) {}

const daySchema = z.object({ date: z.string(), orders: z.number().int(), value: z.number().int() });

/** A share of the orders: a key (a type, a source, an area), how many and what they came to. */
const mixSchema = z.object({ key: z.string(), orders: z.number().int(), value: z.number().int() });

const orderLineSchema = z.object({
  id: z.string(),
  displayNumber: z.string(),
  businessDate: z.string(),
  createdAt: z.string(),
  type: z.string(),
  source: z.string(),
  status: z.string(),
  total: z.number().int(),
  amountPaid: z.number().int(),
});

const linkSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  amount: z.number().int(),
  phone: z.string(),
  failure: nullableText(),
  createdAt: z.string(),
});

export const noteSchema = z.object({
  id: z.string(),
  body: z.string(),
  authorName: z.string(),
  createdAt: z.string(),
});

export const auditRowSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  businessName: z.string(),
  /** "Kwame (Brixx)", a vendor's staff member's name, or "System". */
  actorName: z.string(),
  byBrixx: z.boolean(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  createdAt: z.string(),
});
export class AuditRowDto extends createZodDto(auditRowSchema) {}

export class BusinessDetailDto extends createZodDto(
  businessRowSchema.extend({
    orderWays: z.array(z.string()),
    timezone: z.string(),
    storeUrl: z.string(),
    /** Last 4 digits of the payment account, never the key. */
    paymentAccountLast4: nullableText(),
    menuItems: z.number().int(),
    customers: z.number().int(),
    logins: z.array(
      z.object({ name: z.string(), email: z.string(), role: z.enum(ROLES), active: z.boolean() }),
    ),
    staff: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        role: z.enum(ROLES),
        active: z.boolean(),
        hasPin: z.boolean(),
        lockedUntil: nullableText(),
      }),
    ),
    tabletList: z.array(tabletSchema),
    /** The last 30 trading days, oldest first, every day present. */
    trend: z.array(daySchema),
    recentOrders: z.array(orderLineSchema),
    recentLinks: z.array(linkSchema),
    notes: z.array(noteSchema),
    activity: z.array(auditRowSchema),
  }),
) {}

export class ReasonDto extends createZodDto(
  z.object({ reason: z.string().trim().min(3, 'Say why, in a few words').max(300) }),
) {}

export class NoteInputDto extends createZodDto(
  z.object({ body: z.string().trim().min(1, 'Write the note first').max(1000) }),
) {}

export class PinResetDto extends createZodDto(
  z.object({
    pin: z.string(),
    reason: z.string().trim().min(3, 'Say why, in a few words').max(300),
  }),
) {}

export class BusinessesQueryDto extends createZodDto(
  z.object({
    search: z.string().trim().max(60).optional(),
    /** A status, or QUIET: open businesses with no order in the last 7 days. */
    filter: z.enum([...TENANT_STATUSES, 'QUIET', 'ALL']).default('ALL'),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  }),
) {}

export class OverviewDto extends createZodDto(
  z.object({
    today: z.string(),
    ordersToday: z.number().int(),
    valueToday: z.number().int(),
    activeBusinessesToday: z.number().int(),
    /** Same weekday last week, up to the same time of day, for comparison. */
    ordersSameTimeLastWeek: z.number().int(),
    businesses: z.object({
      active: z.number().int(),
      pending: z.number().int(),
      suspended: z.number().int(),
    }),
    requests: z.array(requestSchema),
    tablets: z.array(tabletSchema),
    failedLinks: z.array(linkSchema.extend({ tenantId: z.string(), businessName: z.string() })),
    quiet: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        area: nullableText(),
        lastOrderOn: nullableText(),
      }),
    ),
    /** Orders per hour today across the platform, 24 entries, Ghana time. */
    byHour: z.array(z.number().int()),
    recentActions: z.array(auditRowSchema),
  }),
) {}

export class AnalyticsQueryDto extends createZodDto(
  z.object({
    days: z.coerce
      .number()
      .int()
      .refine((d) => [7, 30, 90].includes(d))
      .default(30),
  }),
) {}

export class AnalyticsDto extends createZodDto(
  z.object({
    days: z.number().int(),
    from: z.string(),
    to: z.string(),
    totals: z.object({
      orders: z.number().int(),
      value: z.number().int(),
      activeBusinesses: z.number().int(),
      averageOrder: z.number().int(),
      onlineShare: z.number(),
    }),
    previous: z.object({
      orders: z.number().int(),
      value: z.number().int(),
      activeBusinesses: z.number().int(),
    }),
    daily: z.array(daySchema.extend({ businesses: z.number().int() })),
    /** How far businesses have got, all time. */
    funnel: z.object({
      requested: z.number().int(),
      approved: z.number().int(),
      menu: z.number().int(),
      tablet: z.number().int(),
      firstOrder: z.number().int(),
      activeThisWeek: z.number().int(),
    }),
    byType: z.array(
      z.object({ key: z.string(), orders: z.number().int(), value: z.number().int() }),
    ),
    bySource: z.array(
      z.object({ key: z.string(), orders: z.number().int(), value: z.number().int() }),
    ),
    businesses: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        area: nullableText(),
        orders: z.number().int(),
        previousOrders: z.number().int(),
        value: z.number().int(),
        activeDays: z.number().int(),
        lastOrderOn: nullableText(),
        /** Orders per day over the period, oldest first. */
        spark: z.array(z.number().int()),
        averageOrder: z.number().int(),
        cancelled: z.number().int(),
        /** Share of its orders placed on its online store, 0 to 1. */
        onlineShare: z.number(),
      }),
    ),
    /** Orders the day the same distance into the period before, for a dashed comparison line. */
    previousDaily: z.array(z.number().int()),
    /** Cancelled orders and money handed back, in the period. */
    losses: z.object({
      cancelled: z.number().int(),
      cancelledShare: z.number(),
      refunds: z.number().int(),
      refunded: z.number().int(),
    }),
    newCustomers: z.number().int(),
    /** Confirmed payments by how they were paid: CASH, LINK (links and online), PLATFORM. */
    byMethod: z.array(mixSchema),
    /** Orders by hour of the day (24, Ghana time) and by weekday (7, Monday first), summed over the period. */
    byHour: z.array(z.number().int()),
    byWeekday: z.array(z.number().int()),
    topItems: z.array(
      z.object({
        name: z.string(),
        quantity: z.number().int(),
        value: z.number().int(),
        businesses: z.number().int(),
      }),
    ),
    byArea: z.array(mixSchema.extend({ businesses: z.number().int() })),
    byVendorType: z.array(mixSchema.extend({ businesses: z.number().int() })),
    /** Requests to join and approvals per week, over the period. */
    signups: z.array(
      z.object({
        week: z.string(),
        requested: z.number().int(),
        approved: z.number().int(),
      }),
    ),
  }),
) {}

export class HealthDto extends createZodDto(
  z.object({
    /** The API itself: when this instance started, which build, how long a database round trip takes. */
    server: z.object({
      startedAt: z.string(),
      commit: nullableText(),
      databaseMs: z.number().int(),
      nodeVersion: z.string(),
    }),
    tablets: z.array(tabletSchema),
    /** Tablets by how recently they were in touch (signed out ones apart). */
    tabletCounts: z.object({
      total: z.number().int(),
      online: z.number().int(),
      today: z.number().int(),
      quiet: z.number().int(),
      signedOut: z.number().int(),
      waitingChanges: z.number().int(),
    }),
    versions: z.array(z.object({ version: z.string(), tablets: z.number().int() })),
    /** Changes tablets sent in the last 24 hours, by hour (oldest first), and how many went through. */
    sync: z.object({
      applied: z.number().int(),
      rejected: z.number().int(),
      byHour: z.array(
        z.object({
          hour: z.string(),
          applied: z.number().int(),
          rejected: z.number().int(),
        }),
      ),
    }),
    links: z.object({
      byStatus: z.array(z.object({ status: z.string(), count: z.number().int() })),
      failed: z.array(linkSchema.extend({ tenantId: z.string(), businessName: z.string() })),
      /** The last 7 days, oldest first. */
      byDay: z.array(
        z.object({
          date: z.string(),
          sent: z.number().int(),
          paid: z.number().int(),
          failed: z.number().int(),
        }),
      ),
      /** Median minutes from a paid link being made to the payment, last 7 days. */
      medianMinutesToPay: z.nullable(z.number()).meta({ type: 'number', nullable: true }),
    }),
    /** Calls from the payment provider (Moolre) in the last 24 hours. */
    provider: z.object({
      callbacks: z.number().int(),
      lastAt: nullableText(),
    }),
    refusals: z.array(
      z.object({
        type: z.string(),
        count: z.number().int(),
        businesses: z.number().int(),
        lastAt: z.string(),
      }),
    ),
    /** Open businesses whose online store is on but with no payment account: customers can't pay online. */
    storesWithoutPayments: z.array(
      z.object({ id: z.string(), name: z.string(), area: nullableText() }),
    ),
  }),
) {}

/** One request to join, with what the team needs to decide on it. */
export class RequestDetailDto extends createZodDto(
  requestSchema.extend({
    timezone: z.string(),
    owner: z.object({
      name: nullableText(),
      email: nullableText(),
      emailVerified: z.boolean(),
      signedUpAt: nullableText(),
      lastSignInAt: nullableText(),
      /** Other businesses this login is part of, as owner or manager. */
      otherBusinesses: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          status: z.enum(TENANT_STATUSES),
          role: z.enum(ROLES),
        }),
      ),
    }),
    /** Businesses that may be the same one: same phone, same owner or a very similar name. */
    lookalikes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.enum(TENANT_STATUSES),
        area: nullableText(),
        createdAt: z.string(),
        reasons: z.array(z.string()),
      }),
    ),
    /** Requests from the same area, and open businesses there. */
    nearby: z.object({ open: z.number().int(), waiting: z.number().int() }),
    notes: z.array(noteSchema),
    activity: z.array(auditRowSchema),
  }),
) {}

export class SearchQueryDto extends createZodDto(
  z.object({ q: z.string().trim().min(2).max(60) }),
) {}

export class SearchDto extends createZodDto(
  z.object({
    businesses: z.array(
      businessRowSchema.pick({
        id: true,
        name: true,
        slug: true,
        status: true,
        area: true,
        ownerEmail: true,
        contactPhone: true,
      }),
    ),
    orders: z.array(orderLineSchema.extend({ tenantId: z.string(), businessName: z.string() })),
    customers: z.array(
      z.object({
        id: z.string(),
        tenantId: z.string(),
        businessName: z.string(),
        phone: z.string(),
        name: nullableText(),
        orders: z.number().int(),
      }),
    ),
    links: z.array(linkSchema.extend({ tenantId: z.string(), businessName: z.string() })),
  }),
) {}

export class AuditQueryDto extends createZodDto(
  z.object({
    tenantId: z.string().optional(),
    /** brixx: the team's actions; vendor: the businesses' own. */
    who: z.enum(['all', 'brixx', 'vendor']).default('all'),
    action: z.string().trim().max(60).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /** The last row's id, for the next page. */
    before: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  }),
) {}

export const teamMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(PLATFORM_ROLES),
  active: z.boolean(),
  addedByName: nullableText(),
  createdAt: z.string(),
  lastSignInAt: nullableText(),
});
export class TeamMemberDto extends createZodDto(teamMemberSchema) {}

export class AddTeamMemberDto extends createZodDto(
  z.object({
    email: z.email().trim().toLowerCase(),
    role: z.enum(PLATFORM_ROLES),
    /** Needed only when the email has no Brixx login yet. */
    name: z.string().trim().min(2).max(80).optional(),
    password: z.string().min(8).max(128).optional(),
  }),
) {}

export class UpdateTeamMemberDto extends createZodDto(
  z.object({ role: z.enum(PLATFORM_ROLES), active: z.boolean() }),
) {}

export class PlatformMeDto extends createZodDto(
  z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: z.enum(PLATFORM_ROLES),
    capabilities: z.array(z.enum(PLATFORM_CAPABILITIES)),
  }),
) {}
