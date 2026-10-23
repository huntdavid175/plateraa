import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  expenses,
  gte,
  isNull,
  locations,
  lte,
  sql,
  staffMembers,
  stockItems,
  stockMovements,
  withTenant,
  type Tx,
} from '@brixx/db';
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, pesewas } from '@brixx/shared';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { nullableText } from '../openapi';
import { businessToday } from '../reports/business-day';

class ExpensesQueryDto extends createZodDto(
  z.object({
    /** First and last day, YYYY-MM-DD. Leave them out for the last 30 days. */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  }),
) {}

class AddExpenseDto extends createZodDto(
  z.object({
    /** Made by the dashboard, so sending it twice records it once. */
    id: z.ulid(),
    amount: z.number().int().positive().max(100_000_000),
    category: z.enum(EXPENSE_CATEGORIES),
    /** Cash from a drawer is a payout, recorded against the drawer instead. */
    method: z.enum(['OWNER_CASH', 'MOMO', 'BANK', 'OTHER']),
    spentOn: z.iso.date(),
    note: z.string().trim().max(200).optional(),
    supplierName: z.string().trim().max(80).optional(),
    /** A purchase adds to an ingredient's stock. */
    purchase: z
      .object({ stockItemId: z.ulid(), quantity: z.number().int().positive().max(100_000) })
      .optional(),
  }),
) {}

class ExpenseRowDto extends createZodDto(
  z.object({
    id: z.string(),
    spentOn: z.string(),
    amount: z.number().int(),
    category: z.enum(EXPENSE_CATEGORIES),
    method: z.enum(EXPENSE_METHODS),
    note: nullableText(),
    supplierName: nullableText(),
    /** A payout from a tablet's drawer: it stays with the drawer and can't be removed here. */
    fromDrawer: z.boolean(),
    purchase: z
      .object({
        stockItemId: z.string(),
        name: z.string(),
        unit: z.string(),
        quantity: z.number().int(),
      })
      .nullable(),
    by: nullableText(),
  }),
) {}

class AddStockItemDto extends createZodDto(
  z.object({
    id: z.ulid(),
    name: z.string().trim().min(1).max(60),
    /** What it's counted in: bag, crate, litre, … */
    unit: z.string().trim().min(1).max(20),
    lowThreshold: z.number().int().min(0).max(100_000).nullable().optional(),
    /** How many there are now. */
    onHand: z.number().int().min(0).max(100_000).optional(),
  }),
) {}

class UpdateStockItemDto extends createZodDto(
  z.object({
    name: z.string().trim().min(1).max(60),
    unit: z.string().trim().min(1).max(20),
    lowThreshold: z.number().int().min(0).max(100_000).nullable(),
  }),
) {}

class CountDto extends createZodDto(
  z.object({ movementId: z.ulid(), counted: z.number().int().min(0).max(100_000) }),
) {}

class StockRowDto extends createZodDto(
  z.object({
    id: z.string(),
    name: z.string(),
    unit: z.string(),
    onHand: z.number().int(),
    lowThreshold: z.number().int().nullable(),
    /** At or under its low mark: time to buy more. */
    low: z.boolean(),
  }),
) {}

class SavedDto extends createZodDto(z.object({ id: z.string() })) {}

class CountedDto extends createZodDto(
  z.object({
    onHand: z.number().int(),
    /** Counted minus expected: below zero means some went missing. */
    difference: z.number().int(),
  }),
) {}

const DAY_MS = 86_400_000;
const shiftDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Money out that isn't a drawer payout (plan.md §3.1): rent, gas bought with the owner's cash, a
 * MoMo transfer to a supplier. A purchase also adds to an ingredient's stock, and a count of an
 * ingredient records the difference, so shrinkage shows up.
 */
