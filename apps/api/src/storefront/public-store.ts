import { randomBytes } from 'node:crypto';
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
} from '@nestjs/common';
import {
  and,
  asc,
  categories,
  deliveryZones,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  itemModifierGroups,
  itemVariants,
  items,
  locations,
  modifierGroups,
  modifiers,
  moolreAccounts,
  or,
  orderItems,
  orders,
  paymentLinks,
  sql,
  tenantSettings,
  tenants,
  withPlatform,
  withTenant,
  type Tx,
} from '@plateraa/db';
import {
  ORDER_STATUSES,
  ORDER_TYPES,
  STOREFRONT_THEMES,
  amountDue,
  phoneSchema,
  sub,
  type Pesewas,
  type SyncCommandOf,
} from '@plateraa/shared';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { nullableText } from '../openapi';
import { PaymentLinks } from '../payments/payment-links.service';
import { PHOTO_STORE, type PhotoStore } from '../photos/photo-store';
import { businessToday } from '../reports/business-day';
import {
  adjustSellableStock,
  quantitiesByItem,
  recordOrderEvent,
  upsertCustomer,
} from '../sync/handlers/common';
import { priceLines } from '../sync/handlers/orders';
import { CommandRejected, type HandlerContext } from '../sync/sync.types';
import { onlineStaffId } from './online-staff';
import { RateLimit } from './rate-limit';

type Line = SyncCommandOf<'order.create'>['payload']['lines'][number];

const money = z.number().int();
const text = (max: number) => z.string().trim().min(1).max(max);
const SLUG = /^[a-z0-9-]{1,60}$/;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

class StoreDto extends createZodDto(
  z.object({
    slug: z.string(),
    name: z.string(),
    area: nullableText(),
    phone: nullableText(),
    hours: nullableText(),
    theme: z.enum(STOREFRONT_THEMES),
    /** The store's own pictures, set on the dashboard; without them the header is its colour. */
    coverUrl: nullableText(),
    logoUrl: nullableText(),
    /** Taking orders right now; otherwise the menu shows but can't be ordered from. */
    open: z.boolean(),
    /** The vendor's Moolre account is connected, so customers can pay online. */
    payOnline: z.boolean(),
    cashOnPickup: z.boolean(),
    /** Delivery is offered only where there are zones; each has its fee. */
    zones: z.array(z.object({ id: z.string(), name: z.string(), fee: money })),
    categories: z.array(z.object({ id: z.string(), name: z.string() })),
    items: z.array(
      z.object({
        id: z.string(),
        categoryId: nullableText(),
        name: z.string(),
        description: nullableText(),
        price: money,
        photoUrl: nullableText(),
        soldOut: z.boolean(),
        variants: z.array(z.object({ id: z.string(), name: z.string(), price: money })),
        groups: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            /** At least this many; 0 means optional. */
            minSelect: z.number().int(),
            /** At most this many; null means no limit. */
            maxSelect: z.number().int().nullable(),
            options: z.array(z.object({ id: z.string(), name: z.string(), priceDelta: money })),
          }),
        ),
      }),
    ),
  }),
) {}

const placeOrderSchema = z.object({
  /** Made by the storefront when checkout opens: sending the same order twice records it once. */
  orderId: z.ulid(),
  type: z.enum(['PICKUP', 'DELIVERY']),
  lines: z
    .array(
      z.object({
        itemId: z.ulid(),
        variantId: z.ulid().optional(),
        quantity: z.int().min(1).max(50),
        /** The extras picked, one of each. */
        optionIds: z.array(z.ulid()).max(30).default([]),
        note: text(200).optional(),
      }),
    )
    .min(1)
    .max(40),
  customer: z.object({ name: text(80), phone: phoneSchema }),
  delivery: z.object({ zoneId: z.ulid(), address: text(300) }).optional(),
  note: text(300).optional(),
  payment: z.enum(['ONLINE', 'CASH']),
});
type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

class PlaceOrderDto extends createZodDto(placeOrderSchema) {}

class PlacedDto extends createZodDto(
  z.object({
    /** The key to the order's status page. */
    token: z.string(),
    number: z.string(),
    /** Moolre's payment page, for an order paid online. */
    payUrl: nullableText(),
    /** Why the payment page couldn't be opened; the order is saved all the same. */
    payProblem: nullableText(),
  }),
) {}

class PayDto extends createZodDto(
  z.object({ payUrl: nullableText(), payProblem: nullableText() }),
) {}

