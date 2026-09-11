import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Capability } from '@plateraa/shared';
import { fromNodeHeaders } from 'better-auth/node';
import { AUTH, type Auth } from '../auth/auth.factory';
import { Directories } from './directories.service';
import { PinSessionService } from './pin-session.service';
import {
  bearerToken,
  headerValue,
  type Actor,
  type AppRequest,
  type AuthUser,
  type DeviceContext,
} from './request-context';

const requestOf = (ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AppRequest>();

/** Requires an owner/manager email login. Sets req.authUser. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = requestOf(ctx);
    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!result) throw new UnauthorizedException('Sign in first');
    req.authUser = { id: result.user.id, email: result.user.email, name: result.user.name };
    return true;
  }
}

/** Requires a registered tablet (x-device-token). Sets req.device. */
@Injectable()
export class DeviceGuard implements CanActivate {
  constructor(private readonly directories: Directories) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = requestOf(ctx);
    const token = headerValue(req, 'x-device-token');
    const device = token ? await this.directories.deviceByToken(token) : null;
    if (!device) throw new UnauthorizedException('This device is not registered');
    req.device = device;
    return true;
  }
}

/**
 * Works out who is acting. A tablet sends its device token plus a PIN session; the dashboard
 * sends an email login plus the business it's working on (x-tenant-id). Either way the actor's
 * permissions are read fresh from the database.
 */
@Injectable()
export class ActorGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly directories: Directories,
    private readonly pinSessions: PinSessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = requestOf(ctx);
    const deviceToken = headerValue(req, 'x-device-token');
    req.actor = deviceToken
      ? await this.fromDevice(req, deviceToken)
      : await this.fromDashboard(req);
    return true;
  }

  private async fromDevice(req: AppRequest, deviceToken: string): Promise<Actor> {
    const device = await this.directories.deviceByToken(deviceToken);
    const token = bearerToken(req);
    const claims = device && token ? await this.pinSessions.verify(token) : null;
    const valid = device && claims?.deviceId === device.id && claims.tenantId === device.tenantId;
    const staff = valid ? await this.directories.staffById(device.tenantId, claims.staffId) : null;
    if (!device || !staff) throw new UnauthorizedException('Unlock the tablet with your PIN');

    req.device = device;
    return { kind: 'device', tenantId: device.tenantId, deviceId: device.id, ...staff };
  }

  private async fromDashboard(req: AppRequest): Promise<Actor> {
    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!result) throw new UnauthorizedException('Sign in first');
    const tenantId = headerValue(req, 'x-tenant-id');
    if (!tenantId) throw new BadRequestException('Choose a business first');

    const staff = await this.directories.staffByLogin(tenantId, result.user.id);
    if (!staff || (staff.role !== 'OWNER' && staff.role !== 'MANAGER')) {
      throw new ForbiddenException('You are not an owner or manager of this business');
    }
    req.authUser = { id: result.user.id, email: result.user.email, name: result.user.name };
    return { kind: 'dashboard', tenantId, deviceId: null, ...staff };
  }
}

const REQUIRED_CAPABILITIES = 'plateraa:requiredCapabilities';

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<Capability[] | undefined>(REQUIRED_CAPABILITIES, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    const actor = requestOf(ctx).actor;
    if (!actor) throw new UnauthorizedException();
    if (required.some((capability) => !actor.capabilities.has(capability))) {
      throw new ForbiddenException("You don't have permission to do that");
    }
    return true;
  }
}

/** Requires an actor (tablet PIN session or dashboard login) holding every listed capability. */
export const Authorized = (...capabilities: Capability[]) =>
  applyDecorators(
    SetMetadata(REQUIRED_CAPABILITIES, capabilities),
    UseGuards(ActorGuard, CapabilityGuard),
  );

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const actor = requestOf(ctx).actor;
  if (!actor) throw new UnauthorizedException();
  return actor;
});

export const CurrentDevice = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): DeviceContext => {
    const device = requestOf(ctx).device;
    if (!device) throw new UnauthorizedException('This device is not registered');
    return device;
  },
);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = requestOf(ctx).authUser;
  if (!user) throw new UnauthorizedException('Sign in first');
  return user;
});
