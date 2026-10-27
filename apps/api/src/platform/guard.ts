import {
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
import { and, eq, platformStaff, user, withPlatform } from '@brixx/db';
import {
  PLATFORM_ROLE_CAPABILITIES,
  type PlatformCapability,
  type PlatformRole,
} from '@brixx/shared';
import { fromNodeHeaders } from 'better-auth/node';
import { AUTH, type Auth } from '../auth/auth.factory';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import type { AppRequest } from '../identity/request-context';

/** Someone on Brixx's own team, acting on the admin console. */
export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
  capabilities: ReadonlySet<PlatformCapability>;
}

type PlatformRequest = AppRequest & { platformUser?: PlatformUser };

const requestOf = (ctx: ExecutionContext) => ctx.switchToHttp().getRequest<PlatformRequest>();

const REQUIRED = 'brixx:platformCapabilities';

/**
 * Requires an email login that is on Brixx's team (`platform_staff`, active). The role is read
 * fresh on every request, so taking someone off the team works at once.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = requestOf(ctx);
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new UnauthorizedException('Sign in first');

    const [member] = await withPlatform(this.database.db, (tx) =>
      tx
        .select({ role: platformStaff.role, name: user.name, email: user.email })
        .from(platformStaff)
        .innerJoin(user, eq(user.id, platformStaff.userId))
        .where(and(eq(platformStaff.userId, session.user.id), eq(platformStaff.active, true))),
    );
    if (!member) throw new ForbiddenException("This login isn't on the Brixx team");

    const capabilities = new Set(PLATFORM_ROLE_CAPABILITIES[member.role]);
    req.platformUser = { id: session.user.id, ...member, capabilities };

    const required =
      this.reflector.getAllAndOverride<PlatformCapability[] | undefined>(REQUIRED, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    if (required.some((capability) => !capabilities.has(capability))) {
      throw new ForbiddenException('Only an Admin can do that');
    }
    return true;
  }
}

/** Requires a Brixx team login holding every listed capability. */
export const Platform = (...capabilities: PlatformCapability[]) =>
  applyDecorators(SetMetadata(REQUIRED, capabilities), UseGuards(PlatformGuard));

export const CurrentPlatformUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): PlatformUser => {
    const platformUser = requestOf(ctx).platformUser;
    if (!platformUser) throw new UnauthorizedException();
    return platformUser;
  },
);
