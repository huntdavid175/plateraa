import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  and,
  businessNotes,
  devices,
  eq,
  isNull,
  sql,
  staffMembers,
  tenants,
  withPlatform,
  withTenant,
  type Tx,
} from '@brixx/db';
import type { TenantStatus } from '@brixx/shared';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { ulid } from 'ulid';
import { recordAudit } from '../audit/audit';
import { ENV, type Env } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { approveBusiness } from '../identity/onboarding';
import { pinSecrets } from '../identity/staff';
import { auditRows } from './audit-log';
import { CurrentPlatformUser, Platform, type PlatformUser } from './guard';
import {
  BusinessDetailDto,
  BusinessesQueryDto,
  BusinessRowDto,
  NoteInputDto,
  PinResetDto,
  ReasonDto,
  RequestDetailDto,
  RequestDto,
} from './schemas';
import { platformTablets } from './tablets';

/** Ghana time: every vendor is in Africa/Accra, so platform-wide "today" uses it too. */
export const TODAY = sql`(now() at time zone 'Africa/Accra')::date`;
/** What the vendor collects on an order (as `dueSql`, for raw SQL over `orders o`). */
export const DUE = sql`(o.total - case when o.delivery_fee_collected_by = 'RIDER' then o.delivery_fee else 0 end)`;
/** Orders that went ahead (as `countsAsSale`, over `orders o`). */
export const SALE = sql`o.status not in ('CANCELLED', 'REFUNDED') and o.deleted_at is null`;

const iso = (at: Date | string | null | undefined) => (at ? new Date(at).toISOString() : null);
const isUlid = (id: string) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id);

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  vendor_type: string;
  status: TenantStatus;
  status_reason: string | null;
  status_changed_at: Date | null;
  order_ways: string[] | null;
  timezone: string;
  area: string | null;
  contact_phone: string | null;
  owner_name: string | null;
  owner_email: string | null;
  created_at: Date;
  approved_at: Date | null;
  orders7d: number;
  value7d: string;
  last_order_on: string | null;
  tablets: number;
  payment_connected: boolean;
  store_on: boolean;
};

/** Every business with its owner and last week's activity, for the list and one business's page. */
function businessesSql(where: ReturnType<typeof sql>) {
  return sql`
    select t.id, t.name, t.slug, t.vendor_type, t.status, t.status_reason, t.status_changed_at,
      t.order_ways, t.timezone, t.area,
      t.contact_phone, t.created_at, t.approved_at,
      owner.name as owner_name, owner.email as owner_email,
      coalesce(week.orders7d, 0) as orders7d, coalesce(week.value7d, 0)::text as value7d,
      latest.last_order_on, coalesce(tabs.tablets, 0) as tablets,
      (m.tenant_id is not null) as payment_connected,
      coalesce(ts.storefront_enabled, false) as store_on
    from tenants t
    left join lateral (
      select u.name, u.email from staff_members sm join "user" u on u.id = sm.user_id
      where sm.tenant_id = t.id and sm.role = 'OWNER' and sm.deleted_at is null
      order by sm.created_at limit 1) owner on true
    left join (
      select o.tenant_id, count(*)::int as orders7d, sum(${DUE}) as value7d
      from orders o where ${SALE} and o.business_date > ${TODAY} - 7
      group by o.tenant_id) week on week.tenant_id = t.id
    left join (
      select o.tenant_id, max(o.business_date)::text as last_order_on
      from orders o where o.deleted_at is null group by o.tenant_id) latest on latest.tenant_id = t.id
    left join (
      select d.tenant_id, count(*)::int as tablets from devices d
      where d.revoked_at is null group by d.tenant_id) tabs on tabs.tenant_id = t.id
    left join moolre_accounts m on m.tenant_id = t.id
    left join tenant_settings ts on ts.tenant_id = t.id
    where ${where}`;
}

