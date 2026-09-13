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
} from '@nestjs/common';
import {
  and,
  asc,
  categories,
  eq,
  inArray,
  isNull,
  itemChannelPrices,
  itemModifierGroups,
  itemVariants,
  items,
  modifierGroups,
  modifiers,
  priceHistory,
  sql,
  stockItems,
  tenantSettings,
  withTenant,
  type Tx,
} from '@plateraa/db';
import { STATIONS, pesewas, type Pesewas } from '@plateraa/shared';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { nullableText } from '../openapi';
import { PHOTO_STORE, type PhotoStore } from '../photos/photo-store';
import { PhotosModule } from '../photos/photos';
import { businessToday } from '../reports/business-day';
import { ZonesController, ZonesService } from './zones';

/** The delivery platforms an item can have its own price on. */
const CHANNELS = ['BOLT_FOOD', 'CHOWDECK'] as const;
type Channel = (typeof CHANNELS)[number];

const price = z.number().int().min(0).max(100_000_000);
const optionalPrice = price.nullable().optional();
const channelPricesInput = z
  .object({ BOLT_FOOD: optionalPrice, CHOWDECK: optionalPrice })
  .default({});

class SaveItemDto extends createZodDto(
  z.object({
    categoryId: z.ulid().nullable(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).nullable().optional(),
    /** Used when there are no sizes; with sizes, each size has its own price. */
    price,
    /** Only saved for people who may see margins; left out, the current cost stays. */
    costPrice: optionalPrice,
    prepMinutes: z.number().int().min(0).max(240).nullable().optional(),
    station: z.enum(STATIONS),
    variants: z
      .array(
        z.object({
          id: z.ulid(),
          name: z.string().trim().min(1).max(40),
          price,
          costPrice: optionalPrice,
          channelPrices: channelPricesInput,
        }),
      )
      .max(10),
    groups: z
      .array(
        z.object({
          id: z.ulid(),
          name: z.string().trim().min(1).max(60),
          required: z.boolean(),
          maxSelect: z.number().int().min(1).max(20),
          options: z
            .array(
              z.object({
                id: z.ulid(),
                name: z.string().trim().min(1).max(60),
                priceDelta: z.number().int().min(-100_000_000).max(100_000_000),
              }),
            )
            .min(1)
            .max(30),
        }),
      )
      .max(10),
    /** A different price on Bolt Food or Chowdeck; null or left out means the menu price. */
    channelPrices: channelPricesInput,
  }),
) {}

class SoldOutDto extends createZodDto(z.object({ soldOut: z.boolean() })) {}

class CategoryDto extends createZodDto(
  z.object({ id: z.ulid(), name: z.string().trim().min(1).max(40) }),
) {}

class RenameCategoryDto extends createZodDto(
  z.object({ name: z.string().trim().min(1).max(40) }),
) {}

const money = z.number().int();
const channelPricesOutput = z.object({
  BOLT_FOOD: money.nullable(),
  CHOWDECK: money.nullable(),
});

class MenuDto extends createZodDto(
  z.object({
    categories: z.array(z.object({ id: z.string(), name: z.string(), position: z.number().int() })),
    items: z.array(
      z.object({
        id: z.string(),
        categoryId: nullableText(),
        name: z.string(),
        description: nullableText(),
        price: money,
        /** Set on the item editor; shown on the online store. */
        photoUrl: nullableText(),
        /** Null for people who may not see margins. */
        costPrice: money.nullable(),
        prepMinutes: z.number().int().nullable(),
        station: z.enum(STATIONS),
        soldOutToday: z.boolean(),
        position: z.number().int(),
        channelPrices: channelPricesOutput,
        variants: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            price: money,
            costPrice: money.nullable(),
            channelPrices: channelPricesOutput,
          }),
        ),
        groups: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            required: z.boolean(),
            maxSelect: z.number().int(),
            options: z.array(z.object({ id: z.string(), name: z.string(), priceDelta: money })),
            /** Other items using the same extras group: changing it changes them too. */
            sharedWith: z.array(z.string()),
          }),
        ),
      }),
    ),
  }),
) {}

class SavedDto extends createZodDto(z.object({ id: z.string() })) {}
class SoldOutSavedDto extends createZodDto(z.object({ soldOutToday: z.boolean() })) {}

type SaveItemInput = z.infer<typeof SaveItemDto.schema>;

