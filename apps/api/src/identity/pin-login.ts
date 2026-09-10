import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { and, eq, isNull, staffMembers, withTenant } from '@plateraa/db';
import { PIN_ATTEMPTS_BEFORE_LOCK, pinLockout, type Role } from '@plateraa/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { verifySecret } from '../auth/secrets';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Directories } from './directories.service';
import { CurrentDevice, DeviceGuard } from './guards';
import { PinSessionService } from './pin-session.service';
import type { DeviceContext } from './request-context';

const pinLoginSchema = z.object({
  staffId: z.ulid(),
  pin: z.string().regex(/^\d{6}$/),
});
class PinLoginDto extends createZodDto(pinLoginSchema) {}

type Outcome =
  | { kind: 'ok'; staff: { id: string; displayName: string; role: Role } }
  | { kind: 'wrong'; attemptsBeforeLock: number }
  | { kind: 'locked'; retryAfterSeconds: number }
  | { kind: 'disabled' };

@Injectable()
export class PinLoginService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly directories: Directories,
    private readonly pinSessions: PinSessionService,
  ) {}

  async login(device: DeviceContext, input: z.infer<typeof pinLoginSchema>) {
    // The attempt counter must commit even when the PIN is wrong, so the transaction returns
    // an outcome and errors are thrown only after it has committed.
    const outcome = await withTenant(
      this.database.db,
      device.tenantId,
      async (tx): Promise<Outcome> => {
        const now = new Date();
        const [staff] = await tx
          .select({
            id: staffMembers.id,
            displayName: staffMembers.displayName,
            role: staffMembers.role,
            active: staffMembers.active,
            pinHash: staffMembers.pinHash,
            failedAttempts: staffMembers.pinFailedAttempts,
            lockedUntil: staffMembers.pinLockedUntil,
          })
          .from(staffMembers)
          .where(and(eq(staffMembers.id, input.staffId), isNull(staffMembers.deletedAt)));
        if (!staff?.active || !staff.pinHash) return { kind: 'wrong', attemptsBeforeLock: 0 };
        if (pinLockout(staff.failedAttempts).disabled) return { kind: 'disabled' };
        if (staff.lockedUntil && staff.lockedUntil > now) {
          const retryAfterSeconds = Math.ceil((staff.lockedUntil.getTime() - now.getTime()) / 1000);
          return { kind: 'locked', retryAfterSeconds };
        }

        if (await verifySecret(staff.pinHash, input.pin)) {
          if (staff.failedAttempts > 0 || staff.lockedUntil) {
            await tx
              .update(staffMembers)
              .set({ pinFailedAttempts: 0, pinLockedUntil: null })
              .where(eq(staffMembers.id, staff.id));
          }
          return {
            kind: 'ok',
            staff: { id: staff.id, displayName: staff.displayName, role: staff.role },
          };
        }

        const attempts = staff.failedAttempts + 1;
        const lockout = pinLockout(attempts);
        await tx
          .update(staffMembers)
          .set({
            pinFailedAttempts: attempts,
            pinLockedUntil: lockout.lockSeconds
              ? new Date(now.getTime() + lockout.lockSeconds * 1000)
              : null,
          })
          .where(eq(staffMembers.id, staff.id));

        if (lockout.disabled) {
          await recordAudit(tx, {
            tenantId: device.tenantId,
            deviceId: device.id,
            action: 'staff.pin_disabled',
            entityType: 'staff_member',
            entityId: staff.id,
            after: { failedAttempts: attempts },
          });
          return { kind: 'disabled' };
        }
        if (lockout.lockSeconds) return { kind: 'locked', retryAfterSeconds: lockout.lockSeconds };
        return { kind: 'wrong', attemptsBeforeLock: PIN_ATTEMPTS_BEFORE_LOCK - attempts };
      },
    );

    switch (outcome.kind) {
      case 'wrong':
        throw new UnauthorizedException({
          message: 'Wrong PIN',
          attemptsBeforeLock: outcome.attemptsBeforeLock,
        });
      case 'locked':
        throw new HttpException(
          {
            message: 'Too many wrong PINs. Wait and try again.',
            retryAfterSeconds: outcome.retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case 'disabled':
        throw new ForbiddenException('This PIN is disabled. Ask a manager to reset it.');
    }

    const resolved = await this.directories.staffById(device.tenantId, outcome.staff.id);
    if (!resolved) throw new UnauthorizedException('Wrong PIN');
    const { token, expiresAt } = await this.pinSessions.issue({
      tenantId: device.tenantId,
      staffId: outcome.staff.id,
      deviceId: device.id,
    });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      staff: outcome.staff,
      capabilities: [...resolved.capabilities],
    };
  }
}

@Controller('sessions')
@UseGuards(DeviceGuard)
export class PinLoginController {
  constructor(private readonly pinLogin: PinLoginService) {}

  @Post('pin')
  @HttpCode(200)
  login(@CurrentDevice() device: DeviceContext, @Body() body: PinLoginDto) {
    return this.pinLogin.login(device, body);
  }
}