function toBusiness(row: BusinessRow, alerts: Map<string, number>) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    vendorType: row.vendor_type,
    status: row.status,
    statusReason: row.status_reason,
    area: row.area,
    contactPhone: row.contact_phone,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    createdAt: iso(row.created_at)!,
    approvedAt: iso(row.approved_at),
    orders7d: row.orders7d,
    value7d: Number(row.value7d),
    lastOrderOn: row.last_order_on,
    tablets: row.tablets,
    tabletAlerts: alerts.get(row.id) ?? 0,
    paymentConnected: row.payment_connected,
    storeOn: row.store_on,
  };
}

async function alertsByBusiness(tx: Tx, tenantId?: string) {
  const counts = new Map<string, number>();
  for (const tablet of await platformTablets(tx, tenantId)) {
    if (tablet.alerts.length) counts.set(tablet.tenantId, (counts.get(tablet.tenantId) ?? 0) + 1);
  }
  return counts;
}

/** "kofi", "024 123", "nanas-kitchen" or an owner's email. */
function searching(search: string | undefined) {
  const text = search?.trim();
  if (!text) return sql`true`;
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const digits = text.replace(/\D/g, '');
  const national = digits.startsWith('233') ? digits.slice(3) : digits.replace(/^0/, '');
  const byPhone =
    national.length >= 3
      ? sql` or regexp_replace(coalesce(t.contact_phone, ''), '\\D', '', 'g') like ${`%${national}%`}`
      : sql``;
  return sql`(t.name ilike ${like} or t.slug ilike ${like} or t.area ilike ${like}
    or owner.email ilike ${like}${byPhone})`;
}

@Injectable()
export class PlatformBusinesses {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(query: { search?: string; filter: string; limit: number }) {
    const byFilter =
      query.filter === 'ALL'
        ? sql`t.status <> 'DECLINED'`
        : query.filter === 'QUIET'
          ? sql`t.status = 'ACTIVE' and t.approved_at < now() - interval '7 days'
              and (latest.last_order_on is null or latest.last_order_on::date <= ${TODAY} - 7)`
          : sql`t.status = ${query.filter}`;
    return withPlatform(this.database.db, async (tx) => {
      const { rows } = await tx.execute<BusinessRow>(
        sql`${businessesSql(sql`${byFilter} and ${searching(query.search)}`)}
          order by coalesce(week.orders7d, 0) desc, t.name limit ${query.limit}`,
      );
      const alerts = await alertsByBusiness(tx);
      return rows.map((row) => toBusiness(row, alerts));
    });
  }