class TrackedDto extends createZodDto(
  z.object({
    number: z.string(),
    storeSlug: z.string(),
    storeName: z.string(),
    storePhone: nullableText(),
    theme: z.enum(STOREFRONT_THEMES),
    type: z.enum(ORDER_TYPES),
    status: z.enum(ORDER_STATUSES),
    /** The store accepts online orders before the kitchen starts, so "Accepted" is a step. */
    acceptsFirst: z.boolean(),
    /** Paid in cash when collected. */
    payOnCollection: z.boolean(),
    total: money,
    deliveryFee: money,
    amountDue: money,
    amountPaid: money,
    deliveryAddress: nullableText(),
    lines: z.array(
      z.object({
        name: z.string(),
        variantName: nullableText(),
        extras: z.array(z.string()),
        quantity: z.number().int(),
        lineTotal: money,
      }),
    ),
    /** The latest payment link: QUEUED, SENT, PAID, FAILED or EXPIRED. */
    linkStatus: nullableText(),
    /** Its payment page, while it can still be paid. */
    payUrl: nullableText(),
    placedAt: z.string(),
  }),
) {}

/** A payment link that can still be paid. */
const openLink = () =>
  or(
    eq(paymentLinks.status, 'QUEUED'),
    and(eq(paymentLinks.status, 'SENT'), gt(paymentLinks.expiresAt, new Date())),
  );

/**
 * The online store (plan.md §4.0): public routes, no login. The server checks everything and sets
 * every price from the menu; nothing the browser sends about money is trusted. Orders are recorded
 * under the business's "Online store" staff member, with no tablet, and reach the tablets at their
 * next sync.
 */