@Injectable()
export class ExpensesService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async list(actor: Actor, query: { from?: string; to?: string }) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const today = (await businessToday(tx)).date;
      const to = query.to ?? today;
      const from = query.from ?? shiftDays(to, -29);
      const rows = await tx
        .select({
          expense: expenses,
          by: staffMembers.displayName,
          stockName: stockItems.name,
          stockUnit: stockItems.unit,
        })
        .from(expenses)
        .leftJoin(staffMembers, eq(staffMembers.id, expenses.createdBy))
        .leftJoin(stockItems, eq(stockItems.id, expenses.stockItemId))
        .where(
          and(isNull(expenses.deletedAt), gte(expenses.spentOn, from), lte(expenses.spentOn, to)),
        )
        .orderBy(desc(expenses.spentOn), desc(expenses.createdAt));
      return rows.map(({ expense, by, stockName, stockUnit }) => ({
        id: expense.id,
        spentOn: expense.spentOn,
        amount: expense.amount,
        category: expense.category,
        method: expense.method,
        note: expense.note,
        supplierName: expense.supplierName,
        fromDrawer: expense.cashMovementId !== null,
        purchase:
          expense.stockItemId && expense.stockQuantity !== null
            ? {
                stockItemId: expense.stockItemId,
                name: stockName ?? 'Removed item',
                unit: stockUnit ?? '',
                quantity: expense.stockQuantity,
              }
            : null,
        by,
      }));
    });
  }

  async add(actor: Actor, input: z.infer<typeof AddExpenseDto.schema>) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: expenses.id })
        .from(expenses)
        .where(eq(expenses.id, input.id));
      if (existing) return { id: existing.id };

      const today = await businessToday(tx);
      if (input.spentOn > today.date) throw new BadRequestException("That date hasn't come yet");
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.isDefault, true));
      if (!location) throw new Error('This business has no default location');

      if (input.purchase) {
        const stock = await liveRawItem(tx, input.purchase.stockItemId);
        await tx
          .update(stockItems)
          .set({ onHand: sql`${stockItems.onHand} + ${input.purchase.quantity}` })
          .where(eq(stockItems.id, stock.id));
        await tx.insert(stockMovements).values({
          id: ulid(),
          tenantId: actor.tenantId,
          stockItemId: stock.id,
          type: 'PURCHASE',
          quantity: input.purchase.quantity,
          businessDate: input.spentOn,
          staffId: actor.staffId,
        });
      }

      await tx.insert(expenses).values({
        id: input.id,
        tenantId: actor.tenantId,
        locationId: location.id,
        amount: pesewas(input.amount),
        category: input.category,
        method: input.method,
        note: input.note || null,
        spentOn: input.spentOn,
        supplierName: input.supplierName || null,
        stockItemId: input.purchase?.stockItemId ?? null,
        stockQuantity: input.purchase?.quantity ?? null,
        createdBy: actor.staffId,
      });
      await audit(tx, actor, 'expense.added', 'expense', input.id, null, input);
      return { id: input.id };
    });
  }

  /** Takes an expense back out, putting back a purchase's stock. Drawer payouts stay. */
  async remove(actor: Actor, expenseId: string) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [expense] = await tx
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
        .for('update');
      if (!expense) throw new NotFoundException('There is no such expense');
      if (expense.cashMovementId) {
        throw new BadRequestException(
          "A payout from a drawer can't be removed: the drawer counts on it.",
        );
      }
      if (expense.stockItemId && expense.stockQuantity) {
        const today = (await businessToday(tx)).date;
        await tx
          .update(stockItems)
          .set({ onHand: sql`${stockItems.onHand} - ${expense.stockQuantity}` })
          .where(eq(stockItems.id, expense.stockItemId));
        await tx.insert(stockMovements).values({
          id: ulid(),
          tenantId: actor.tenantId,
          stockItemId: expense.stockItemId,
          type: 'PURCHASE',
          quantity: -expense.stockQuantity,
          businessDate: today,
          staffId: actor.staffId,
        });
      }
      await tx.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, expenseId));
      await audit(
        tx,
        actor,
        'expense.removed',
        'expense',
        expenseId,
        {
          amount: expense.amount,
          category: expense.category,
          spentOn: expense.spentOn,
        },
        null,
      );
    });
  }

  /** Raw ingredients: what's in, and whether it's running low. */
  async stock(actor: Actor) {
    const rows = await withTenant(this.database.db, actor.tenantId, (tx) =>
      tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.kind, 'RAW'), isNull(stockItems.deletedAt)))
        .orderBy(asc(stockItems.name)),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      onHand: row.onHand,
      lowThreshold: row.lowThreshold,
      low: row.lowThreshold !== null && row.onHand <= row.lowThreshold,
    }));
  }

  async addStockItem(actor: Actor, input: z.infer<typeof AddStockItemDto.schema>) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: stockItems.id })
        .from(stockItems)
        .where(eq(stockItems.id, input.id));
      if (existing) return { id: existing.id };
      const onHand = input.onHand ?? 0;
      await tx.insert(stockItems).values({
        id: input.id,
        tenantId: actor.tenantId,
        kind: 'RAW',
        name: input.name,
        unit: input.unit,
        lowThreshold: input.lowThreshold ?? null,
        onHand,
      });
      if (onHand > 0) {
        await tx.insert(stockMovements).values({
          id: ulid(),
          tenantId: actor.tenantId,
          stockItemId: input.id,
          type: 'COUNT_ADJUST',
          quantity: onHand,
          businessDate: (await businessToday(tx)).date,
          staffId: actor.staffId,
        });
      }
      await audit(tx, actor, 'stock.item_added', 'stock_item', input.id, null, input);
      return { id: input.id };
    });
  }

  async updateStockItem(
    actor: Actor,
    stockItemId: string,
    input: z.infer<typeof UpdateStockItemDto.schema>,
  ) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const stock = await liveRawItem(tx, stockItemId);
      await tx.update(stockItems).set(input).where(eq(stockItems.id, stock.id));
      await audit(
        tx,
        actor,
        'stock.item_changed',
        'stock_item',
        stock.id,
        {
          name: stock.name,
          unit: stock.unit,
          lowThreshold: stock.lowThreshold,
        },
        input,
      );
    });
  }

  /** A count from the dashboard, like the tablet's: the difference is recorded, not hidden. */
  async count(actor: Actor, stockItemId: string, input: { movementId: string; counted: number }) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [done] = await tx
        .select({ id: stockMovements.id })
        .from(stockMovements)
        .where(eq(stockMovements.id, input.movementId));
      const stock = await liveRawItem(tx, stockItemId);
      if (done) return { onHand: stock.onHand, difference: 0 };

      const difference = input.counted - stock.onHand;
      await tx.update(stockItems).set({ onHand: input.counted }).where(eq(stockItems.id, stock.id));
      if (difference !== 0) {
        await tx.insert(stockMovements).values({
          id: input.movementId,
          tenantId: actor.tenantId,
          stockItemId: stock.id,
          type: 'COUNT_ADJUST',
          quantity: difference,
          businessDate: (await businessToday(tx)).date,
          staffId: actor.staffId,
        });
      }
      await audit(
        tx,
        actor,
        'stock.counted',
        'stock_item',
        stock.id,
        { onHand: stock.onHand },
        {
          onHand: input.counted,
        },
      );
      return { onHand: input.counted, difference };
    });
  }

  async removeStockItem(actor: Actor, stockItemId: string) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const stock = await liveRawItem(tx, stockItemId);
      await tx.update(stockItems).set({ deletedAt: new Date() }).where(eq(stockItems.id, stock.id));
      await audit(
        tx,
        actor,
        'stock.item_removed',
        'stock_item',
        stock.id,
        { name: stock.name },
        null,
      );
    });
  }
}

