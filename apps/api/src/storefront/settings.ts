import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Put,
} from '@nestjs/common';
import {
  and,
  deliveryZones,
  eq,
  isNull,
  moolreAccounts,
  sql,
  tenantSettings,
  tenants,
  withTenant,
} from '@brixx/db';
import {
  DEFAULT_STORE_HOURS,
  STOREFRONT_THEMES,
  normalizeGhanaPhone,
  storeHoursSchema,
} from '@brixx/shared';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { ENV, type Env } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { nullableText } from '../openapi';
import { PHOTO_STORE, type PhotoStore } from '../photos/photo-store';

const switches = {
  /** The store's link works at all. */
  enabled: z.boolean(),
  /** Open for orders right now; otherwise the menu shows but can't be ordered from. */
  takingOrders: z.boolean(),
  /** Online customers may pay cash when they collect. */
  cashOnPickup: z.boolean(),
  /** Online orders wait for staff to tap Accept before the kitchen starts. */
  acceptFirst: z.boolean(),
  theme: z.enum(STOREFRONT_THEMES),
};

/** Blank text means "don't show it". */
class SaveStorefrontDto extends createZodDto(
  z.object({
    ...switches,
    area: z.string().trim().max(80),
    phone: z.string().trim().max(20),
    /** The week the store keeps, in its own timezone; outside it the store closes itself. */
    hours: storeHoursSchema,
  }),
) {}

class StorefrontSettingsDto extends createZodDto(
  z.object({
    ...switches,
    area: nullableText(),
    phone: nullableText(),
    hours: storeHoursSchema,
    /** The store's link, to share on WhatsApp and Instagram. */
    url: z.string(),
    /** Paying online needs the vendor's own Moolre account. */
    moolreConnected: z.boolean(),
    /** Delivery is offered online only where there are zones to deliver to. */
    deliveryZones: z.number().int(),
    /** The store's cover picture and logo (PUT /api/storefront/photos/cover or logo). */
    coverUrl: nullableText(),
    logoUrl: nullableText(),
    /** Whether photos can be added at all: photo storage is set up on the server. */
    photosReady: z.boolean(),
  }),
) {}

/**
 * The online store's settings (plan.md §4.0), for the owner or a manager: whether it's on and
 * taking orders, cash on pickup, accept first, its colour, and what its page says.
 */
@Injectable()
export class StorefrontSettingsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(ENV) private readonly env: Env,
    @Inject(PHOTO_STORE) private readonly photos: PhotoStore,
  ) {}

  async settings(actor: Actor) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [tenant] = await tx.select({ slug: tenants.slug }).from(tenants);
      const [settings] = await tx.select().from(tenantSettings);
      const [account] = await tx.select({ tenantId: moolreAccounts.tenantId }).from(moolreAccounts);
      const [zones] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(deliveryZones)
        .where(and(isNull(deliveryZones.deletedAt), eq(deliveryZones.active, true)));
      return {
        enabled: settings?.storefrontEnabled ?? false,
        takingOrders: settings?.storefrontTakingOrders ?? true,
        cashOnPickup: settings?.storefrontCashOnPickup ?? false,
        acceptFirst: settings?.storefrontAcceptFirst ?? false,
        theme: settings?.storefrontTheme ?? 'orange',
        area: settings?.storefrontArea ?? null,
        phone: settings?.storefrontPhone ?? null,
        hours: settings?.storefrontHours ?? DEFAULT_STORE_HOURS,
        url: `${this.env.STOREFRONT_URL}/${tenant!.slug}`,
        moolreConnected: Boolean(account),
        deliveryZones: zones?.count ?? 0,
        coverUrl: settings?.storefrontCoverKey
          ? this.photos.urlOf(settings.storefrontCoverKey)
          : null,
        logoUrl: settings?.storefrontLogoKey ? this.photos.urlOf(settings.storefrontLogoKey) : null,
        photosReady: this.photos.ready,
      };
    });
  }

  async save(actor: Actor, input: z.infer<typeof SaveStorefrontDto.schema>) {
    const phone = input.phone ? normalizeGhanaPhone(input.phone) : null;
    if (input.phone && !phone) {
      throw new BadRequestException("The store's number isn't a Ghanaian phone number");
    }
    const values = {
      storefrontEnabled: input.enabled,
      storefrontTakingOrders: input.takingOrders,
      storefrontCashOnPickup: input.cashOnPickup,
      storefrontAcceptFirst: input.acceptFirst,
      storefrontTheme: input.theme,
      storefrontArea: input.area || null,
      storefrontPhone: phone,
      storefrontHours: input.hours,
    };
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [before] = await tx
        .select({
          storefrontEnabled: tenantSettings.storefrontEnabled,
          storefrontTakingOrders: tenantSettings.storefrontTakingOrders,
          storefrontCashOnPickup: tenantSettings.storefrontCashOnPickup,
          storefrontAcceptFirst: tenantSettings.storefrontAcceptFirst,
          storefrontTheme: tenantSettings.storefrontTheme,
          storefrontArea: tenantSettings.storefrontArea,
          storefrontPhone: tenantSettings.storefrontPhone,
          storefrontHours: tenantSettings.storefrontHours,
        })
        .from(tenantSettings);
      await tx
        .update(tenantSettings)
        .set(values)
        .where(eq(tenantSettings.tenantId, actor.tenantId));
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'settings.storefront',
        entityType: 'tenant',
        entityId: actor.tenantId,
        before: before ?? null,
        after: values,
      });
    });
  }
}

/** `storefront.manage`: the owner and managers. */
@Controller('storefront')
@ApiBearerAuth()
export class StorefrontSettingsController {
  constructor(private readonly storefront: StorefrontSettingsService) {}

  @Get('settings')
  @Authorized('storefront.manage')
  @ApiOkResponse({ type: StorefrontSettingsDto.Output })
  get(@CurrentActor() actor: Actor) {
    return this.storefront.settings(actor);
  }

  @Put('settings')
  @Authorized('storefront.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async save(@CurrentActor() actor: Actor, @Body() body: SaveStorefrontDto) {
    await this.storefront.save(actor, body);
  }
}