  async requests() {
    return withPlatform(this.database.db, async (tx) => {
      const { rows } = await tx.execute<BusinessRow>(
        sql`${businessesSql(
          sql`(t.status = 'PENDING' or (t.status = 'DECLINED'
            and t.status_changed_at > now() - interval '30 days'))`,
        )} order by t.status desc, t.created_at`,
      );
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        vendorType: row.vendor_type,
        status: row.status,
        statusReason: row.status_reason,
        statusChangedAt: iso(row.status_changed_at),
        area: row.area,
        contactPhone: row.contact_phone,
        orderWays: row.order_ways ?? [],
        ownerName: row.owner_name,
        ownerEmail: row.owner_email,
        createdAt: iso(row.created_at)!,
      }));
    });
  }

  /** One request to join, with what helps decide it: who asked, and anything that looks the same. */
  async request(tenantId: string) {
    if (!isUlid(tenantId)) throw new NotFoundException('There is no such request');
    const [base] = (await this.requests()).filter((r) => r.id === tenantId);
    const row = base ?? (await this.anyRequest(tenantId));
    return withPlatform(this.database.db, async (tx) => {
      const owner = await tx.execute<{
        user_id: string;
        name: string;
        email: string;
        email_verified: boolean;
        signed_up_at: Date;
        last_sign_in_at: Date | null;
      }>(sql`
        select u.id as user_id, u.name, u.email, u.email_verified, u.created_at as signed_up_at,
          (select max(s.created_at) from session s where s.user_id = u.id) as last_sign_in_at
        from staff_members sm join "user" u on u.id = sm.user_id
        where sm.tenant_id = ${tenantId} and sm.role = 'OWNER' and sm.deleted_at is null
        order by sm.created_at limit 1`);
      const o = owner.rows[0];

      const others = o
        ? await tx.execute<{ id: string; name: string; status: TenantStatus; role: string }>(sql`
            select t.id, t.name, t.status, sm.role from staff_members sm
            join tenants t on t.id = sm.tenant_id
            where sm.user_id = ${o.user_id} and sm.tenant_id <> ${tenantId} and sm.deleted_at is null
            order by t.created_at`)
        : { rows: [] };

      // Same phone (by its digits), same owner login, or a name that is the same once spaces and
      // punctuation go, or contains the other.
      const lookalikes = await tx.execute<{
        id: string;
        name: string;
        status: TenantStatus;
        area: string | null;
        created_at: Date;
        same_phone: boolean;
        same_owner: boolean;
        same_name: boolean;
      }>(sql`
        with me as (
          select regexp_replace(coalesce(contact_phone, ''), '\\D', '', 'g') as phone,
            regexp_replace(lower(name), '[^a-z0-9]', '', 'g') as key
          from tenants where id = ${tenantId})
        select t.id, t.name, t.status, t.area, t.created_at,
          (me.phone <> '' and regexp_replace(coalesce(t.contact_phone, ''), '\\D', '', 'g') = me.phone) as same_phone,
          exists (select 1 from staff_members a join staff_members b on a.user_id = b.user_id
                  where a.tenant_id = t.id and b.tenant_id = ${tenantId} and a.user_id is not null) as same_owner,
          (length(me.key) >= 5 and (regexp_replace(lower(t.name), '[^a-z0-9]', '', 'g') = me.key
            or position(me.key in regexp_replace(lower(t.name), '[^a-z0-9]', '', 'g')) > 0
            or position(regexp_replace(lower(t.name), '[^a-z0-9]', '', 'g') in me.key) > 0)) as same_name
        from tenants t, me
        where t.id <> ${tenantId}
          and ((me.phone <> '' and regexp_replace(coalesce(t.contact_phone, ''), '\\D', '', 'g') = me.phone)
            or exists (select 1 from staff_members a join staff_members b on a.user_id = b.user_id
                       where a.tenant_id = t.id and b.tenant_id = ${tenantId} and a.user_id is not null)
            or (length(me.key) >= 5 and length(regexp_replace(lower(t.name), '[^a-z0-9]', '', 'g')) >= 5
              and (regexp_replace(lower(t.name), '[^a-z0-9]', '', 'g') = me.key
                or position(me.key in regexp_replace(lower(t.name), '[^a-z0-9]', '', 'g')) > 0
                or position(regexp_replace(lower(t.name), '[^a-z0-9]', '', 'g') in me.key) > 0)))
        order by t.created_at desc limit 10`);

      const nearby = await tx.execute<{ open: number; waiting: number }>(sql`
        select count(*) filter (where t.status = 'ACTIVE')::int as open,
          count(*) filter (where t.status = 'PENDING' and t.id <> ${tenantId})::int as waiting
        from tenants t, tenants me
        where me.id = ${tenantId} and me.area is not null and t.area is not null
          and lower(trim(t.area)) = lower(trim(me.area))`);

      const notes = await tx.execute<{
        id: string;
        body: string;
        author_name: string;
        created_at: Date;
      }>(sql`
        select n.id, n.body, u.name as author_name, n.created_at from business_notes n
        join "user" u on u.id = n.author_user_id
        where n.tenant_id = ${tenantId} order by n.created_at desc limit 50`);

      const tz = await tx.execute<{ timezone: string }>(
        sql`select timezone from tenants where id = ${tenantId}`,
      );

      return {
        ...row,
        timezone: tz.rows[0]?.timezone ?? 'Africa/Accra',
        owner: {
          name: o?.name ?? null,
          email: o?.email ?? null,
          emailVerified: o?.email_verified ?? false,
          signedUpAt: iso(o?.signed_up_at),
          lastSignInAt: iso(o?.last_sign_in_at),
          otherBusinesses: others.rows.map((b) => ({ ...b, role: b.role as 'OWNER' })),
        },
        lookalikes: lookalikes.rows.map((l) => ({
          id: l.id,
          name: l.name,
          status: l.status,
          area: l.area,
          createdAt: iso(l.created_at)!,
          reasons: [
            l.same_phone && 'Same phone number',
            l.same_owner && 'Same owner login',
            l.same_name && 'Similar name',
          ].filter((reason): reason is string => Boolean(reason)),
        })),
        nearby: nearby.rows[0] ?? { open: 0, waiting: 0 },
        notes: notes.rows.map((n) => ({
          id: n.id,
          body: n.body,
          authorName: n.author_name,
          createdAt: iso(n.created_at)!,
        })),
        activity: await auditRows(tx, { tenantId, who: 'all', limit: 20 }),
      };
    });
  }

  /** A request that has left the list (approved, or declined over 30 days ago), for its own page. */
  private async anyRequest(tenantId: string) {
    return withPlatform(this.database.db, async (tx) => {
      const { rows } = await tx.execute<BusinessRow>(businessesSql(sql`t.id = ${tenantId}`));
      const row = rows[0];
      if (!row) throw new NotFoundException('There is no such request');
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        vendorType: row.vendor_type,
        status: row.status,
        statusReason: row.status_reason,
        statusChangedAt: iso(row.status_changed_at),
        area: row.area,
        contactPhone: row.contact_phone,
        orderWays: row.order_ways ?? [],
        ownerName: row.owner_name,
        ownerEmail: row.owner_email,
        createdAt: iso(row.created_at)!,
      };
    });
  }

  async detail(tenantId: string) {
    if (!isUlid(tenantId)) throw new NotFoundException('There is no such business');
    return withPlatform(this.database.db, async (tx) => {
      const { rows } = await tx.execute<BusinessRow>(businessesSql(sql`t.id = ${tenantId}`));
      const row = rows[0];
      if (!row) throw new NotFoundException('There is no such business');

      const tabletList = await platformTablets(tx, tenantId);
      const alerts = new Map([[tenantId, tabletList.filter((t) => t.alerts.length).length]]);

      const counts = await tx.execute<{
        items: number;
        customers: number;
        last4: string | null;
      }>(sql`
        select
          (select count(*)::int from items i where i.tenant_id = ${tenantId} and i.deleted_at is null) as items,
          (select count(*)::int from customers c where c.tenant_id = ${tenantId} and c.deleted_at is null) as customers,
          (select right(m.account_number, 4) from moolre_accounts m where m.tenant_id = ${tenantId}) as last4`);

      const logins = await tx.execute<{
        name: string;
        email: string;
        role: string;
        active: boolean;
      }>(sql`
        select u.name, u.email, sm.role, sm.active from staff_members sm
        join "user" u on u.id = sm.user_id
        where sm.tenant_id = ${tenantId} and sm.deleted_at is null
        order by sm.role, u.name`);

      const staff = await tx
        .select({
          id: staffMembers.id,
          name: staffMembers.displayName,
          role: staffMembers.role,
          active: staffMembers.active,
          pinVerifier: staffMembers.pinVerifier,
          lockedUntil: staffMembers.pinLockedUntil,
        })
        .from(staffMembers)
        .where(
          and(
            eq(staffMembers.tenantId, tenantId),
            isNull(staffMembers.deletedAt),
            eq(staffMembers.system, false),
          ),
        )
        .orderBy(staffMembers.role, staffMembers.displayName);

      const trend = await tx.execute<{ date: string; orders: number; value: string }>(sql`
        select d::date::text as date, count(o.id)::int as orders, coalesce(sum(${DUE}), 0)::text as value
        from generate_series(${TODAY} - 29, ${TODAY}, interval '1 day') d
        left join orders o on o.tenant_id = ${tenantId} and o.business_date = d::date and ${SALE}
        group by d order by d`);

      const recentOrders = await tx.execute<{
        id: string;
        display_number: string;
        business_date: string;
        created_at: Date;
        type: string;
        source: string;
        status: string;
        total: string;
        amount_paid: string;
      }>(sql`
        select o.id, o.display_number, o.business_date::text, o.created_at, o.type, o.source,
          o.status, o.total::text, o.amount_paid::text
        from orders o where o.tenant_id = ${tenantId} and o.deleted_at is null
        order by o.created_at desc limit 25`);

      const recentLinks = await linksWhere(tx, sql`l.tenant_id = ${tenantId}`, 10);

      const notes = await tx.execute<{
        id: string;
        body: string;
        author_name: string;
        created_at: Date;
      }>(sql`
        select n.id, n.body, u.name as author_name, n.created_at from business_notes n
        join "user" u on u.id = n.author_user_id
        where n.tenant_id = ${tenantId} order by n.created_at desc limit 50`);

      const activity = await auditRows(tx, { tenantId, who: 'all', limit: 30 });

      return {
        ...toBusiness(row, alerts),
        orderWays: row.order_ways ?? [],
        timezone: row.timezone,
        storeUrl: `${this.env.STOREFRONT_URL}/${row.slug}`,
        paymentAccountLast4: counts.rows[0]?.last4 ?? null,
        menuItems: counts.rows[0]?.items ?? 0,
        customers: counts.rows[0]?.customers ?? 0,
        logins: logins.rows.map((l) => ({ ...l, role: l.role as 'OWNER' })),
        staff: staff.map((s) => ({
          id: s.id,
          name: s.name,
          role: s.role,
          active: s.active,
          hasPin: s.pinVerifier !== null,
          lockedUntil: s.lockedUntil && s.lockedUntil > new Date() ? iso(s.lockedUntil) : null,
        })),
        tabletList,
        trend: trend.rows.map((d) => ({ date: d.date, orders: d.orders, value: Number(d.value) })),
        recentOrders: recentOrders.rows.map((o) => ({
          id: o.id,
          displayNumber: o.display_number,
          businessDate: o.business_date,
          createdAt: iso(o.created_at)!,
          type: o.type,
          source: o.source,
          status: o.status,
          total: Number(o.total),
          amountPaid: Number(o.amount_paid),
        })),
        recentLinks: recentLinks.map(({ tenantId: _t, businessName: _b, ...link }) => link),
        notes: notes.rows.map((n) => ({
          id: n.id,
          body: n.body,
          authorName: n.author_name,
          createdAt: iso(n.created_at)!,
        })),
        activity,
      };
    });
  }

  async approve(by: PlatformUser, tenantId: string) {
    if (!isUlid(tenantId)) throw new NotFoundException('There is no such request');
    const approved = await approveBusiness(this.database.db, tenantId, by.id);
    if (!approved) throw new ConflictException('That request has already been dealt with');
  }

  async decline(by: PlatformUser, tenantId: string, reason: string) {
    await this.changeStatus(by, tenantId, ['PENDING'], 'DECLINED', reason, 'tenant.declined');
  }

  async suspend(by: PlatformUser, tenantId: string, reason: string) {
    await this.changeStatus(by, tenantId, ['ACTIVE'], 'SUSPENDED', reason, 'tenant.suspended');
  }

  async restore(by: PlatformUser, tenantId: string, reason: string) {
    await this.changeStatus(by, tenantId, ['SUSPENDED'], 'ACTIVE', reason, 'tenant.restored');
  }

  private async changeStatus(
    by: PlatformUser,
    tenantId: string,
    from: TenantStatus[],
    to: TenantStatus,
    reason: string,
    action: string,
  ) {
    if (!isUlid(tenantId)) throw new NotFoundException('There is no such business');
    await withTenant(this.database.db, tenantId, async (tx) => {
      const [before] = await tx
        .select({ status: tenants.status })
        .from(tenants)
        .where(eq(tenants.id, tenantId));
      if (!before) throw new NotFoundException('There is no such business');
      if (!from.includes(before.status)) {
        throw new ConflictException('Someone has already changed this business. Reload the page.');
      }
      await tx
        .update(tenants)
        .set({
          status: to,
          statusReason: to === 'ACTIVE' ? null : reason,
          statusChangedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));
      await recordAudit(tx, {
        tenantId,
        actorPlatform: by.id,
        action,
        entityType: 'tenant',
        entityId: tenantId,
        before,
        after: { status: to, reason },
      });
    });
  }

  async addNote(by: PlatformUser, tenantId: string, body: string) {
    if (!isUlid(tenantId)) throw new NotFoundException('There is no such business');
    await withTenant(this.database.db, tenantId, (tx) =>
      tx.insert(businessNotes).values({ id: ulid(), tenantId, authorUserId: by.id, body }),
    );
  }

  /** As the owner's "Sign out" on the Staff page, done by Brixx when a vendor calls. */
  async signOutTablet(by: PlatformUser, tenantId: string, deviceId: string, reason: string) {
    if (!isUlid(tenantId)) throw new NotFoundException('There is no such business');
    await withTenant(this.database.db, tenantId, async (tx) => {
      const [device] = await tx
        .update(devices)
        .set({ revokedAt: new Date() })
        .where(and(eq(devices.id, deviceId), isNull(devices.revokedAt)))
        .returning({ id: devices.id, name: devices.name });
      if (!device) throw new NotFoundException('That tablet is already signed out, or not here');
      await recordAudit(tx, {
        tenantId,
        actorPlatform: by.id,
        action: 'device.signed_out',
        entityType: 'device',
        entityId: device.id,
        after: { name: device.name, reason },
      });
    });
  }

  /**
   * Sets a new PIN for someone locked out, typed while the vendor is on the phone. It is hashed at
   * once and never shown or stored anywhere else; the person should change it on the tablet.
   */
  async resetPin(by: PlatformUser, tenantId: string, staffId: string, pin: string, reason: string) {
    if (!isUlid(tenantId) || !isUlid(staffId)) throw new NotFoundException('No such staff member');
    let secrets: Awaited<ReturnType<typeof pinSecrets>>;
    try {
      secrets = await pinSecrets(pin);
    } catch (error) {
      throw error instanceof BadRequestException ? error : new BadRequestException('Check the PIN');
    }
    await withTenant(this.database.db, tenantId, async (tx) => {
      const [target] = await tx
        .update(staffMembers)
        .set({ ...secrets, pinFailedAttempts: 0, pinLockedUntil: null })
        .where(
          and(
            eq(staffMembers.id, staffId),
            isNull(staffMembers.deletedAt),
            eq(staffMembers.system, false),
          ),
        )
        .returning({ id: staffMembers.id });
      if (!target) throw new NotFoundException('No such staff member');
      await recordAudit(tx, {
        tenantId,
        actorPlatform: by.id,
        action: 'staff.pin_reset',
        entityType: 'staff_member',
        entityId: staffId,
        after: { reason },
      });
    });
  }
}

