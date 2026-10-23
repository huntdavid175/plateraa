import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Module,
  Put,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  and,
  channelCommissions,
  eq,
  isNotNull,
  isNull,
  items,
  moolreAccounts,
  stockItems,
  tenantSettings,
  tenants,
  withTenant,
} from '@brixx/db';
import { VENDOR_TYPES, pesewas } from '@brixx/shared';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { ENV, type Env } from '../config/env';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';
import { nullableText } from '../openapi';
import { MOOLRE, MoolreError, type MoolreApi } from '../payments/moolre';
import { PaymentsModule } from '../payments/payments.module';
import { sealSecret } from '../payments/secrets';

const CHANNELS = ['BOLT_FOOD', 'CHOWDECK'] as const;

class BusinessDto extends createZodDto(
  z.object({ name: z.string().trim().min(2).max(80), vendorType: z.enum(VENDOR_TYPES) }),
) {}

class OrderSettingsDto extends createZodDto(
  z.object({
    requirePaymentBeforePrep: z.boolean(),
    countPortions: z.boolean(),
    /** Customers can eat here, so the tablet offers Dine-in beside Pickup and Delivery. */
    offersDineIn: z.boolean(),
    /** How long an idle tablet waits before it locks, in seconds. */
    idleLockSeconds: z.number().int().min(60).max(1800),
  }),
) {}

class MoolreAccountDto extends createZodDto(
  z.object({
    apiUser: z.string().trim().min(1).max(100),
    /** Only the public key: Brixx never needs the private one. Sealed before it's stored. */
    publicKey: z.string().trim().min(8).max(500),
    accountNumber: z
      .string()
      .trim()
      .regex(/^\d{6,20}$/, 'The account number is digits only'),
    email: z.email(),
  }),
) {}

const commission = z.object({
  /** Percent of the order in basis points: 1500 is 15%. */
  rateBps: z.number().int().min(0).max(10_000).nullable(),
  /** A fixed amount per order, in pesewas. */
  flatAmount: z.number().int().min(0).max(10_000_000).nullable(),
});

class CommissionsDto extends createZodDto(
  z.object({ BOLT_FOOD: commission, CHOWDECK: commission }),
) {}

class SettingsDto extends createZodDto(
  z.object({
    business: z.object({ name: z.string(), vendorType: z.enum(VENDOR_TYPES) }),
    orders: z.object({
      requirePaymentBeforePrep: z.boolean(),
      countPortions: z.boolean(),
      offersDineIn: z.boolean(),
      idleLockSeconds: z.number().int(),
    }),
    moolre: z.object({
      connected: z.boolean(),
      apiUser: nullableText(),
      /** The last 4 digits, never the key. */
      accountEnding: nullableText(),
      email: nullableText(),
    }),
    /** Blank on both means Bolt Food or Chowdeck sales show as gross. */
    commissions: z.object({ BOLT_FOOD: commission, CHOWDECK: commission }),
  }),
) {}

class MoolreSavedDto extends createZodDto(
  z.object({ connected: z.boolean(), accountEnding: z.string() }),
) {}

