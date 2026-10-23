import { Controller, Get, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, staffMembers, tenantSettings, tenants, withTenant } from '@brixx/db';
import { CAPABILITIES, ROLES, VENDOR_TYPES } from '@brixx/shared';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from './guards';
import type { Actor } from './request-context';

class ContextDto extends createZodDto(
  z.object({
    tenantId: z.string(),
    businessName: z.string(),
    vendorType: z.enum(VENDOR_TYPES),
    /** Customers can eat here, so the dashboard shows dine-in beside pickup and delivery. */
    offersDineIn: z.boolean(),
    staffId: z.string(),
    displayName: z.string(),
    role: z.enum(ROLES),
    capabilities: z.array(z.enum(CAPABILITIES)),
  }),
) {}

@Injectable()
export class MeService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /** Who is signed in, in which business, and what they may do there (the dashboard hides what they can't). */
  async context(actor: Actor) {
    const [row] = await withTenant(this.database.db, actor.tenantId, (tx) =>
      tx
        .select({
          businessName: tenants.name,
          vendorType: tenants.vendorType,
          offersDineIn: tenantSettings.offersDineIn,
          displayName: staffMembers.displayName,
        })
        .from(staffMembers)
        .innerJoin(tenants, eq(tenants.id, staffMembers.tenantId))
        .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id))
        .where(eq(staffMembers.id, actor.staffId)),
    );
    if (!row) throw new NotFoundException();
    return {
      tenantId: actor.tenantId,
      staffId: actor.staffId,
      role: actor.role,
      capabilities: CAPABILITIES.filter((capability) => actor.capabilities.has(capability)),
      ...row,
      offersDineIn: row.offersDineIn ?? false,
    };
  }
}

@Controller('me')
@ApiBearerAuth()
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('context')
  @Authorized()
  @ApiOkResponse({ type: ContextDto.Output })
  context(@CurrentActor() actor: Actor) {
    return this.me.context(actor);
  }
}