/** Payment links with their order number and business, newest first. */
export async function linksWhere(tx: Tx, where: ReturnType<typeof sql>, limit: number) {
  const { rows } = await tx.execute<{
    id: string;
    tenant_id: string;
    business_name: string;
    order_number: string;
    status: string;
    amount: string;
    phone: string;
    failure: string | null;
    created_at: Date;
  }>(sql`
    select l.id, l.tenant_id, t.name as business_name, o.display_number as order_number,
      l.status, l.amount::text, l.phone, l.failure, l.created_at
    from payment_links l join orders o on o.id = l.order_id join tenants t on t.id = l.tenant_id
    where ${where} order by l.created_at desc limit ${limit}`);
  return rows.map((l) => ({
    id: l.id,
    tenantId: l.tenant_id,
    businessName: l.business_name,
    orderNumber: l.order_number,
    status: l.status,
    amount: Number(l.amount),
    phone: l.phone,
    failure: l.failure,
    createdAt: iso(l.created_at)!,
  }));
}

@Controller('platform')
@ApiBearerAuth()
export class PlatformBusinessesController {
  constructor(private readonly businesses: PlatformBusinesses) {}

  @Get('businesses')
  @Platform('platform.view')
  @ApiOkResponse({ type: BusinessRowDto.Output, isArray: true })
  list(@Query() query: BusinessesQueryDto) {
    return this.businesses.list(query);
  }

