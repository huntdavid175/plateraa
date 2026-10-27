import { Controller, Get, Inject, Injectable, Query } from '@nestjs/common';
import { sql, withPlatform } from '@brixx/db';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { auditRows } from './audit-log';
import { DUE, linksWhere, PlatformBusinesses, SALE, TODAY } from './businesses';
import { Platform } from './guard';
import { AnalyticsDto, AnalyticsQueryDto, HealthDto, OverviewDto } from './schemas';
import { platformTablets } from './tablets';

/** When this instance of the API started, for Health. */
const STARTED_AT = new Date();

const num = (value: string | number | null | undefined) => Number(value ?? 0);
/** A whole number written into the SQL: `date - $1` is ambiguous to Postgres. Only validated counts. */
const n = (value: number) => sql.raw(String(Math.trunc(value)));

/** Home, Analytics and Health: platform-wide figures. Never Brixx's own takings: there are none. */
@Injectable()
export class PlatformInsights {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly businesses: PlatformBusinesses,
  ) {}

  async overview() {
    const [requests, quietRows] = await Promise.all([
      this.businesses.requests(),
      this.businesses.list({ filter: 'QUIET', limit: 50 }),
    ]);
    return withPlatform(this.database.db, async (tx) => {
      const today = await tx.execute<{
        today: string;
        orders: number;
        value: string;
        businesses: number;
        last_week: number;
      }>(sql`
        select ${TODAY}::text as today,
          (select count(*)::int from orders o where ${SALE} and o.business_date = ${TODAY}) as orders,
          (select coalesce(sum(${DUE}), 0)::text from orders o where ${SALE} and o.business_date = ${TODAY}) as value,
          (select count(distinct o.tenant_id)::int from orders o where ${SALE} and o.business_date = ${TODAY}) as businesses,
          (select count(*)::int from orders o where ${SALE} and o.business_date = ${TODAY} - 7
             and o.created_at <= now() - interval '7 days') as last_week`);

      const statuses = await tx.execute<{ status: string; count: number }>(
        sql`select status, count(*)::int as count from tenants group by status`,
      );
      const count = (status: string) =>
        statuses.rows.find((row) => row.status === status)?.count ?? 0;

      const byHour = await tx.execute<{ hour: number; orders: number }>(sql`
        select extract(hour from o.created_at at time zone 'Africa/Accra')::int as hour,
          count(*)::int as orders
        from orders o where ${SALE} and o.business_date = ${TODAY} group by 1`);
      const hours = Array.from(
        { length: 24 },
        (_, hour) => byHour.rows.find((row) => row.hour === hour)?.orders ?? 0,
      );

      const tablets = (await platformTablets(tx)).filter((tablet) => tablet.alerts.length > 0);
      const failedLinks = await linksWhere(
        tx,
        sql`l.status = 'FAILED' and l.created_at > now() - interval '24 hours'`,
        20,
      );
      const day = today.rows[0]!;

      return {
        today: day.today,
        ordersToday: day.orders,
        valueToday: num(day.value),
        activeBusinessesToday: day.businesses,
        ordersSameTimeLastWeek: day.last_week,
        businesses: {
          active: count('ACTIVE'),
          pending: count('PENDING'),
          suspended: count('SUSPENDED'),
        },
        requests: requests.filter((request) => request.status === 'PENDING'),
        tablets,
        failedLinks,
        quiet: quietRows.map((row) => ({
          id: row.id,
          name: row.name,
          area: row.area,
          lastOrderOn: row.lastOrderOn,
        })),
        byHour: hours,
        recentActions: await auditRows(tx, { who: 'brixx', limit: 12 }),
      };
    });
  }

  async analytics(days: number) {
    return withPlatform(this.database.db, async (tx) => {
      const range = sql`o.business_date > ${TODAY} - ${n(days)} and o.business_date <= ${TODAY}`;
      const before = sql`o.business_date > ${TODAY} - ${n(days * 2)} and o.business_date <= ${TODAY} - ${n(days)}`;

      const bounds = await tx.execute<{ from: string; to: string }>(
        sql`select (${TODAY} - ${n(days - 1)})::text as from, ${TODAY}::text as to`,
      );

      const totals = await tx.execute<{
        orders: number;
        value: string;
        businesses: number;
        online: number;
        prev_orders: number;
        prev_value: string;
        prev_businesses: number;
      }>(sql`
        select
          count(*) filter (where ${range})::int as orders,
          coalesce(sum(${DUE}) filter (where ${range}), 0)::text as value,
          count(distinct o.tenant_id) filter (where ${range})::int as businesses,
          count(*) filter (where ${range} and o.source = 'STOREFRONT')::int as online,
          count(*) filter (where ${before})::int as prev_orders,
          coalesce(sum(${DUE}) filter (where ${before}), 0)::text as prev_value,
          count(distinct o.tenant_id) filter (where ${before})::int as prev_businesses
        from orders o where ${SALE} and o.business_date > ${TODAY} - ${n(days * 2)}`);

      const daily = await tx.execute<{
        date: string;
        orders: number;
        value: string;
        businesses: number;
      }>(sql`
        select d::date::text as date, count(o.id)::int as orders,
          coalesce(sum(${DUE}), 0)::text as value, count(distinct o.tenant_id)::int as businesses
        from generate_series(${TODAY} - ${n(days - 1)}, ${TODAY}, interval '1 day') d
        left join orders o on o.business_date = d::date and ${SALE}
        group by d order by d`);

      const funnel = await tx.execute<{
        requested: number;
        approved: number;
        menu: number;
        tablet: number;
        first_order: number;
        active_week: number;
      }>(sql`
        select
          count(*)::int as requested,
          count(*) filter (where t.approved_at is not null)::int as approved,
          count(*) filter (where exists (select 1 from items i where i.tenant_id = t.id and i.deleted_at is null))::int as menu,
          count(*) filter (where exists (select 1 from devices d where d.tenant_id = t.id))::int as tablet,
          count(*) filter (where exists (select 1 from orders o where o.tenant_id = t.id and ${SALE}))::int as first_order,
          count(*) filter (where exists (select 1 from orders o where o.tenant_id = t.id and ${SALE}
            and o.business_date > ${TODAY} - 7))::int as active_week
        from tenants t where t.status <> 'DECLINED'`);

      const mix = (column: ReturnType<typeof sql>) =>
        tx.execute<{ key: string; orders: number; value: string }>(sql`
          select ${column}::text as key, count(*)::int as orders, coalesce(sum(${DUE}), 0)::text as value
          from orders o where ${SALE} and ${range} group by 1 order by 2 desc`);
      const [byType, bySource] = await Promise.all([mix(sql`o.type`), mix(sql`o.source`)]);

      const businesses = await tx.execute<{
        id: string;
        name: string;
        area: string | null;
        orders: number;
        previous_orders: number;
        value: string;
        active_days: number;
        last_order_on: string | null;
        spark: number[];
        online: number;
        cancelled: number;
      }>(sql`
        select t.id, t.name, t.area,
          count(o.id) filter (where ${range} and o.source = 'STOREFRONT')::int as online,
          (select count(*)::int from orders c where c.tenant_id = t.id and c.status = 'CANCELLED'
             and c.deleted_at is null and c.business_date > ${TODAY} - ${n(days)}) as cancelled,
          count(o.id) filter (where ${range})::int as orders,
          count(o.id) filter (where ${before})::int as previous_orders,
          coalesce(sum(${DUE}) filter (where ${range}), 0)::text as value,
          count(distinct o.business_date) filter (where ${range})::int as active_days,
          (select max(x.business_date)::text from orders x where x.tenant_id = t.id and x.deleted_at is null) as last_order_on,
          (select array_agg(coalesce(c.n, 0) order by g)
             from generate_series(${TODAY} - ${n(days - 1)}, ${TODAY}, interval '1 day') g
             left join (select y.business_date, count(*)::int as n from orders y
                        where y.tenant_id = t.id and y.status not in ('CANCELLED', 'REFUNDED')
                          and y.deleted_at is null group by y.business_date) c
               on c.business_date = g::date) as spark
        from tenants t
        left join orders o on o.tenant_id = t.id and ${SALE} and o.business_date > ${TODAY} - ${n(days * 2)}
        where t.status in ('ACTIVE', 'SUSPENDED')
        group by t.id order by orders desc, t.name`);

      // The same days, one period back, for the dashed comparison line.
      const previousDaily = await tx.execute<{ orders: number }>(sql`
        select count(o.id)::int as orders
        from generate_series(${TODAY} - ${n(days * 2 - 1)}, ${TODAY} - ${n(days)}, interval '1 day') d
        left join orders o on o.business_date = d::date and ${SALE}
        group by d order by d`);

      // Every order in the period, cancelled ones too, against `range`'s alias.
      const anyOrder = sql`o.deleted_at is null and ${range}`;
      const losses = await tx.execute<{
        all_orders: number;
        cancelled: number;
        refunds: string;
        refunded: number;
      }>(sql`
        select
          (select count(*)::int from orders o where ${anyOrder}) as all_orders,
          (select count(*)::int from orders o where ${anyOrder} and o.status = 'CANCELLED') as cancelled,
          (select coalesce(sum(r.amount), 0)::text from refunds r join orders o on o.id = r.order_id
             where r.deleted_at is null and ${anyOrder}) as refunds,
          (select count(distinct r.order_id)::int from refunds r join orders o on o.id = r.order_id
             where r.deleted_at is null and ${anyOrder}) as refunded`);

      const newCustomers = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from customers c
        where c.deleted_at is null
          and (c.created_at at time zone 'Africa/Accra')::date > ${TODAY} - ${n(days)}`);

      const byMethod = await tx.execute<{ key: string; orders: number; value: string }>(sql`
        select p.method::text as key, count(distinct p.order_id)::int as orders,
          coalesce(sum(p.amount), 0)::text as value
        from payments p join orders o on o.id = p.order_id
        where p.status = 'CONFIRMED' and ${anyOrder} group by 1 order by 3 desc`);

      const byHour = await tx.execute<{ hour: number; orders: number }>(sql`
        select extract(hour from o.created_at at time zone 'Africa/Accra')::int as hour,
          count(*)::int as orders
        from orders o where ${SALE} and ${range} group by 1`);
      const byWeekday = await tx.execute<{ day: number; orders: number }>(sql`
        select extract(isodow from o.business_date)::int as day, count(*)::int as orders
        from orders o where ${SALE} and ${range} group by 1`);

      const topItems = await tx.execute<{
        name: string;
        quantity: number;
        value: string;
        businesses: number;
      }>(sql`
        select i.name, sum(i.quantity)::int as quantity, coalesce(sum(i.line_total), 0)::text as value,
          count(distinct i.tenant_id)::int as businesses
        from order_items i join orders o on o.id = i.order_id
        where i.deleted_at is null and ${SALE} and ${range}
        group by i.name order by 2 desc limit 10`);

      const byTenant = (column: ReturnType<typeof sql>) =>
        tx.execute<{ key: string; orders: number; value: string; businesses: number }>(sql`
          select ${column} as key, count(*)::int as orders,
            coalesce(sum(${DUE}), 0)::text as value, count(distinct o.tenant_id)::int as businesses
          from orders o join tenants t on t.id = o.tenant_id
          where ${SALE} and ${range} group by 1 order by 2 desc limit 10`);
      const [byArea, byVendorType] = await Promise.all([
        byTenant(sql`coalesce(nullif(trim(t.area), ''), 'No area given')`),
        byTenant(sql`t.vendor_type::text`),
      ]);

      const signups = await tx.execute<{ week: string; requested: number; approved: number }>(sql`
        select w::date::text as week,
          (select count(*)::int from tenants t
             where (t.created_at at time zone 'Africa/Accra')::date >= w::date
               and (t.created_at at time zone 'Africa/Accra')::date < w::date + 7) as requested,
          (select count(*)::int from tenants t
             where (t.approved_at at time zone 'Africa/Accra')::date >= w::date
               and (t.approved_at at time zone 'Africa/Accra')::date < w::date + 7) as approved
        from generate_series(date_trunc('week', ${TODAY} - ${n(days - 1)}), ${TODAY}, interval '1 week') w
        order by w`);

      const t = totals.rows[0]!;
      const l = losses.rows[0]!;
      const f = funnel.rows[0]!;
      return {
        days,
        from: bounds.rows[0]!.from,
        to: bounds.rows[0]!.to,
        totals: {
          orders: t.orders,
          value: num(t.value),
          activeBusinesses: t.businesses,
          averageOrder: t.orders ? Math.round(num(t.value) / t.orders) : 0,
          onlineShare: t.orders ? t.online / t.orders : 0,
        },
        previous: {
          orders: t.prev_orders,
          value: num(t.prev_value),
          activeBusinesses: t.prev_businesses,
        },
        daily: daily.rows.map((d) => ({ ...d, value: num(d.value) })),
        funnel: {
          requested: f.requested,
          approved: f.approved,
          menu: f.menu,
          tablet: f.tablet,
          firstOrder: f.first_order,
          activeThisWeek: f.active_week,
        },
        byType: byType.rows.map((r) => ({ ...r, value: num(r.value) })),
        bySource: bySource.rows.map((r) => ({ ...r, value: num(r.value) })),
        businesses: businesses.rows.map((b) => ({
          id: b.id,
          name: b.name,
          area: b.area,
          orders: b.orders,
          previousOrders: b.previous_orders,
          value: num(b.value),
          activeDays: b.active_days,
          lastOrderOn: b.last_order_on,
          spark: b.spark ?? [],
          averageOrder: b.orders ? Math.round(num(b.value) / b.orders) : 0,
          cancelled: b.cancelled,
          onlineShare: b.orders ? b.online / b.orders : 0,
        })),
        previousDaily: previousDaily.rows.map((d) => d.orders),
        losses: {
          cancelled: l.cancelled,
          cancelledShare: l.all_orders ? l.cancelled / l.all_orders : 0,
          refunds: num(l.refunds),
          refunded: l.refunded,
        },
        newCustomers: newCustomers.rows[0]?.n ?? 0,
        byMethod: byMethod.rows.map((r) => ({ ...r, value: num(r.value) })),
        byHour: Array.from(
          { length: 24 },
          (_, hour) => byHour.rows.find((r) => r.hour === hour)?.orders ?? 0,
        ),
        byWeekday: Array.from(
          { length: 7 },
          (_, i) => byWeekday.rows.find((r) => r.day === i + 1)?.orders ?? 0,
        ),
        topItems: topItems.rows.map((r) => ({ ...r, value: num(r.value) })),
        byArea: byArea.rows.map((r) => ({ ...r, value: num(r.value) })),
        byVendorType: byVendorType.rows.map((r) => ({ ...r, value: num(r.value) })),
        signups: signups.rows,
      };
    });
  }

  async health() {
    // One round trip on its own connection, before the rest, so it measures the database alone.
    const pinged = performance.now();
    await this.database.db.execute(sql`select 1`);
    const databaseMs = Math.round(performance.now() - pinged);

    return withPlatform(this.database.db, async (tx) => {
      const all = await platformTablets(tx);
      const tablets = all.filter((tablet) => !tablet.signedOut);
      const minutesAgo = (at: string | null) =>
        at ? (Date.now() - new Date(at).getTime()) / 60_000 : Infinity;
      const tabletCounts = {
        total: tablets.length,
        online: tablets.filter((t) => minutesAgo(t.lastSeenAt) <= 5).length,
        today: tablets.filter(
          (t) => minutesAgo(t.lastSeenAt) > 5 && minutesAgo(t.lastSeenAt) <= 1440,
        ).length,
        quiet: tablets.filter((t) => minutesAgo(t.lastSeenAt) > 1440).length,
        signedOut: all.length - tablets.length,
        waitingChanges: tablets.reduce((sum, t) => sum + t.pendingChanges, 0),
      };
      const versions = new Map<string, number>();
      for (const t of tablets) {
        const version = t.appVersion ?? 'Unknown';
        versions.set(version, (versions.get(version) ?? 0) + 1);
      }

      const sync = await tx.execute<{ hour: string; applied: number; rejected: number }>(sql`
        select to_char(h at time zone 'Africa/Accra', 'HH24:00') as hour,
          count(c.id) filter (where c.status = 'APPLIED')::int as applied,
          count(c.id) filter (where c.status = 'REJECTED')::int as rejected
        from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h
        left join sync_commands c on c.created_at >= h and c.created_at < h + interval '1 hour'
        group by h order by h`);

      const linksByDay = await tx.execute<{
        date: string;
        sent: number;
        paid: number;
        failed: number;
      }>(sql`
        select d::date::text as date, count(l.id)::int as sent,
          count(l.id) filter (where l.status = 'PAID')::int as paid,
          count(l.id) filter (where l.status = 'FAILED')::int as failed
        from generate_series(${TODAY} - 6, ${TODAY}, interval '1 day') d
        left join payment_links l on (l.created_at at time zone 'Africa/Accra')::date = d::date
        group by d order by d`);
      const toPay = await tx.execute<{ minutes: number | null }>(sql`
        select percentile_cont(0.5) within group (
          order by extract(epoch from (p.created_at - l.created_at)) / 60)::float as minutes
        from payment_links l join payments p on p.id = l.payment_id
        where l.status = 'PAID' and l.created_at > now() - interval '7 days'`);

      const provider = await tx.execute<{ callbacks: number; last_at: Date | null }>(sql`
        select count(*) filter (where received_at > now() - interval '24 hours')::int as callbacks,
          max(received_at) as last_at
        from provider_events`);

      const storesWithoutPayments = await tx.execute<{
        id: string;
        name: string;
        area: string | null;
      }>(sql`
        select t.id, t.name, t.area from tenants t
        join tenant_settings s on s.tenant_id = t.id
        where t.status = 'ACTIVE' and s.storefront_enabled
          and not exists (select 1 from moolre_accounts m where m.tenant_id = t.id)
        order by t.name`);
      const byStatus = await tx.execute<{ status: string; count: number }>(sql`
        select status::text, count(*)::int as count from payment_links
        where created_at > now() - interval '24 hours' group by 1 order by 2 desc`);
      const failed = await linksWhere(
        tx,
        sql`l.status = 'FAILED' and l.created_at > now() - interval '7 days'`,
        50,
      );
      const refusals = await tx.execute<{
        type: string;
        count: number;
        businesses: number;
        last_at: Date;
      }>(sql`
        select type, count(*)::int as count, count(distinct tenant_id)::int as businesses,
          max(created_at) as last_at
        from sync_commands where status = 'REJECTED' and created_at > now() - interval '24 hours'
        group by type order by 2 desc`);
      const syncRows = sync.rows;
      const minutes = toPay.rows[0]?.minutes;
      return {
        server: {
          startedAt: STARTED_AT.toISOString(),
          commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
          databaseMs,
          nodeVersion: process.version,
        },
        tablets,
        tabletCounts,
        versions: [...versions]
          .map(([version, count]) => ({ version, tablets: count }))
          .sort((x, y) => y.tablets - x.tablets),
        sync: {
          applied: syncRows.reduce((sum, r) => sum + r.applied, 0),
          rejected: syncRows.reduce((sum, r) => sum + r.rejected, 0),
          byHour: syncRows,
        },
        links: {
          byStatus: byStatus.rows,
          failed,
          byDay: linksByDay.rows,
          medianMinutesToPay:
            minutes === null || minutes === undefined ? null : Math.round(minutes * 10) / 10,
        },
        provider: {
          callbacks: provider.rows[0]?.callbacks ?? 0,
          lastAt: provider.rows[0]?.last_at
            ? new Date(provider.rows[0].last_at).toISOString()
            : null,
        },
        storesWithoutPayments: storesWithoutPayments.rows,
        refusals: refusals.rows.map((r) => ({
          type: r.type,
          count: r.count,
          businesses: r.businesses,
          lastAt: new Date(r.last_at).toISOString(),
        })),
      };
    });
  }
}

@Controller('platform')
@ApiBearerAuth()
export class PlatformInsightsController {
  constructor(private readonly insights: PlatformInsights) {}

  @Get('overview')
  @Platform('platform.view')
  @ApiOkResponse({ type: OverviewDto.Output })
  overview() {
    return this.insights.overview();
  }

  @Get('analytics')
  @Platform('platform.view')
  @ApiOkResponse({ type: AnalyticsDto.Output })
  analytics(@Query() query: AnalyticsQueryDto) {
    return this.insights.analytics(query.days);
  }

  @Get('health')
  @Platform('platform.view')
  @ApiOkResponse({ type: HealthDto.Output })
  health() {
    return this.insights.health();
  }
}
