import { Controller, Get, Inject, Injectable, Query } from '@nestjs/common';
import { sql, withPlatform } from '@brixx/db';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { linksWhere, PlatformBusinesses, TODAY } from './businesses';
import { Platform } from './guard';
import { SearchDto, SearchQueryDto } from './schemas';

/** An order number as staff say it on the phone: "w12", "A 34", "#105". */
const ORDER_NUMBER = /^#?\s*([a-z]{0,2})\s*-?\s*(\d{1,5})$/i;

/**
 * The one box a support call starts from: a business name, an owner's email, a phone number or an
 * order number finds businesses, customers, recent orders and payment links across the platform.
 */
@Injectable()
export class PlatformSearch {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly businesses: PlatformBusinesses,
  ) {}

  async search(q: string) {
    const digits = q.replace(/\D/g, '');
    const national = digits.startsWith('233') ? digits.slice(3) : digits.replace(/^0/, '');
    const phone = national.length >= 5 && digits.length >= q.replace(/[\s+()-]/g, '').length - 1;
    const orderNumber = ORDER_NUMBER.exec(q.trim());

    const businesses = (await this.businesses.list({ search: q, filter: 'ALL', limit: 8 })).map(
      ({ id, name, slug, status, area, ownerEmail, contactPhone }) => ({
        id,
        name,
        slug,
        status,
        area,
        ownerEmail,
        contactPhone,
      }),
    );

    return withPlatform(this.database.db, async (tx) => {
      const orders = orderNumber
        ? await tx.execute<{
            id: string;
            tenant_id: string;
            business_name: string;
            display_number: string;
            business_date: string;
            created_at: Date;
            type: string;
            source: string;
            status: string;
            total: string;
            amount_paid: string;
          }>(sql`
            select o.id, o.tenant_id, t.name as business_name, o.display_number,
              o.business_date::text, o.created_at, o.type, o.source, o.status, o.total::text,
              o.amount_paid::text
            from orders o join tenants t on t.id = o.tenant_id
            where o.deleted_at is null and o.business_date > ${TODAY} - 7
              and upper(regexp_replace(o.display_number, '[0-9]', '', 'g')) = ${orderNumber[1]!.toUpperCase()}
              and nullif(regexp_replace(o.display_number, '[^0-9]', '', 'g'), '')::int = ${Number(orderNumber[2])}
            order by o.created_at desc limit 20`)
        : { rows: [] };

      const customers = phone
        ? await tx.execute<{
            id: string;
            tenant_id: string;
            business_name: string;
            phone: string;
            name: string | null;
            orders: number;
          }>(sql`
            select c.id, c.tenant_id, t.name as business_name, c.phone, c.name,
              (select count(*)::int from orders o where o.customer_id = c.id and o.deleted_at is null) as orders
            from customers c join tenants t on t.id = c.tenant_id
            where c.deleted_at is null and c.phone like ${`%${national}%`}
            order by c.created_at desc limit 20`)
        : { rows: [] };

      const links = phone
        ? await linksWhere(
            tx,
            sql`l.phone like ${`%${national}%`} and l.created_at > now() - interval '30 days'`,
            20,
          )
        : [];

      return {
        businesses,
        orders: orders.rows.map((o) => ({
          id: o.id,
          tenantId: o.tenant_id,
          businessName: o.business_name,
          displayNumber: o.display_number,
          businessDate: o.business_date,
          createdAt: new Date(o.created_at).toISOString(),
          type: o.type,
          source: o.source,
          status: o.status,
          total: Number(o.total),
          amountPaid: Number(o.amount_paid),
        })),
        customers: customers.rows.map((c) => ({
          id: c.id,
          tenantId: c.tenant_id,
          businessName: c.business_name,
          phone: c.phone,
          name: c.name,
          orders: c.orders,
        })),
        links,
      };
    });
  }
}

@Controller('platform/search')
@ApiBearerAuth()
export class PlatformSearchController {
  constructor(private readonly platformSearch: PlatformSearch) {}

  @Get()
  @Platform('platform.view')
  @ApiOkResponse({ type: SearchDto.Output })
  search(@Query() query: SearchQueryDto) {
    return this.platformSearch.search(query.q);
  }
}