  @Get('businesses/:tenantId')
  @Platform('platform.view')
  @ApiOkResponse({ type: BusinessDetailDto.Output })
  detail(@Param('tenantId') tenantId: string) {
    return this.businesses.detail(tenantId);
  }

  /** Waiting requests, oldest first, then those declined in the last 30 days. */
  @Get('requests')
  @Platform('platform.view')
  @ApiOkResponse({ type: RequestDto.Output, isArray: true })
  requests() {
    return this.businesses.requests();
  }

  @Get('requests/:tenantId')
  @Platform('platform.view')
  @ApiOkResponse({ type: RequestDetailDto.Output })
  request(@Param('tenantId') tenantId: string) {
    return this.businesses.request(tenantId);
  }

  @Post('requests/:tenantId/approve')
  @Platform('requests.decide')
  @HttpCode(204)
  @ApiNoContentResponse()
  async approve(@CurrentPlatformUser() by: PlatformUser, @Param('tenantId') tenantId: string) {
    await this.businesses.approve(by, tenantId);
  }

  @Post('requests/:tenantId/decline')
  @Platform('requests.decide')
  @HttpCode(204)
  @ApiNoContentResponse()
  async decline(
    @CurrentPlatformUser() by: PlatformUser,
    @Param('tenantId') tenantId: string,
    @Body() body: ReasonDto,
  ) {
    await this.businesses.decline(by, tenantId, body.reason);
  }