class StarterMenuDto extends createZodDto(
  z.object({
    categories: z
      .array(
        z.object({
          id: z.ulid(),
          name: z.string().trim().min(1).max(40),
          items: z
            .array(z.object({ id: z.ulid(), item: SaveItemDto.schema.omit({ categoryId: true }) }))
            .min(1)
            .max(60),
        }),
      )
      .min(1)
      .max(20),
  }),
) {}

type StarterMenuInput = z.infer<typeof StarterMenuDto.schema>;

class StarterDoneDto extends createZodDto(z.object({ items: z.number().int() })) {}

/**
 * Menu setup on the dashboard (plan.md §3.1). Everything syncs to the tablets: removals are soft
 * deletes so they reach the tablet too, and every price change is kept in price history, so an
 * order taken offline just before a change still matches.
 */
@Injectable()
export class MenuService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(PHOTO_STORE) private readonly photos: PhotoStore,
  ) {}

  async menu(actor: Actor) {
    const seesCost = actor.capabilities.has('reports.revenue.view');
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const today = (await businessToday(tx)).date;
      const cats = await tx
        .select({ id: categories.id, name: categories.name, position: categories.position })
        .from(categories)
        .where(and(isNull(categories.deletedAt), eq(categories.active, true)))
        .orderBy(asc(categories.position), asc(categories.name));
      const itemRows = await tx
        .select()
        .from(items)
        .where(and(isNull(items.deletedAt), eq(items.active, true)))
        .orderBy(asc(items.position), asc(items.name));
      const variantRows = await tx
        .select()
        .from(itemVariants)
        .where(and(isNull(itemVariants.deletedAt), eq(itemVariants.active, true)))
        .orderBy(asc(itemVariants.position));
      const links = await tx
        .select()
        .from(itemModifierGroups)
        .where(isNull(itemModifierGroups.deletedAt))
        .orderBy(asc(itemModifierGroups.position));
      const groupRows = await tx
        .select()
        .from(modifierGroups)
        .where(isNull(modifierGroups.deletedAt));
      const optionRows = await tx
        .select()
        .from(modifiers)
        .where(and(isNull(modifiers.deletedAt), eq(modifiers.active, true)))
        .orderBy(asc(modifiers.position));
      const channelRows = await tx
        .select()
        .from(itemChannelPrices)
        .where(
          and(
            inArray(itemChannelPrices.source, [...CHANNELS]),
            isNull(itemChannelPrices.deletedAt),
          ),
        );

      const nameOf = new Map(itemRows.map((item) => [item.id, item.name]));
      const channelPrices = (itemId: string, variantId: string | null) => {
        const priceOn = (source: Channel) =>
          channelRows.find(
            (row) => row.itemId === itemId && row.variantId === variantId && row.source === source,
          )?.price ?? null;
        return { BOLT_FOOD: priceOn('BOLT_FOOD'), CHOWDECK: priceOn('CHOWDECK') };
      };

      return {
        categories: cats,
        items: itemRows.map((item) => ({
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          description: item.description,
          price: item.price,
          photoUrl: item.photoKey ? this.photos.urlOf(item.photoKey) : null,
          costPrice: seesCost ? item.costPrice : null,
          prepMinutes: item.prepMinutes,
          station: item.station,
          soldOutToday: item.soldOutOn === today,
          position: item.position,
          channelPrices: channelPrices(item.id, null),
          variants: variantRows
            .filter((variant) => variant.itemId === item.id)
            .map((variant) => ({
              id: variant.id,
              name: variant.name,
              price: variant.price,
              costPrice: seesCost ? variant.costPrice : null,
              channelPrices: channelPrices(item.id, variant.id),
            })),
          groups: links
            .filter((link) => link.itemId === item.id)
            .flatMap((link) => {
              const group = groupRows.find((row) => row.id === link.groupId);
              if (!group) return [];
              return [
                {
                  id: group.id,
                  name: group.name,
                  required: group.minSelect > 0,
                  maxSelect:
                    group.maxSelect ?? optionRows.filter((o) => o.groupId === group.id).length,
                  options: optionRows
                    .filter((option) => option.groupId === group.id)
                    .map((option) => ({
                      id: option.id,
                      name: option.name,
                      priceDelta: option.priceDelta,
                    })),
                  sharedWith: links
                    .filter((other) => other.groupId === group.id && other.itemId !== item.id)
                    .flatMap((other) => nameOf.get(other.itemId) ?? []),
                },
              ];
            }),
        })),
      };
    });
  }

  /** Creates the item, or replaces it with what the editor sent: sizes, extras and prices. */
  async saveItem(actor: Actor, itemId: string, input: SaveItemInput) {
    if (!z.ulid().safeParse(itemId).success)
      throw new BadRequestException('That item id is not valid');
    return withTenant(this.database.db, actor.tenantId, (tx) =>
      this.saveItemIn(tx, actor, itemId, input),
    );
  }

  /**
   * The starter menu from onboarding, all at once: categories, and items with their sizes and
   * prices and the template's extras (at no extra charge until the owner sets one). One
   * transaction, so a dropped connection can't leave half a menu. Only for an empty menu.
   */
  async starterMenu(actor: Actor, input: StarterMenuInput) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: items.id })
        .from(items)
        .where(isNull(items.deletedAt))
        .limit(1);
      if (existing) {
        throw new BadRequestException(
          'This business already has a menu. Add to it on the Menu page.',
        );
      }
      let added = 0;
      for (const [position, category] of input.categories.entries()) {
        await tx
          .insert(categories)
          .values({ id: category.id, tenantId: actor.tenantId, name: category.name, position });
        for (const entry of category.items) {
          await this.saveItemIn(tx, actor, entry.id, { ...entry.item, categoryId: category.id });
          added += 1;
        }
      }
      return { items: added };
    });
  }

  private async saveItemIn(tx: Tx, actor: Actor, itemId: string, input: SaveItemInput) {
    const seesCost = actor.capabilities.has('reports.revenue.view');
    {
      if (input.categoryId) {
        const [category] = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.id, input.categoryId), isNull(categories.deletedAt)));
        if (!category) throw new BadRequestException('That category no longer exists');
      }

      const [existing] = await tx.select().from(items).where(eq(items.id, itemId)).for('update');
      if (existing?.deletedAt) throw new BadRequestException('That item was removed from the menu');
      const costPrice = (given: number | null | undefined, current: Pesewas | null | undefined) =>
        seesCost && given !== undefined
          ? given === null
            ? null
            : pesewas(given)
          : (current ?? null);

      const values = {
        categoryId: input.categoryId,
        name: input.name,
        description: input.description ?? null,
        price: pesewas(input.variants[0]?.price ?? input.price),
        costPrice: costPrice(input.costPrice, existing?.costPrice),
        prepMinutes: input.prepMinutes ?? null,
        station: input.station,
      };

      if (existing) {
        await tx.update(items).set(values).where(eq(items.id, itemId));
        if (existing.price !== values.price)
          await newPrice(tx, actor.tenantId, itemId, null, values.price);
      } else {
        const [last] = await tx
          .select({ position: sql<number>`coalesce(max(${items.position}), -1)::int` })
          .from(items)
          .where(isNull(items.deletedAt));
        await tx.insert(items).values({
          id: itemId,
          tenantId: actor.tenantId,
          ...values,
          position: (last?.position ?? -1) + 1,
        });
        await newPrice(tx, actor.tenantId, itemId, null, values.price);
        await this.addPortionCount(tx, actor.tenantId, itemId, input.name);
      }

      await this.saveVariants(tx, actor.tenantId, itemId, input, costPrice);
      await this.saveChannelPrices(tx, actor.tenantId, itemId, input);
      await this.saveGroups(tx, actor.tenantId, itemId, input);

      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: existing ? 'item.updated' : 'item.created',
        entityType: 'item',
        entityId: itemId,
        before: existing ? { name: existing.name, price: existing.price } : null,
        after: {
          name: input.name,
          price: values.price,
          variants: input.variants.map(({ name, price: variantPrice }) => ({
            name,
            price: variantPrice,
          })),
          channelPrices: input.channelPrices,
        },
      });
      return { id: itemId };
    }
  }

  /** Sizes: kept, changed, added or removed. A changed price starts a new price-history row. */
  private async saveVariants(
    tx: Tx,
    tenantId: string,
    itemId: string,
    input: SaveItemInput,
    costPrice: (
      given: number | null | undefined,
      current: Pesewas | null | undefined,
    ) => Pesewas | null,
  ) {
    const current = await tx
      .select()
      .from(itemVariants)
      .where(and(eq(itemVariants.itemId, itemId), isNull(itemVariants.deletedAt)));
    const ids = input.variants.map((variant) => variant.id);
    // Includes sizes removed earlier: sending one back brings it back.
    const known = ids.length
      ? await tx.select().from(itemVariants).where(inArray(itemVariants.id, ids))
      : [];
    if (known.some((row) => row.itemId !== itemId)) {
      throw new BadRequestException('A size on this item belongs to another item');
    }

    for (const [position, variant] of input.variants.entries()) {
      const found = known.find((row) => row.id === variant.id);
      const variantPrice = pesewas(variant.price);
      if (found) {
        await tx
          .update(itemVariants)
          .set({
            name: variant.name,
            price: variantPrice,
            costPrice: costPrice(variant.costPrice, found.costPrice),
            position,
            deletedAt: null,
          })
          .where(eq(itemVariants.id, variant.id));
        if (found.deletedAt || found.price !== variantPrice) {
          await newPrice(tx, tenantId, itemId, variant.id, variantPrice);
        }
      } else {
        await tx.insert(itemVariants).values({
          id: variant.id,
          tenantId,
          itemId,
          name: variant.name,
          price: variantPrice,
          costPrice: costPrice(variant.costPrice, null),
          position,
        });
        await newPrice(tx, tenantId, itemId, variant.id, variantPrice);
      }
    }

    for (const gone of current.filter((row) => !ids.includes(row.id))) {
      await tx
        .update(itemVariants)
        .set({ deletedAt: new Date() })
        .where(eq(itemVariants.id, gone.id));
      await closePrice(tx, itemId, gone.id);
    }
  }

  /**
   * Bolt Food and Chowdeck prices for the item, or for each size. Blank means the menu price.
   * Rows are updated or soft-deleted rather than replaced, so every change reaches the tablets.
   */
  private async saveChannelPrices(tx: Tx, tenantId: string, itemId: string, input: SaveItemInput) {
    const wanted = [
      ...(input.variants.length ? [] : [{ variantId: null, prices: input.channelPrices }]),
      ...input.variants.map((variant) => ({
        variantId: variant.id,
        prices: variant.channelPrices,
      })),
    ].flatMap(({ variantId, prices }) =>
      CHANNELS.flatMap((source) => {
        const channelPrice = prices[source];
        return channelPrice === null || channelPrice === undefined
          ? []
          : [{ variantId, source, price: pesewas(channelPrice) }];
      }),
    );
    const live = await tx
      .select()
      .from(itemChannelPrices)
      .where(and(eq(itemChannelPrices.itemId, itemId), isNull(itemChannelPrices.deletedAt)));
    const same = (a: { variantId: string | null; source: string }, b: typeof a) =>
      a.variantId === b.variantId && a.source === b.source;

    for (const row of wanted) {
      const found = live.find((existing) => same(existing, row));
      if (!found) {
        await tx.insert(itemChannelPrices).values({ id: ulid(), tenantId, itemId, ...row });
      } else if (found.price !== row.price) {
        await tx
          .update(itemChannelPrices)
          .set({ price: row.price })
          .where(eq(itemChannelPrices.id, found.id));
      }
    }
    for (const gone of live.filter((existing) => !wanted.some((row) => same(existing, row)))) {
      await tx
        .update(itemChannelPrices)
        .set({ deletedAt: new Date() })
        .where(eq(itemChannelPrices.id, gone.id));
    }
  }

  /**
   * Extras groups and their options. A group can be shared by several items; editing it here
   * changes it for all of them. Groups taken off this item are unlinked, not deleted.
   */
  private async saveGroups(tx: Tx, tenantId: string, itemId: string, input: SaveItemInput) {
    const links = await tx
      .select()
      .from(itemModifierGroups)
      .where(and(eq(itemModifierGroups.itemId, itemId), isNull(itemModifierGroups.deletedAt)));

    for (const [position, group] of input.groups.entries()) {
      const [found] = await tx.select().from(modifierGroups).where(eq(modifierGroups.id, group.id));
      const groupValues = {
        name: group.name,
        minSelect: group.required ? 1 : 0,
        maxSelect: Math.max(group.maxSelect, group.required ? 1 : 0),
      };
      if (found) {
        // A group removed earlier comes back when it's sent again.
        await tx
          .update(modifierGroups)
          .set({ ...groupValues, deletedAt: null })
          .where(eq(modifierGroups.id, group.id));
      } else {
        await tx
          .insert(modifierGroups)
          .values({ id: group.id, tenantId, position, ...groupValues });
      }

      const options = await tx
        .select()
        .from(modifiers)
        .where(and(eq(modifiers.groupId, group.id), isNull(modifiers.deletedAt)));
      const optionIds = group.options.map((option) => option.id);
      const elsewhere = await tx
        .select({ id: modifiers.id, groupId: modifiers.groupId })
        .from(modifiers)
        .where(inArray(modifiers.id, optionIds));
      if (elsewhere.some((row) => row.groupId !== group.id)) {
        throw new BadRequestException(`An option in "${group.name}" belongs to another group`);
      }
      for (const [optionPosition, option] of group.options.entries()) {
        const optionValues = {
          name: option.name,
          priceDelta: pesewas(option.priceDelta),
          position: optionPosition,
        };
        if (elsewhere.some((row) => row.id === option.id)) {
          // Includes an option removed earlier: sending it back brings it back.
          await tx
            .update(modifiers)
            .set({ ...optionValues, deletedAt: null })
            .where(eq(modifiers.id, option.id));
        } else {
          await tx
            .insert(modifiers)
            .values({ id: option.id, tenantId, groupId: group.id, ...optionValues });
        }
      }
      for (const gone of options.filter((row) => !optionIds.includes(row.id))) {
        await tx.update(modifiers).set({ deletedAt: new Date() }).where(eq(modifiers.id, gone.id));
      }

      const link = links.find((row) => row.groupId === group.id);
      if (link) {
        await tx
          .update(itemModifierGroups)
          .set({ position })
          .where(eq(itemModifierGroups.id, link.id));
      } else {
        await tx
          .insert(itemModifierGroups)
          .values({ id: ulid(), tenantId, itemId, groupId: group.id, position });
      }
    }

    const kept = input.groups.map((group) => group.id);
    for (const gone of links.filter((link) => !kept.includes(link.groupId))) {
      await tx
        .update(itemModifierGroups)
        .set({ deletedAt: new Date() })
        .where(eq(itemModifierGroups.id, gone.id));
    }
  }

  /** With portion counts on, a new item gets its daily count record too (plan.md §3.1). */
  private async addPortionCount(tx: Tx, tenantId: string, itemId: string, name: string) {
    const [settings] = await tx
      .select({ countPortions: tenantSettings.countPortions })
      .from(tenantSettings);
    if (!settings?.countPortions) return;
    await tx
      .insert(stockItems)
      .values({ id: ulid(), tenantId, kind: 'SELLABLE', itemId, name, unit: 'portion', onHand: 0 });
  }

  /** Takes the item off the menu, on the tablets too. Past orders keep their own copy. */
  async removeItem(actor: Actor, itemId: string) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const item = await liveItem(tx, itemId);
      const now = new Date();
      await tx.update(items).set({ deletedAt: now }).where(eq(items.id, itemId));
      await tx
        .update(itemVariants)
        .set({ deletedAt: now })
        .where(and(eq(itemVariants.itemId, itemId), isNull(itemVariants.deletedAt)));
      await tx
        .update(itemModifierGroups)
        .set({ deletedAt: now })
        .where(and(eq(itemModifierGroups.itemId, itemId), isNull(itemModifierGroups.deletedAt)));
      await tx
        .update(itemChannelPrices)
        .set({ deletedAt: now })
        .where(and(eq(itemChannelPrices.itemId, itemId), isNull(itemChannelPrices.deletedAt)));
      await tx
        .update(priceHistory)
        .set({ validTo: now })
        .where(and(eq(priceHistory.itemId, itemId), isNull(priceHistory.validTo)));
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'item.removed',
        entityType: 'item',
        entityId: itemId,
        before: { name: item.name, price: item.price },
      });
    });
  }

  /** Sold out for today only: it can't be ordered until tomorrow. */
  async setSoldOut(actor: Actor, itemId: string, soldOut: boolean) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      await liveItem(tx, itemId);
      const today = (await businessToday(tx)).date;
      await tx
        .update(items)
        .set({ soldOutOn: soldOut ? today : null })
        .where(eq(items.id, itemId));
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'item.sold_out',
        entityType: 'item',
        entityId: itemId,
        after: { soldOut, businessDate: today },
      });
      return { soldOutToday: soldOut };
    });
  }

  async addCategory(actor: Actor, input: { id: string; name: string }) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, input.id));
      if (existing) return { id: existing.id };
      const [last] = await tx
        .select({ position: sql<number>`coalesce(max(${categories.position}), -1)::int` })
        .from(categories)
        .where(isNull(categories.deletedAt));
      await tx.insert(categories).values({
        id: input.id,
        tenantId: actor.tenantId,
        name: input.name,
        position: (last?.position ?? -1) + 1,
      });
      return { id: input.id };
    });
  }

  async renameCategory(actor: Actor, categoryId: string, name: string) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [updated] = await tx
        .update(categories)
        .set({ name })
        .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)))
        .returning({ id: categories.id });
      if (!updated) throw new NotFoundException('There is no such category');
      return { id: updated.id };
    });
  }

  /** Only an empty category can go, so no item is left without its place on the tablet. */
  async removeCategory(actor: Actor, categoryId: string) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [inUse] = await tx
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.categoryId, categoryId), isNull(items.deletedAt)))
        .limit(1);
      if (inUse) throw new BadRequestException('Move or remove the items in this category first');
      await tx
        .update(categories)
        .set({ deletedAt: new Date() })
        .where(eq(categories.id, categoryId));
    });
  }
}