/**
 * The owner's settings (plan.md §3.1): the business, how orders work, their own Moolre account
 * and the platforms' commissions. Everything the tablet needs syncs to it.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(ENV) private readonly env: Env,
    @Inject(MOOLRE) private readonly moolre: MoolreApi,
  ) {}

  async settings(actor: Actor) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [tenant] = await tx
        .select({ name: tenants.name, vendorType: tenants.vendorType })
        .from(tenants);
      const [settings] = await tx
        .select({
          requirePaymentBeforePrep: tenantSettings.requirePaymentBeforePrep,
          countPortions: tenantSettings.countPortions,
          offersDineIn: tenantSettings.offersDineIn,
          idleLockSeconds: tenantSettings.idleLockSeconds,
        })
        .from(tenantSettings);
      const [account] = await tx
        .select({
          apiUser: moolreAccounts.apiUser,
          accountNumber: moolreAccounts.accountNumber,
          email: moolreAccounts.email,
        })
        .from(moolreAccounts);
      const rates = await tx.select().from(channelCommissions);
      const commissionOf = (source: (typeof CHANNELS)[number]) => {
        const row = rates.find((rate) => rate.source === source);
        return { rateBps: row?.rateBps ?? null, flatAmount: row?.flatAmount ?? null };
      };

      return {
        business: { name: tenant!.name, vendorType: tenant!.vendorType },
        orders: {
          requirePaymentBeforePrep: settings?.requirePaymentBeforePrep ?? true,
          countPortions: settings?.countPortions ?? false,
          offersDineIn: settings?.offersDineIn ?? false,
          idleLockSeconds: settings?.idleLockSeconds ?? 180,
        },
        moolre: {
          connected: Boolean(account),
          apiUser: account?.apiUser ?? null,
          accountEnding: account ? account.accountNumber.slice(-4) : null,
          email: account?.email ?? null,
        },
        commissions: { BOLT_FOOD: commissionOf('BOLT_FOOD'), CHOWDECK: commissionOf('CHOWDECK') },
      };
    });
  }

  async saveBusiness(
    actor: Actor,
    input: { name: string; vendorType: (typeof VENDOR_TYPES)[number] },
  ) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [before] = await tx
        .select({ name: tenants.name, vendorType: tenants.vendorType })
        .from(tenants);
      await tx.update(tenants).set(input).where(eq(tenants.id, actor.tenantId));
      await this.audit(tx, actor, 'settings.business', before, input);
    });
  }

  /**
   * Pay before prep, portion counts, dine-in and the idle lock. Switching portion counts on gives
   * every menu item its daily count record, so the tablet's Stock tab can count them.
   */
  async saveOrderSettings(actor: Actor, input: z.infer<typeof OrderSettingsDto.schema>) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [before] = await tx
        .select({
          requirePaymentBeforePrep: tenantSettings.requirePaymentBeforePrep,
          countPortions: tenantSettings.countPortions,
          offersDineIn: tenantSettings.offersDineIn,
          idleLockSeconds: tenantSettings.idleLockSeconds,
        })
        .from(tenantSettings);
      await tx.update(tenantSettings).set(input).where(eq(tenantSettings.tenantId, actor.tenantId));

      if (input.countPortions && !before?.countPortions) {
        const menu = await tx
          .select({ id: items.id, name: items.name })
          .from(items)
          .where(isNull(items.deletedAt));
        const counted = await tx
          .select({ itemId: stockItems.itemId })
          .from(stockItems)
          .where(
            and(
              eq(stockItems.kind, 'SELLABLE'),
              isNotNull(stockItems.itemId),
              isNull(stockItems.deletedAt),
            ),
          );
        const missing = menu.filter((item) => !counted.some((row) => row.itemId === item.id));
        if (missing.length) {
          await tx.insert(stockItems).values(
            missing.map((item) => ({
              id: ulid(),
              tenantId: actor.tenantId,
              kind: 'SELLABLE' as const,
              itemId: item.id,
              name: item.name,
              unit: 'portion',
              onHand: 0,
            })),
          );
        }
      }
      await this.audit(tx, actor, 'settings.orders', before ?? null, input);
    });
  }

  /**
   * The vendor's own Moolre account, where their payment-link money goes. Moolre is asked about a
   * payment that doesn't exist first: it refuses details it doesn't know (codes AIN…), so wrong
   * details are caught here rather than at the first customer's link. Nobody is charged.
   */
  async saveMoolre(
    actor: Actor,
    input: { apiUser: string; publicKey: string; accountNumber: string; email: string },
  ) {
    if (!this.env.SECRETS_KEY) {
      throw new ServiceUnavailableException(
        "Saving Moolre accounts isn't set up on the server yet (SECRETS_KEY)",
      );
    }
    try {
      await this.moolre.paymentStatus(input, `BRIXX-CHECK-${ulid()}`);
    } catch (error) {
      if (error instanceof MoolreError && error.retryable) {
        throw new BadGatewayException("Moolre couldn't be reached. Try again in a minute.");
      }
      if (error instanceof MoolreError) {
        throw new BadRequestException(
          `Moolre didn't accept these details: ${error.message} (${error.code}). Check them on app.moolre.com.`,
        );
      }
      throw error;
    }

    const row = {
      apiUser: input.apiUser,
      publicKey: sealSecret(input.publicKey, this.env.SECRETS_KEY),
      accountNumber: input.accountNumber,
      email: input.email,
    };
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      await tx
        .insert(moolreAccounts)
        .values({ tenantId: actor.tenantId, ...row })
        .onConflictDoUpdate({ target: moolreAccounts.tenantId, set: row });
      await this.audit(tx, actor, 'settings.moolre_account', null, {
        apiUser: input.apiUser,
        accountEnding: input.accountNumber.slice(-4),
        email: input.email,
      });
    });
    return { connected: true, accountEnding: input.accountNumber.slice(-4) };
  }

  /** Bolt Food and Chowdeck's cut, as a percent, a fixed amount or both. Blank on both: gross. */
  async saveCommissions(actor: Actor, input: z.infer<typeof CommissionsDto.schema>) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      for (const source of CHANNELS) {
        const { rateBps, flatAmount } = input[source];
        const [existing] = await tx
          .select({ id: channelCommissions.id })
          .from(channelCommissions)
          .where(eq(channelCommissions.source, source));
        if (rateBps === null && flatAmount === null) {
          if (existing) {
            await tx.delete(channelCommissions).where(eq(channelCommissions.id, existing.id));
          }
          continue;
        }
        const values = { rateBps, flatAmount: flatAmount === null ? null : pesewas(flatAmount) };
        if (existing) {
          await tx
            .update(channelCommissions)
            .set(values)
            .where(eq(channelCommissions.id, existing.id));
        } else {
          await tx
            .insert(channelCommissions)
            .values({ id: ulid(), tenantId: actor.tenantId, source, ...values });
        }
      }
      await this.audit(tx, actor, 'settings.commissions', null, input);
    });
  }

  private audit(
    tx: Parameters<Parameters<typeof withTenant>[2]>[0],
    actor: Actor,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return recordAudit(tx, {
      tenantId: actor.tenantId,
      actorStaffId: actor.staffId,
      action,
      entityType: 'tenant',
      entityId: actor.tenantId,
      before,
      after,
    });
  }
}

/** `settings.manage` is the owner's alone. */
@Controller('settings')
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Authorized('settings.manage')
  @ApiOkResponse({ type: SettingsDto.Output })
  get(@CurrentActor() actor: Actor) {
    return this.settings.settings(actor);
  }

  @Put('business')
  @Authorized('settings.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async business(@CurrentActor() actor: Actor, @Body() body: BusinessDto) {
    await this.settings.saveBusiness(actor, body);
  }

  @Put('orders')
  @Authorized('settings.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async orders(@CurrentActor() actor: Actor, @Body() body: OrderSettingsDto) {
    await this.settings.saveOrderSettings(actor, body);
  }

  @Put('moolre')
  @Authorized('settings.manage')
  @ApiOkResponse({ type: MoolreSavedDto.Output })
  moolre(@CurrentActor() actor: Actor, @Body() body: MoolreAccountDto) {
    return this.settings.saveMoolre(actor, body);
  }

  @Put('commissions')
  @Authorized('settings.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async commissions(@CurrentActor() actor: Actor, @Body() body: CommissionsDto) {
    await this.settings.saveCommissions(actor, body);
  }
}

@Module({
  imports: [PaymentsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