  /** Stops the business's dashboard, tablets and store at once; nothing is deleted. */
  @Post('businesses/:tenantId/suspend')
  @Platform('businesses.suspend')
  @HttpCode(204)
  @ApiNoContentResponse()
  async suspend(
    @CurrentPlatformUser() by: PlatformUser,
    @Param('tenantId') tenantId: string,
    @Body() body: ReasonDto,
  ) {
    await this.businesses.suspend(by, tenantId, body.reason);
  }

  @Post('businesses/:tenantId/restore')
  @Platform('businesses.suspend')
  @HttpCode(204)
  @ApiNoContentResponse()
  async restore(
    @CurrentPlatformUser() by: PlatformUser,
    @Param('tenantId') tenantId: string,
    @Body() body: ReasonDto,
  ) {
    await this.businesses.restore(by, tenantId, body.reason);
  }

  @Post('businesses/:tenantId/notes')
  @Platform('notes.write')
  @HttpCode(204)
  @ApiNoContentResponse()
  async addNote(
    @CurrentPlatformUser() by: PlatformUser,
    @Param('tenantId') tenantId: string,
    @Body() body: NoteInputDto,
  ) {
    await this.businesses.addNote(by, tenantId, body.body);
  }

  @Post('businesses/:tenantId/tablets/:deviceId/sign-out')
  @Platform('support.fix')
  @HttpCode(204)
  @ApiNoContentResponse()
  async signOutTablet(
    @CurrentPlatformUser() by: PlatformUser,
    @Param('tenantId') tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() body: ReasonDto,
  ) {
    await this.businesses.signOutTablet(by, tenantId, deviceId, body.reason);
  }

  @Post('businesses/:tenantId/staff/:staffId/pin')
  @Platform('support.fix')
  @HttpCode(204)
  @ApiNoContentResponse()
  async resetPin(
    @CurrentPlatformUser() by: PlatformUser,
    @Param('tenantId') tenantId: string,
    @Param('staffId') staffId: string,
    @Body() body: PinResetDto,
  ) {
    await this.businesses.resetPin(by, tenantId, staffId, body.pin, body.reason);
  }
}
