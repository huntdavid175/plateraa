import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { and, eq, isNull, staffMembers, withTenant } from '@plateraa/db';
import { ROLES, pinProblem, type Role } from '@plateraa/shared';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { createPinVerifier, hashSecret } from '../auth/secrets';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Authorized, CurrentActor } from './guards';
import type { Actor } from './request-context';

const createStaffSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  role: z.enum(['MANAGER', 'STAFF', 'RIDER']),
  pin: z.string(),
});
class CreateStaffDto extends createZodDto(createStaffSchema) {}

const setPinSchema = z.object({ pin: z.string() });
class SetPinDto extends createZodDto(setPinSchema) {}

class StaffCreatedDto extends createZodDto(
  z.object({ id: z.string(), displayName: z.string(), role: z.enum(ROLES) }),
) {}

const RANK: Record<Role, number> = { OWNER: 3, MANAGER: 2, STAFF: 1, RIDER: 1 };

async function pinSecrets(pin: string) {
  const problem = pinProblem(pin);
  if (problem) throw new BadRequestException(problem);
  const [pinHash, pinVerifier] = await Promise.all([hashSecret(pin), createPinVerifier(pin)]);
  return { pinHash, pinVerifier };
}

@Injectable()
export class StaffService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /** Adds a cashier, cook, rider or (owner only) manager, with their PIN. */
  async create(actor: Actor, input: z.infer<typeof createStaffSchema>) {
    if (RANK[input.role] >= RANK[actor.role]) {
      throw new ForbiddenException('Only the owner can add managers');
    }
    const secrets = await pinSecrets(input.pin);
    const id = ulid();

    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      await tx.insert(staffMembers).values({
        id,
        tenantId: actor.tenantId,
        displayName: input.displayName,
        role: input.role,
        ...secrets,
      });
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        deviceId: actor.deviceId,
        action: 'staff.created',
        entityType: 'staff_member',
        entityId: id,
        after: { displayName: input.displayName, role: input.role },
      });
    });

    return { id, displayName: input.displayName, role: input.role };
  }

  /**
   * Sets a PIN and clears any lockout. Anyone can change their own PIN; managers can reset
   * staff and riders; the owner can reset anyone.
   */
  async setPin(actor: Actor, staffId: string, pin: string) {
    if (!z.ulid().safeParse(staffId).success) throw new NotFoundException('No such staff member');
    const secrets = await pinSecrets(pin);

    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [target] = await tx
        .select({ id: staffMembers.id, role: staffMembers.role })
        .from(staffMembers)
        .where(and(eq(staffMembers.id, staffId), isNull(staffMembers.deletedAt)));
      if (!target) throw new NotFoundException('No such staff member');

      const self = target.id === actor.staffId;
      const allowed =
        self ||
        (actor.capabilities.has('staff.manage') &&
          (actor.role === 'OWNER' || RANK[target.role] < RANK[actor.role]));
      if (!allowed) throw new ForbiddenException("You can't change this person's PIN");

      await tx
        .update(staffMembers)
        .set({ ...secrets, pinFailedAttempts: 0, pinLockedUntil: null })
        .where(eq(staffMembers.id, target.id));
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        deviceId: actor.deviceId,
        action: self ? 'staff.pin_changed' : 'staff.pin_reset',
        entityType: 'staff_member',
        entityId: target.id,
      });
    });
  }
}

/** Works from the dashboard (email login + x-tenant-id) or a phone (device token + PIN session). */
@Controller('staff')
@ApiBearerAuth()
@ApiSecurity('device')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Post()
  @Authorized('staff.manage')
  @ApiCreatedResponse({ type: StaffCreatedDto.Output })
  create(@CurrentActor() actor: Actor, @Body() body: CreateStaffDto) {
    return this.staff.create(actor, body);
  }

  @Put(':id/pin')
  @Authorized()
  @HttpCode(204)
  @ApiNoContentResponse()
  async setPin(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: SetPinDto) {
    await this.staff.setPin(actor, id, body.pin);
  }
}
