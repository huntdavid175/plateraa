import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import {
  and,
  customers,
  eq,
  isNotNull,
  isNull,
  or,
  orders,
  sql,
  withTenant,
  type Tx,
} from '@plateraa/db';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { nullableText } from '../openapi';
import { OrdersModule, OrdersService, orderRowSchema } from '../orders/orders.module';
import { countsAsSale, dueSql } from '../reports/business-day';

/** How many of a customer's orders their page shows. */
const RECENT_ORDERS = 50;

class CustomersQueryDto extends createZodDto(
  z.object({
    /** Part of a name or a phone number, as typed: "kofi", "024 123". */
    search: z.string().trim().max(40).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  }),
) {}

/** Money that may be null, kept a plain number in the OpenAPI document (see `nullableText`). */
const nullableMoney = () => z.nullable(z.number().int()).meta({ type: 'integer', nullable: true });

const customerSchema = z.object({
  id: z.string(),
  /** E.164, e.g. +233241234567. */
  phone: z.string(),
  name: nullableText(),
  notes: nullableText(),
  /** Orders that went ahead (not cancelled or refunded). */
  orders: z.number().int(),
  /** What those orders came to, in pesewas. Null for anyone not allowed to see sales. */
  spent: nullableMoney(),
  firstOrderOn: nullableText(),
  lastOrderOn: nullableText(),
});

class CustomerRowDto extends createZodDto(customerSchema) {}

class CustomerDetailDto extends createZodDto(
  customerSchema.extend({
    /** Newest first, up to 50. */
    recentOrders: z.array(orderRowSchema),
  }),
) {}

class SaveCustomerDto extends createZodDto(
  z.object({
    /** Blank clears it. */
    name: z.string().trim().max(80),
    notes: z.string().trim().max(300),
  }),
) {}

/** "kofi" matches names; "024 123", "+233 24 123" and "24123" match the number. */
function matching(search: string | undefined) {
  const text = search?.trim();
  if (!text) return undefined;
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const byName = sql`${customers.name} ilike ${like}`;
  const digits = text.replace(/\D/g, '');
  const national = digits.startsWith('233') ? digits.slice(3) : digits.replace(/^0/, '');
  return national.length >= 3
    ? or(byName, sql`${customers.phone} like ${`%${national}%`}`)
    : byName;
}

/**
 * Customers (dashboard): everyone whose number was taken with an order. The tablet creates them
 * (`customer.upsert`, and with phone orders and deliveries); here they're looked up, and a
 * manager can fix a name or add notes, which sync back to the tablets. What they spent shows only
 * to people allowed to see sales.
 */
@Injectable()
export class CustomersService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly orders: OrdersService,
  ) {}

  async list(actor: Actor, query: { search?: string; limit: number }) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const stats = orderStats(tx);
      const rows = await tx
        .select(customerColumns(stats))
        .from(customers)
        .leftJoin(stats, eq(stats.customerId, customers.id))
        .where(and(isNull(customers.deletedAt), matching(query.search)))
        .orderBy(sql`${stats.lastOrderOn} desc nulls last`, customers.name)
        .limit(query.limit);
      return rows.map((row) => toCustomer(row, actor));
    });
  }

  async detail(actor: Actor, customerId: string) {
    const customer = await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const stats = orderStats(tx);
      const [row] = await tx
        .select(customerColumns(stats))
        .from(customers)
        .leftJoin(stats, eq(stats.customerId, customers.id))
        .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)));
      if (!row) throw new NotFoundException('There is no such customer');
      return toCustomer(row, actor);
    });
    const recentOrders = await this.orders.forCustomer(actor.tenantId, customerId, RECENT_ORDERS);
    return { ...customer, recentOrders };
  }

  async save(actor: Actor, customerId: string, input: { name: string; notes: string }) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [before] = await tx
        .select({ name: customers.name, notes: customers.notes })
        .from(customers)
        .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)));
      if (!before) throw new NotFoundException('There is no such customer');
      const after = { name: input.name || null, notes: input.notes || null };
      await tx.update(customers).set(after).where(eq(customers.id, customerId));
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'customer.updated',
        entityType: 'customer',
        entityId: customerId,
        before,
        after,
      });
    });
  }
}

/** Per customer: orders that went ahead, what they came to, and the first and last order's day. */
function orderStats(tx: Tx) {
  return tx
    .select({
      customerId: orders.customerId,
      orders: sql<number>`(count(*) filter (where ${countsAsSale}))::int`.as('orders'),
      spent: sql<string>`coalesce(sum(${dueSql}) filter (where ${countsAsSale}), 0)`.as('spent'),
      firstOrderOn: sql<string>`min(${orders.businessDate})::text`.as('first_order_on'),
      lastOrderOn: sql<string>`max(${orders.businessDate})::text`.as('last_order_on'),
    })
    .from(orders)
    .where(and(isNotNull(orders.customerId), isNull(orders.deletedAt)))
    .groupBy(orders.customerId)
    .as('stats');
}

function customerColumns(stats: ReturnType<typeof orderStats>) {
  return {
    id: customers.id,
    phone: customers.phone,
    name: customers.name,
    notes: customers.notes,
    orders: stats.orders,
    spent: stats.spent,
    firstOrderOn: stats.firstOrderOn,
    lastOrderOn: stats.lastOrderOn,
  };
}

function toCustomer(
  row: {
    id: string;
    phone: string;
    name: string | null;
    notes: string | null;
    orders: number | null;
    spent: string | null;
    firstOrderOn: string | null;
    lastOrderOn: string | null;
  },
  actor: Actor,
) {
  return {
    ...row,
    orders: row.orders ?? 0,
    spent: actor.capabilities.has('reports.revenue.view') ? Number(row.spent ?? 0) : null,
  };
}

@Controller('customers')
@ApiBearerAuth()
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Authorized()
  @ApiOkResponse({ type: CustomerRowDto.Output, isArray: true })
  list(@CurrentActor() actor: Actor, @Query() query: CustomersQueryDto) {
    return this.customers.list(actor, query);
  }

  @Get(':customerId')
  @Authorized()
  @ApiOkResponse({ type: CustomerDetailDto.Output })
  detail(@CurrentActor() actor: Actor, @Param('customerId') customerId: string) {
    return this.customers.detail(actor, customerId);
  }

  /** A name and notes, which the tablets get at their next sync. The number never changes. */
  @Put(':customerId')
  @Authorized('customers.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async save(
    @CurrentActor() actor: Actor,
    @Param('customerId') customerId: string,
    @Body() body: SaveCustomerDto,
  ) {
    await this.customers.save(actor, customerId, body);
  }
}

@Module({
  imports: [OrdersModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
