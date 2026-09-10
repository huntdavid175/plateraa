import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Post,
  UseGuards,
} from '@nestjs/common';
import { and, devices, eq, isNull, locations, staffMembers, withTenant } from '@plateraa/db';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { hashToken, newToken } from '../auth/secrets';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { CurrentDevice, CurrentUser, DeviceGuard, SessionGuard } from './guards';
import type { AuthUser, DeviceContext } from './request-context';

const registerDeviceSchema = z.object({
  tenantId: z.ulid(),
  name: z.string().trim().min(1).max(60),
  platform: z.string().trim().max(40).optional(),
  appVersion: z.string().trim().max(40).optional(),
});
class RegisterDeviceDto extends createZodDto(registerDeviceSchema) {}

@Injectable()
export class DevicesService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /**
   * An owner or manager, signed in with email, registers this phone to their business once.
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
        throw new ForbiddenException('Only an owner or manager can register a phone');
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

  /** Staff who can unlock this phone, with the offline PIN checks it needs. */
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
  register(@CurrentUser() user: AuthUser, @Body() body: RegisterDeviceDto) {
    return this.devicesService.register(user, body);
  }

  @Get('current/staff')
  @UseGuards(DeviceGuard)
  roster(@CurrentDevice() device: DeviceContext) {
    return this.devicesService.roster(device);
  }
}
