import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
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
  ApiOkResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { and, eq, isNull, staffMembers, tenantSettings, withTenant } from '@brixx/db';
import { ROLES, pinLockout, pinProblem, type Role } from '@brixx/shared';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { createPinVerifier, hashSecret } from '../auth/secrets';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { nullableFlag } from '../openapi';
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

const updateStaffSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  role: z.enum(['MANAGER', 'STAFF', 'RIDER']).optional(),
  /** Switched off: can't unlock a tablet or sign in to the dashboard. */
  active: z.boolean().optional(),
  /** Owner only. Sales totals for this person whatever their role (true or false), or null for the role's setting. */
  seesRevenue: nullableFlag().optional(),
});
class UpdateStaffDto extends createZodDto(updateStaffSchema) {}

const revenueByRoleSchema = z.object({
  MANAGER: z.boolean(),
  STAFF: z.boolean(),
  RIDER: z.boolean(),
});
class RevenueVisibilityDto extends createZodDto(z.object({ byRole: revenueByRoleSchema })) {}

class TeamDto extends createZodDto(
  z.object({
    staff: z.array(
      z.object({
        id: z.string(),
        displayName: z.string(),
        role: z.enum(ROLES),
        active: z.boolean(),
        hasPin: z.boolean(),
        /** Too many wrong PINs: a manager sets a new one to unlock it. */
        pinLocked: z.boolean(),
        /** Has an email login for the dashboard (owners and managers). */
        hasLogin: z.boolean(),
        seesRevenue: z.boolean().nullable(),
        you: z.boolean(),
      }),
    ),
    /** Who sees sales totals, by role. The owner always does. */
    revenueByRole: revenueByRoleSchema,
  }),
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

  /** Everyone at the business, for the dashboard's Staff page. Never PINs or their hashes. */
  async team(actor: Actor) {
    return withTenant(this.database.db, actor.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: staffMembers.id,
          displayName: staffMembers.displayName,
          role: staffMembers.role,
          active: staffMembers.active,
          pinVerifier: staffMembers.pinVerifier,
          pinFailedAttempts: staffMembers.pinFailedAttempts,
          pinLockedUntil: staffMembers.pinLockedUntil,
          userId: staffMembers.userId,
          seesRevenue: staffMembers.revenueVisibilityOverride,
        })
        .from(staffMembers)
        // The "Online store" member isn't a person, so it isn't on the team.
        .where(and(isNull(staffMembers.deletedAt), eq(staffMembers.system, false)));
      const [settings] = await tx
        .select({ byRole: tenantSettings.revenueVisibilityByRole })
        .from(tenantSettings);
      const byRole = settings?.byRole ?? {};
      const now = new Date();

      return {
        staff: rows
          .sort((a, b) => RANK[b.role] - RANK[a.role] || a.displayName.localeCompare(b.displayName))
          .map((row) => ({
            id: row.id,
            displayName: row.displayName,
            role: row.role,
            active: row.active,
            hasPin: row.pinVerifier !== null,
            pinLocked:
              pinLockout(row.pinFailedAttempts).disabled ||
              (row.pinLockedUntil !== null && row.pinLockedUntil > now),
            hasLogin: row.userId !== null,
            seesRevenue: row.seesRevenue,
            you: row.id === actor.staffId,
          })),
        revenueByRole: {
          MANAGER: byRole.MANAGER ?? false,
          STAFF: byRole.STAFF ?? false,
          RIDER: byRole.RIDER ?? false,
        },
      };
    });
  }

  /**
   * Changes someone's name, role, whether they're switched on, or (owner only) whether they
   * see sales totals. The owner can't be changed or switched off, and nobody switches themselves
   * off. Managers only change staff and riders.
   */
  async update(actor: Actor, staffId: string, input: z.infer<typeof updateStaffSchema>) {
    if (!z.ulid().safeParse(staffId).success) throw new NotFoundException('No such staff member');
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [target] = await tx
        .select()
        .from(staffMembers)
        .where(and(eq(staffMembers.id, staffId), isNull(staffMembers.deletedAt)))
        .for('update');
      if (!target) throw new NotFoundException('No such staff member');

      if (target.role === 'OWNER' && (input.role !== undefined || input.active === false)) {
        throw new ForbiddenException("The owner's role can't be changed");
      }
      if (target.id === actor.staffId && input.active === false) {
        throw new BadRequestException("You can't switch yourself off");
      }
      if (actor.role !== 'OWNER' && RANK[target.role] >= RANK[actor.role]) {
        throw new ForbiddenException('Only the owner can change a manager');
      }
      if (input.role && RANK[input.role] >= RANK[actor.role]) {
        throw new ForbiddenException('Only the owner can make someone a manager');
      }
      if (input.seesRevenue !== undefined && actor.role !== 'OWNER') {
        throw new ForbiddenException('Only the owner decides who sees sales totals');
      }

      const changes = {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.seesRevenue !== undefined
          ? { revenueVisibilityOverride: input.seesRevenue }
          : {}),
      };
      if (Object.keys(changes).length === 0) return;
      await tx.update(staffMembers).set(changes).where(eq(staffMembers.id, target.id));
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        deviceId: actor.deviceId,
        action: 'staff.updated',
        entityType: 'staff_member',
        entityId: target.id,
        before: {
          displayName: target.displayName,
          role: target.role,
          active: target.active,
          seesRevenue: target.revenueVisibilityOverride,
        },
        after: input,
      });
    });
  }

  /** Owner only: which roles see sales totals, profit and margins. It applies at once. */
  async setRevenueVisibility(actor: Actor, byRole: z.infer<typeof revenueByRoleSchema>) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [before] = await tx
        .select({ byRole: tenantSettings.revenueVisibilityByRole })
        .from(tenantSettings);
      await tx
        .update(tenantSettings)
        .set({ revenueVisibilityByRole: byRole })
        .where(eq(tenantSettings.tenantId, actor.tenantId));
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'settings.revenue_visibility',
        entityType: 'tenant_settings',
        entityId: actor.tenantId,
        before: before?.byRole ?? null,
        after: byRole,
      });
    });
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

/** Works from the dashboard (email login + x-tenant-id) or a tablet (device token + PIN session). */
@Controller('staff')
@ApiBearerAuth()
@ApiSecurity('device')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @Authorized('staff.manage')
  @ApiOkResponse({ type: TeamDto.Output })
  team(@CurrentActor() actor: Actor) {
    return this.staff.team(actor);
  }

  @Post()
  @Authorized('staff.manage')
  @ApiCreatedResponse({ type: StaffCreatedDto.Output })
  create(@CurrentActor() actor: Actor, @Body() body: CreateStaffDto) {
    return this.staff.create(actor, body);
  }

  /** Before `:id`, so it isn't taken for a staff id. `settings.manage` is the owner's alone. */
  @Put('revenue-visibility')
  @Authorized('settings.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async setRevenueVisibility(@CurrentActor() actor: Actor, @Body() body: RevenueVisibilityDto) {
    await this.staff.setRevenueVisibility(actor, body.byRole);
  }

  @Put(':id')
  @Authorized('staff.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async update(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body: UpdateStaffDto,
  ) {
    await this.staff.update(actor, id, body);
  }

  @Put(':id/pin')
  @Authorized()
  @HttpCode(204)
  @ApiNoContentResponse()
  async setPin(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: SetPinDto) {
    await this.staff.setPin(actor, id, body.pin);
  }
}