async function liveRawItem(tx: Tx, stockItemId: string) {
  const [stock] = await tx
    .select()
    .from(stockItems)
    .where(
      and(eq(stockItems.id, stockItemId), eq(stockItems.kind, 'RAW'), isNull(stockItems.deletedAt)),
    );
  if (!stock) throw new NotFoundException('That ingredient isn’t in stock any more');
  return stock;
}

function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  return recordAudit(tx, {
    tenantId: actor.tenantId,
    actorStaffId: actor.staffId,
    action,
    entityType,
    entityId,
    before,
    after,
  });
}

@Controller()
@ApiBearerAuth()
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get('expenses')
  @Authorized('expenses.manage')
  @ApiOkResponse({ type: ExpenseRowDto.Output, isArray: true })
  list(@CurrentActor() actor: Actor, @Query() query: ExpensesQueryDto) {
    return this.expenses.list(actor, query);
  }

  @Post('expenses')
  @Authorized('expenses.manage')
  @ApiCreatedResponse({ type: SavedDto.Output })
  add(@CurrentActor() actor: Actor, @Body() body: AddExpenseDto) {
    return this.expenses.add(actor, body);
  }

  @Delete('expenses/:expenseId')
  @Authorized('expenses.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(@CurrentActor() actor: Actor, @Param('expenseId') expenseId: string) {
    await this.expenses.remove(actor, expenseId);
  }

  @Get('stock')
  @Authorized('catalog.manage')
  @ApiOkResponse({ type: StockRowDto.Output, isArray: true })
  stock(@CurrentActor() actor: Actor) {
    return this.expenses.stock(actor);
  }

  @Post('stock')
  @Authorized('catalog.manage')
  @ApiCreatedResponse({ type: SavedDto.Output })
  addStockItem(@CurrentActor() actor: Actor, @Body() body: AddStockItemDto) {
    return this.expenses.addStockItem(actor, body);
  }

  @Put('stock/:stockItemId')
  @Authorized('catalog.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async updateStockItem(
    @CurrentActor() actor: Actor,
    @Param('stockItemId') stockItemId: string,
    @Body() body: UpdateStockItemDto,
  ) {
    await this.expenses.updateStockItem(actor, stockItemId, body);
  }

  @Post('stock/:stockItemId/count')
  @Authorized('catalog.manage')
  @ApiCreatedResponse({ type: CountedDto.Output })
  count(
    @CurrentActor() actor: Actor,
    @Param('stockItemId') stockItemId: string,
    @Body() body: CountDto,
  ) {
    return this.expenses.count(actor, stockItemId, body);
  }

  @Delete('stock/:stockItemId')
  @Authorized('catalog.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async removeStockItem(@CurrentActor() actor: Actor, @Param('stockItemId') stockItemId: string) {
    await this.expenses.removeStockItem(actor, stockItemId);
  }
}

@Module({ controllers: [ExpensesController], providers: [ExpensesService] })
export class ExpensesModule {}