async function liveItem(tx: Tx, itemId: string) {
  const [item] = await tx
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), isNull(items.deletedAt)));
  if (!item) throw new NotFoundException('That item is not on the menu');
  return item;
}

/** Ends the current price of an item or size. */
async function closePrice(tx: Tx, itemId: string, variantId: string | null) {
  await tx
    .update(priceHistory)
    .set({ validTo: new Date() })
    .where(
      and(
        eq(priceHistory.itemId, itemId),
        variantId ? eq(priceHistory.variantId, variantId) : isNull(priceHistory.variantId),
        isNull(priceHistory.validTo),
      ),
    );
}

/** Ends the current price and starts the new one, so both are known for orders taken offline. */
async function newPrice(
  tx: Tx,
  tenantId: string,
  itemId: string,
  variantId: string | null,
  newAmount: Pesewas,
) {
  await closePrice(tx, itemId, variantId);
  await tx
    .insert(priceHistory)
    .values({ id: ulid(), tenantId, itemId, variantId, price: newAmount });
}

@Controller('menu')
@ApiBearerAuth()
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  @Authorized('catalog.manage')
  @ApiOkResponse({ type: MenuDto.Output })
  get(@CurrentActor() actor: Actor) {
    return this.menu.menu(actor);
  }

  @Put('items/:itemId')
  @Authorized('catalog.manage')
  @ApiOkResponse({ type: SavedDto.Output })
  saveItem(
    @CurrentActor() actor: Actor,
    @Param('itemId') itemId: string,
    @Body() body: SaveItemDto,
  ) {
    return this.menu.saveItem(actor, itemId, body);
  }

  /** Onboarding's starter menu, from a template and the prices typed into the grid. */
  @Post('starter')
  @Authorized('catalog.manage')
  @ApiCreatedResponse({ type: StarterDoneDto.Output })
  starter(@CurrentActor() actor: Actor, @Body() body: StarterMenuDto) {
    return this.menu.starterMenu(actor, body);
  }

  @Delete('items/:itemId')
  @HttpCode(204)
  @Authorized('catalog.manage')
  async removeItem(@CurrentActor() actor: Actor, @Param('itemId') itemId: string) {
    await this.menu.removeItem(actor, itemId);
  }

  @Put('items/:itemId/sold-out')
  @Authorized('catalog.manage')
  @ApiOkResponse({ type: SoldOutSavedDto.Output })
  setSoldOut(
    @CurrentActor() actor: Actor,
    @Param('itemId') itemId: string,
    @Body() body: SoldOutDto,
  ) {
    return this.menu.setSoldOut(actor, itemId, body.soldOut);
  }

  @Post('categories')
  @Authorized('catalog.manage')
  @ApiCreatedResponse({ type: SavedDto.Output })
  addCategory(@CurrentActor() actor: Actor, @Body() body: CategoryDto) {
    return this.menu.addCategory(actor, body);
  }

  @Put('categories/:categoryId')
  @Authorized('catalog.manage')
  @ApiOkResponse({ type: SavedDto.Output })
  renameCategory(
    @CurrentActor() actor: Actor,
    @Param('categoryId') categoryId: string,
    @Body() body: RenameCategoryDto,
  ) {
    return this.menu.renameCategory(actor, categoryId, body.name);
  }

  @Delete('categories/:categoryId')
  @HttpCode(204)
  @Authorized('catalog.manage')
  async removeCategory(@CurrentActor() actor: Actor, @Param('categoryId') categoryId: string) {
    await this.menu.removeCategory(actor, categoryId);
  }
}

@Module({
  imports: [PhotosModule],
  controllers: [MenuController, ZonesController],
  providers: [MenuService, ZonesService],
})
export class MenuModule {}
