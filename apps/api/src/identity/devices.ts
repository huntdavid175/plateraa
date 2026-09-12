import {
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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { and, asc, devices, eq, isNull, locations, staffMembers, withTenant } from '@plateraa/db';
import { ROLES } from '@plateraa/shared';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { hashToken, newToken } from '../auth/secrets';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { nullableText } from '../openapi';
import {
  Authorized,
  CurrentActor,
  CurrentDevice,
  CurrentUser,
  DeviceGuard,
  SessionGuard,
} from './guards';
import type { Actor, AuthUser, DeviceContext } from './request-context';

class TabletDto extends createZodDto(
  z.object({
    id: z.string(),
    name: z.string(),
    /** The letter in front of its order numbers: A1, B1, … */
    code: z.string(),
    appVersion: nullableText(),
    /** When it last talked to the server. */
    lastSeenAt: nullableText(),
    registeredAt: z.string(),
    /** Signed out from the dashboard: it can't sync until it's set up again. */
    signedOut: z.boolean(),
  }),
) {}

const registerDeviceSchema = z.object({
  tenantId: z.ulid(),
  name: z.string().trim().min(1).max(60),
  platform: z.string().trim().max(40).optional(),
  appVersion: z.string().trim().max(40).optional(),
});
class RegisterDeviceDto extends createZodDto(registerDeviceSchema) {}

class RegisteredDeviceDto extends createZodDto(
  z.object({
    /** Returned exactly once; the tablet keeps it in secure storage. */
    deviceToken: z.string(),
    device: z.object({
      id: z.string(),
      tenantId: z.string(),
      locationId: z.string(),
      name: z.string(),
      code: z.string(),
    }),
  }),
) {}

class RosterEntryDto extends createZodDto(
  z.object({
    id: z.string(),
    displayName: z.string(),
    role: z.enum(ROLES),
    pinVerifier: z.string().nullable(),
  }),
) {}

@Injectable()
export class DevicesService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /**
   * An owner or manager, signed in with email, registers this tablet to their business once.
   * The device token is returned exactly once; only its hash is stored.
   */
  async register(user: AuthUser, input: z.infer<typeof registerDeviceSchema>) {
    return withTenant(this.database.db, input.tenantId, async (tx) => {
      const [staff] = await tx
        .select({ id: staffMembers.id, role: staffMembers.role })
        .from(staffMembers)
        .where(
          and(
            eq(staffMembers.userId, user.id),
            eq(staffMembers.active, true),
            isNull(staffMembers.deletedAt),
          ),
        );
      if (!staff || (staff.role !== 'OWNER' && staff.role !== 'MANAGER')) {
        throw new ForbiddenException('Only an owner or manager can register a tablet');
      }

      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.isDefault, true));
      if (!location) throw new Error(`Business ${input.tenantId} has no default location`);

      const code = String.fromCharCode(65 + (await tx.$count(devices)));
      const deviceId = ulid();
      const deviceToken = newToken();
      await tx.insert(devices).values({
        id: deviceId,
        tenantId: input.tenantId,
        locationId: location.id,
        name: input.name,
        code,
        tokenHash: hashToken(deviceToken),
        registeredBy: staff.id,
        platform: input.platform ?? null,
        appVersion: input.appVersion ?? null,
      });
      await recordAudit(tx, {
        tenantId: input.tenantId,
        actorStaffId: staff.id,
        deviceId,
        action: 'device.registered',
        entityType: 'device',
        entityId: deviceId,
        after: { name: input.name, code },
      });

      return {
        deviceToken,
        device: {
          id: deviceId,
          tenantId: input.tenantId,
          locationId: location.id,
          name: input.name,
          code,
        },
      };
    });
  }

  /** The business's tablets, for the dashboard. */
  async list(actor: Actor) {
    const rows = await withTenant(this.database.db, actor.tenantId, (tx) =>
      tx.select().from(devices).orderBy(asc(devices.code)),
    );
    return rows.map((device) => ({
      id: device.id,
      name: device.name,
      code: device.code,
      appVersion: device.appVersion,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      registeredAt: device.createdAt.toISOString(),
      signedOut: device.revokedAt !== null,
    }));
  }

  /**
   * Signs a tablet out, e.g. a lost or stolen one. Its token stops working at once, so it can't
   * sync; anything it hadn't uploaded stays on it. Setting it up again makes it a new tablet.
   */
  async signOut(actor: Actor, deviceId: string) {
    await withTenant(this.database.db, actor.tenantId, async (tx) => {
      const [device] = await tx
        .update(devices)
        .set({ revokedAt: new Date() })
        .where(and(eq(devices.id, deviceId), isNull(devices.revokedAt)))
        .returning({ id: devices.id, name: devices.name });
      if (!device) throw new NotFoundException('That tablet is already signed out, or not here');
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorStaffId: actor.staffId,
        action: 'device.signed_out',
        entityType: 'device',
        entityId: device.id,
        after: { name: device.name },
      });
    });
  }

  /** Staff who can unlock this tablet, with the offline PIN checks it needs. */
  async roster(device: DeviceContext) {
    return withTenant(this.database.db, device.tenantId, (tx) =>
      tx
        .select({
          id: staffMembers.id,
          displayName: staffMembers.displayName,
          role: staffMembers.role,
          pinVerifier: staffMembers.pinVerifier,
        })
        .from(staffMembers)
        .where(and(eq(staffMembers.active, true), isNull(staffMembers.deletedAt))),
    );
  }
}

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post('register')
  @UseGuards(SessionGuard)
  @ApiBearerAuth()
  @ApiCreatedResponse({ type: RegisteredDeviceDto.Output })
  register(@CurrentUser() user: AuthUser, @Body() body: RegisterDeviceDto) {
    return this.devicesService.register(user, body);
  }

  @Get()
  @Authorized('devices.manage')
  @ApiBearerAuth()
  @ApiOkResponse({ type: TabletDto.Output, isArray: true })
  list(@CurrentActor() actor: Actor) {
    return this.devicesService.list(actor);
  }

  @Post(':id/sign-out')
  @Authorized('devices.manage')
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiNoContentResponse()
  async signOut(@CurrentActor() actor: Actor, @Param('id') id: string) {
    await this.devicesService.signOut(actor, id);
  }

  @Get('current/staff')
  @UseGuards(DeviceGuard)
  @ApiSecurity('device')
  @ApiOkResponse({ type: RosterEntryDto.Output, isArray: true })
  roster(@CurrentDevice() device: DeviceContext) {
    return this.devicesService.roster(device);
  }
}