@Injectable()
export class PublicStoreService {
  private readonly perStore = new RateLimit(60, 10 * 60_000);
  private readonly perPhone = new RateLimit(6, 10 * 60_000);
  private readonly perOrder = new RateLimit(20, 60_000);

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly links: PaymentLinks,
    @Inject(PHOTO_STORE) private readonly photos: PhotoStore,
  ) {}

  private urlOf(key: string | null | undefined) {
    return key ? this.photos.urlOf(key) : null;
  }

  private get db() {
    return this.database.db;
  }

  /** The business behind a store link, if its online store is on. */
  private async tenantOf(slug: string) {
    const [tenant] = SLUG.test(slug)
      ? await withPlatform(this.db, (tx) =>
          tx
            .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
            .from(tenants)
            .innerJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id))
            .where(
              and(
                eq(tenants.slug, slug),
                eq(tenants.status, 'ACTIVE'),
                eq(tenantSettings.storefrontEnabled, true),
              ),
            ),
        )
      : [];
    if (!tenant) throw new NotFoundException("This link doesn't match any store");
    return tenant;
  }

  /** The order behind a status-page key. */
  private async orderOf(token: string) {
    const [order] = TOKEN.test(token)
      ? await withPlatform(this.db, (tx) =>
          tx
            .select({ id: orders.id, tenantId: orders.tenantId })
            .from(orders)
            .where(eq(orders.trackToken, token)),
        )
      : [];
    if (!order) throw new NotFoundException("This order link doesn't match any order");
    return order;
  }

  async store(slug: string) {
    const tenant = await this.tenantOf(slug);
    return withTenant(this.db, tenant.id, async (tx) => {
      const today = (await businessToday(tx)).date;
      const [settings] = await tx.select().from(tenantSettings);
      const [account] = await tx.select({ tenantId: moolreAccounts.tenantId }).from(moolreAccounts);
      const zones = await tx
        .select({ id: deliveryZones.id, name: deliveryZones.name, fee: deliveryZones.fee })
        .from(deliveryZones)
        .where(and(isNull(deliveryZones.deletedAt), eq(deliveryZones.active, true)))
        .orderBy(asc(deliveryZones.position), asc(deliveryZones.name));
      return {
        slug: tenant.slug,
        name: tenant.name,
        area: settings?.storefrontArea ?? null,
        phone: settings?.storefrontPhone ?? null,
        hours: settings?.storefrontHours ?? null,
        theme: settings?.storefrontTheme ?? 'orange',
        coverUrl: this.urlOf(settings?.storefrontCoverKey),
        logoUrl: this.urlOf(settings?.storefrontLogoKey),
        open: settings?.storefrontTakingOrders ?? false,
        payOnline: Boolean(account),
        cashOnPickup: settings?.storefrontCashOnPickup ?? false,
        zones,
        ...(await this.menu(tx, today)),
      };
    });
  }

  /** The menu as customers see it: never cost prices. */
  private async menu(tx: Tx, today: string) {
    const cats = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(and(isNull(categories.deletedAt), eq(categories.active, true)))
      .orderBy(asc(categories.position), asc(categories.name));
    const itemRows = await tx
      .select()
      .from(items)
      .where(and(isNull(items.deletedAt), eq(items.active, true)))
      .orderBy(asc(items.position), asc(items.name));
    const variants = await tx
      .select()
      .from(itemVariants)
      .where(and(isNull(itemVariants.deletedAt), eq(itemVariants.active, true)))
      .orderBy(asc(itemVariants.position));
    const links = await tx
      .select()
      .from(itemModifierGroups)
      .where(isNull(itemModifierGroups.deletedAt))
      .orderBy(asc(itemModifierGroups.position));
    const groups = await tx.select().from(modifierGroups).where(isNull(modifierGroups.deletedAt));
    const options = await tx
      .select()
      .from(modifiers)
      .where(and(isNull(modifiers.deletedAt), eq(modifiers.active, true)))
      .orderBy(asc(modifiers.position));

    const menuItems = itemRows.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      price: item.price,
      photoUrl: this.urlOf(item.photoKey),
      soldOut: item.soldOutOn === today,
      variants: variants
        .filter((variant) => variant.itemId === item.id)
        .map(({ id, name, price }) => ({ id, name, price })),
      groups: links
        .filter((link) => link.itemId === item.id)
        .flatMap((link) => {
          const group = groups.find((row) => row.id === link.groupId);
          return group
            ? [
                {
                  id: group.id,
                  name: group.name,
                  minSelect: group.minSelect,
                  maxSelect: group.maxSelect,
                  options: options
                    .filter((option) => option.groupId === group.id)
                    .map(({ id, name, priceDelta }) => ({ id, name, priceDelta })),
                },
              ]
            : [];
        }),
    }));
    return {
      categories: cats.filter((cat) => menuItems.some((item) => item.categoryId === cat.id)),
      items: menuItems,
    };
  }

  /**
   * Places an online order. Paid online: the Moolre link is made at once and the customer sent to
   * it. Cash on pickup: it's cooked first and paid when collected.
   */
  async place(slug: string, input: PlaceOrderInput) {
    const tenant = await this.tenantOf(slug);
    const repeat = await withTenant(this.db, tenant.id, (tx) => this.already(tx, input.orderId));
    if (repeat) return repeat;
    // Every attempt counts against the store; only orders actually placed count against a phone,
    // so a customer fixing a mistake isn't shut out.
    this.perStore.take(`store:${tenant.id}`);
    const phoneKey = `phone:${input.customer.phone}`;
    this.perPhone.ensureRoom(phoneKey);

    const placed = await withTenant(this.db, tenant.id, (tx) => this.record(tx, tenant.id, input));
    this.perPhone.count(phoneKey);
    if (!placed.linkId) {
      return { token: placed.token, number: placed.number, payUrl: null, payProblem: null };
    }
    const opened = await this.links.openForCustomer(tenant.id, placed.linkId);
    return {
      token: placed.token,
      number: placed.number,
      payUrl: 'url' in opened ? opened.url : null,
      payProblem: 'failure' in opened ? opened.failure : null,
    };
  }

  /** The same order sent again (a retry after a lost answer): what was saved the first time. */
  private async already(tx: Tx, orderId: string) {
    const [order] = await tx
      .select({ number: orders.displayNumber, token: orders.trackToken })
      .from(orders)
      .where(eq(orders.id, orderId));
    if (!order) return null;
    if (!order.token) throw new ConflictException('This order is already saved');
    const [link] = await tx
      .select({ url: paymentLinks.url })
      .from(paymentLinks)
      .where(and(eq(paymentLinks.orderId, orderId), openLink()))
      .orderBy(desc(paymentLinks.createdAt))
      .limit(1);
    return {
      token: order.token,
      number: order.number,
      payUrl: link?.url ?? null,
      payProblem: null,
    };
  }

  private async record(tx: Tx, tenantId: string, input: PlaceOrderInput) {
    const [settings] = await tx.select().from(tenantSettings);
    if (!settings?.storefrontTakingOrders) {
      throw new ConflictException("The store isn't taking orders right now");
    }
    if (input.payment === 'CASH' && !(settings.storefrontCashOnPickup && input.type === 'PICKUP')) {
      throw new BadRequestException('This order has to be paid online');
    }
    if (input.payment === 'ONLINE') {
      const [account] = await tx.select({ id: moolreAccounts.tenantId }).from(moolreAccounts);
      if (!account) throw new ConflictException("This store can't take payments online yet");
    }

    let zone: { id: string; fee: Pesewas } | undefined;
    if (input.type === 'DELIVERY') {
      if (!input.delivery) throw new BadRequestException('Add where to deliver to');
      [zone] = await tx
        .select({ id: deliveryZones.id, fee: deliveryZones.fee })
        .from(deliveryZones)
        .where(
          and(
            eq(deliveryZones.id, input.delivery.zoneId),
            eq(deliveryZones.active, true),
            isNull(deliveryZones.deletedAt),
          ),
        );
      if (!zone) throw new BadRequestException("The store doesn't deliver to that area any more");
    } else if (input.delivery) {
      throw new BadRequestException('Only delivery orders take an address');
    }

    const { date } = await businessToday(tx);
    const lines = await this.checkedLines(tx, date, input.lines);

    // One at a time per business, so two orders can't take the same number.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tenantId}), 1)`);
    const [counted] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.source, 'STOREFRONT'), eq(orders.businessDate, date)));
    const number = `W${(counted?.count ?? 0) + 1}`;

    const staffId = await onlineStaffId(tx, tenantId);
    const [location] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.isDefault, true));
    const now = new Date();
    const ctx: HandlerContext = {
      tx,
      tenant: {
        id: tenantId,
        timezone: (await businessToday(tx)).timezone,
        requirePaymentBeforePrep: settings.requirePaymentBeforePrep,
      },
      device: { id: null, tenantId, locationId: location!.id, code: 'W' },
      staff: { staffId, role: 'STAFF', capabilities: new Set() },
      command: { deviceTs: now.toISOString() },
    };

    const customerId = await upsertCustomer(ctx, {
      phone: input.customer.phone,
      name: input.customer.name,
      overwrite: false,
    });
    let priced;
    try {
      priced = await priceLines(ctx, {
        orderId: input.orderId,
        source: 'STOREFRONT',
        lines,
        discount: undefined,
        deliveryFee: zone?.fee,
      });
    } catch (error) {
      if (error instanceof CommandRejected) throw new BadRequestException(error.message);
      throw error;
    }

    const status = settings.storefrontAcceptFirst ? 'NEW' : 'CONFIRMED';
    const token = randomBytes(16).toString('base64url');
    await tx.insert(orders).values({
      id: input.orderId,
      tenantId,
      locationId: location!.id,
      deviceId: null,
      displayNumber: number,
      businessDate: date,
      source: 'STOREFRONT',
      arrivalMethod: 'API',
      type: input.type,
      status,
      payOnCollection: input.payment === 'CASH',
      trackToken: token,
      customerId,
      deliveryAddress: input.delivery?.address ?? null,
      deliveryZoneId: zone?.id ?? null,
      deliveryFee: priced.priced.deliveryFee,
      deliveryFeeCollectedBy: zone ? 'VENDOR' : null,
      note: input.note ?? null,
      subtotal: priced.priced.subtotal,
      discount: priced.priced.discount,
      total: priced.priced.total,
      reviewReasons: [...priced.reviewReasons],
      createdBy: staffId,
      createdAtDevice: now,
    });
    await tx.insert(orderItems).values(priced.rows);
    await recordOrderEvent(ctx, input.orderId, null, status);
    await adjustSellableStock(ctx, date, quantitiesByItem(lines), input.orderId);

    let linkId: string | null = null;
    if (input.payment === 'ONLINE') {
      linkId = ulid();
      await tx.insert(paymentLinks).values({
        id: linkId,
        tenantId,
        orderId: input.orderId,
        status: 'QUEUED',
        amount: priced.priced.total,
        phone: input.customer.phone,
        requestedBy: staffId,
        deviceId: null,
        createdAtDevice: now,
        // Claimed for this request, so the background sender doesn't text it meanwhile.
        checkedAt: now,
      });
    }
    return { token, number, linkId };
  }

  /**
   * Each line checked against today's menu, with the menu's own prices: the item is on sale, a
   * size is picked where it has sizes, and each extras group's rule is kept.
   */
  private async checkedLines(
    tx: Tx,
    today: string,
    input: PlaceOrderInput['lines'],
  ): Promise<Line[]> {
    const itemIds = [...new Set(input.map((line) => line.itemId))];
    const itemRows = await tx
      .select()
      .from(items)
      .where(and(inArray(items.id, itemIds), isNull(items.deletedAt), eq(items.active, true)));
    const variants = await tx
      .select()
      .from(itemVariants)
      .where(
        and(
          inArray(itemVariants.itemId, itemIds),
          isNull(itemVariants.deletedAt),
          eq(itemVariants.active, true),
        ),
      );
    const links = await tx
      .select()
      .from(itemModifierGroups)
      .where(
        and(inArray(itemModifierGroups.itemId, itemIds), isNull(itemModifierGroups.deletedAt)),
      );
    const groupIds = [...new Set(links.map((link) => link.groupId))];
    const groups = groupIds.length
      ? await tx
          .select()
          .from(modifierGroups)
          .where(and(inArray(modifierGroups.id, groupIds), isNull(modifierGroups.deletedAt)))
      : [];
    const options = groupIds.length
      ? await tx
          .select()
          .from(modifiers)
          .where(
            and(
              inArray(modifiers.groupId, groupIds),
              isNull(modifiers.deletedAt),
              eq(modifiers.active, true),
            ),
          )
      : [];

    return input.map((line) => {
      const item = itemRows.find((row) => row.id === line.itemId);
      if (!item) throw new BadRequestException('Something on your order is no longer on the menu');
      if (item.soldOutOn === today) {
        throw new ConflictException(`${item.name} has just sold out. Take it off and try again.`);
      }
      const sizes = variants.filter((variant) => variant.itemId === item.id);
      const variant = sizes.find((size) => size.id === line.variantId);
      if (sizes.length && !variant) throw new BadRequestException(`Choose a size for ${item.name}`);
      if (!sizes.length && line.variantId) {
        throw new BadRequestException(`${item.name} doesn't come in sizes`);
      }

      const itemGroups = links
        .filter((link) => link.itemId === item.id)
        .flatMap((link) => groups.filter((group) => group.id === link.groupId));
      const picked = [...new Set(line.optionIds)].map((optionId) => {
        const option = options.find(
          (row) => row.id === optionId && itemGroups.some((group) => group.id === row.groupId),
        );
        if (!option) throw new BadRequestException(`An extra on ${item.name} isn't available`);
        return option;
      });
      for (const group of itemGroups) {
        const count = picked.filter((option) => option.groupId === group.id).length;
        const what = group.name.toLowerCase();
        if (count < group.minSelect) {
          throw new BadRequestException(`Choose the ${what} for ${item.name}`);
        }
        if (group.maxSelect !== null && count > group.maxSelect) {
          throw new BadRequestException(
            `Choose at most ${group.maxSelect} ${what} for ${item.name}`,
          );
        }
      }

      return {
        lineId: ulid(),
        itemId: item.id,
        ...(variant ? { variantId: variant.id } : {}),
        quantity: line.quantity,
        unitPrice: variant?.price ?? item.price,
        modifiers: picked.map((option) => ({
          modifierId: option.id,
          unitPriceDelta: option.priceDelta,
          quantity: 1,
        })),
        ...(line.note ? { note: line.note } : {}),
      };
    });
  }

  /** Where the order stands, for the customer's status page. */
  async tracked(token: string) {
    const found = await this.orderOf(token);
    return withTenant(this.db, found.tenantId, async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, found.id));
      const [tenant] = await tx.select({ name: tenants.name, slug: tenants.slug }).from(tenants);
      const [settings] = await tx.select().from(tenantSettings);
      const lines = await tx
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.orderId, found.id), isNull(orderItems.deletedAt)))
        .orderBy(asc(orderItems.position));
      const [link] = await tx
        .select()
        .from(paymentLinks)
        .where(eq(paymentLinks.orderId, found.id))
        .orderBy(desc(paymentLinks.createdAt))
        .limit(1);
      const payable =
        link?.status === 'SENT' && link.expiresAt !== null && link.expiresAt > new Date();
      return {
        number: order!.displayNumber,
        storeSlug: tenant!.slug,
        storeName: tenant!.name,
        storePhone: settings?.storefrontPhone ?? null,
        theme: settings?.storefrontTheme ?? 'orange',
        type: order!.type,
        status: order!.status,
        acceptsFirst: settings?.storefrontAcceptFirst ?? false,
        payOnCollection: order!.payOnCollection,
        total: order!.total,
        deliveryFee: order!.deliveryFee,
        amountDue: amountDue(order!),
        amountPaid: order!.amountPaid,
        deliveryAddress: order!.deliveryAddress,
        lines: lines.map((line) => ({
          name: line.name,
          variantName: line.variantName,
          extras: line.modifiers.map((modifier) => modifier.name),
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        })),
        linkStatus: link?.status ?? null,
        payUrl: payable ? link.url : null,
        placedAt: order!.createdAtDevice.toISOString(),
      };
    });
  }

  /** "Pay now" on the status page: the open payment page, or a new one. */
  async pay(token: string) {
    const found = await this.orderOf(token);
    this.perOrder.take(`pay:${found.id}`);
    const ready = await withTenant(this.db, found.tenantId, async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, found.id));
      if (order!.status === 'CANCELLED' || order!.status === 'REFUNDED') {
        throw new ConflictException('This order was cancelled');
      }
      if (order!.payOnCollection) {
        throw new BadRequestException('This order is paid when you collect it');
      }
      const owed = sub(amountDue(order!), order!.amountPaid);
      if (owed <= 0) return { url: null, linkId: null };
      const [open] = await tx
        .select({ id: paymentLinks.id, status: paymentLinks.status, url: paymentLinks.url })
        .from(paymentLinks)
        .where(and(eq(paymentLinks.orderId, found.id), openLink()));
      if (open?.status === 'SENT') return { url: open.url, linkId: null };
      if (open) return { url: null, linkId: open.id };

      const [account] = await tx.select({ id: moolreAccounts.tenantId }).from(moolreAccounts);
      if (!account) throw new ConflictException("This store can't take payments online yet");
      const [customer] = await tx
        .select({ phone: paymentLinks.phone })
        .from(paymentLinks)
        .where(eq(paymentLinks.orderId, found.id))
        .limit(1);
      const linkId = ulid();
      const now = new Date();
      await tx.insert(paymentLinks).values({
        id: linkId,
        tenantId: found.tenantId,
        orderId: found.id,
        status: 'QUEUED',
        amount: owed,
        phone: customer?.phone ?? '',
        requestedBy: await onlineStaffId(tx, found.tenantId),
        deviceId: null,
        createdAtDevice: now,
        checkedAt: now,
      });
      return { url: null, linkId };
    });
    if (ready.url || !ready.linkId) return { payUrl: ready.url, payProblem: null };
    const opened = await this.links.openForCustomer(found.tenantId, ready.linkId);
    return {
      payUrl: 'url' in opened ? opened.url : null,
      payProblem: 'failure' in opened ? opened.failure : null,
    };
  }

  /** Back from the payment page: asks Moolre now rather than waiting for its callback. */
  async check(token: string) {
    const found = await this.orderOf(token);
    this.perOrder.take(`check:${found.id}`);
    const [link] = await withTenant(this.db, found.tenantId, (tx) =>
      tx
        .select({ id: paymentLinks.id })
        .from(paymentLinks)
        .where(and(eq(paymentLinks.orderId, found.id), eq(paymentLinks.status, 'SENT'))),
    );
    if (link) await this.links.verify(found.tenantId, link.id);
    return this.tracked(token);
  }
}

@Controller('public')
export class PublicStoreController {
  constructor(private readonly store: PublicStoreService) {}

  @Get('stores/:slug')
  @ApiOkResponse({ type: StoreDto.Output })
  getStore(@Param('slug') slug: string) {
    return this.store.store(slug);
  }

  @Post('stores/:slug/orders')
  @ApiCreatedResponse({ type: PlacedDto.Output })
  place(@Param('slug') slug: string, @Body() body: PlaceOrderDto) {
    return this.store.place(slug, body);
  }

  @Get('orders/:token')
  @ApiOkResponse({ type: TrackedDto.Output })
  track(@Param('token') token: string) {
    return this.store.tracked(token);
  }

  @Post('orders/:token/pay')
  @HttpCode(200)
  @ApiOkResponse({ type: PayDto.Output })
  pay(@Param('token') token: string) {
    return this.store.pay(token);
  }

  @Post('orders/:token/check')
  @HttpCode(200)
  @ApiOkResponse({ type: TrackedDto.Output })
  check(@Param('token') token: string) {
    return this.store.check(token);
  }
}
