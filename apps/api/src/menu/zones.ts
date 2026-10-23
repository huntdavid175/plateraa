import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import { and, asc, deliveryZones, eq, isNull, ne, sql, withTenant } from '@brixx/db';
import { pesewas } from '@brixx/shared';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from '../identity/guards';
import type { Actor } from '../identity/request-context';

class SaveZoneDto extends createZodDto(
  z.object({
    name: z.string().trim().min(1).max(40),
    /** The delivery fee, in pesewas. */
    fee: z.number().int().min(0).max(10_000_000),
    /** Off: kept, but the tablet doesn't offer it. */
    active: z.boolean(),
  }),
) {}

class ZoneDto extends createZodDto(
  z.object({
    id: z.string(),
    name: z.string(),
    fee: z.number().int(),
    active: z.boolean(),
  }),
) {}

class ZonesDto extends createZodDto(z.array(ZoneDto.schema)) {}

class ZoneSavedDto extends createZodDto(z.object({ id: z.string() })) {}

/**
 * Delivery zones and their fees (plan.md §3.1). They sync to the tablet, which fills in the fee
 * when a zone is picked. Removing one is a soft delete, so the removal reaches the tablet too.
 */
@Injectable()
export class ZonesService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async zones(actor: Actor) {
    return withTenant(this.database.db, actor.tenantId, (tx) =>
      tx
        .select({
          id: deliveryZones.id,
          name: deliveryZones.name,
          fee: deliveryZones.fee,
          active: deliveryZones.active,
        })
        .from(deliveryZones)
        .where(isNull(deliveryZones.deletedAt))
        .orderBy(asc(deliveryZones.position), asc(deliveryZones.name)),
    );
  }

  /** Creates the zone, or changes it. The dashboard makes the id, so a retry saves it once. */
  async saveZone(
    actor: Actor,
    zoneId: string,
    input: { name: string; fee: number; active: boolean },
  ) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [sameName] = await tx
        .select({ id: deliveryZones.id })
        .from(deliveryZones)
        .where(
          and(
            sql`lower(${deliveryZones.name}) = lower(${input.name})`,
            ne(deliveryZones.id, zoneId),
            isNull(deliveryZones.deletedAt),
          ),
        );
      if (sameName) throw new BadRequestException(`There's already a zone called ${input.name}`);

      const [before] = await tx
        .select({
          name: deliveryZones.name,
          fee: deliveryZones.fee,
          active: deliveryZones.active,
          deletedAt: deliveryZones.deletedAt,
        })
        .from(deliveryZones)
        .where(eq(deliveryZones.id, zoneId));
      if (before?.deletedAt) throw new NotFoundException('That zone was removed');

      const values = { name: input.name, fee: pesewas(input.fee), active: input.active };
      if (before) {
        await tx.update(deliveryZones).set(values).where(eq(deliveryZones.id, zoneId));
      } else {
        const [last] = await tx
          .select({ position: sql<number>`coalesce(max(${deliveryZones.position}), -1)::int` })
          .from(deliveryZones)
          .where(isNull(deliveryZones.deletedAt));
        await tx.insert(deliveryZones).values({
          id: zoneId,
          tenantId: actor.tenantId,
          position: (last?.position ?? -1) + 1,
          ...values,
        });
      }
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'delivery_zone.saved',
        entityType: 'delivery_zone',
        entityId: zoneId,
        before: before ? { name: before.name, fee: before.fee, active: before.active } : null,
        after: values,
      });
      return { id: zoneId };
    });
  }

  async removeZone(actor: Actor, zoneId: string) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [removed] = await tx
        .update(deliveryZones)
        .set({ deletedAt: new Date() })
        .where(and(eq(deliveryZones.id, zoneId), isNull(deliveryZones.deletedAt)))
        .returning({ name: deliveryZones.name, fee: deliveryZones.fee });
      if (!removed) throw new NotFoundException('There is no such zone');
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'delivery_zone.removed',
        entityType: 'delivery_zone',
        entityId: zoneId,
        before: removed,
        after: null,
      });
    });
  }
}

/** Fees are prices, so whoever sets up the menu sets up the zones. */
@Controller('delivery-zones')
@ApiBearerAuth()
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get()
  @Authorized('catalog.manage')
  @ApiOkResponse({ type: ZonesDto.Output })
  list(@CurrentActor() actor: Actor) {
    return this.zones.zones(actor);
  }

  @Put(':zoneId')
  @Authorized('catalog.manage')
  @ApiOkResponse({ type: ZoneSavedDto.Output })
  save(@CurrentActor() actor: Actor, @Param('zoneId') zoneId: string, @Body() body: SaveZoneDto) {
    if (!z.ulid().safeParse(zoneId).success) throw new BadRequestException('Bad zone id');
    return this.zones.saveZone(actor, zoneId, body);
  }

  @Delete(':zoneId')
  @Authorized('catalog.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(@CurrentActor() actor: Actor, @Param('zoneId') zoneId: string) {
    await this.zones.removeZone(actor, zoneId);
  }
}
