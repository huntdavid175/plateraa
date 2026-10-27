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
import { eq, platformStaff, sql, user, withPlatform } from '@brixx/db';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import type { PlatformRole } from '@brixx/shared';
import { AUTH, type Auth } from '../auth/auth.factory';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { VENDOR_LOGIN, vendorLogin } from './vendor-login';
import { CurrentPlatformUser, Platform, type PlatformUser } from './guard';
import { AddTeamMemberDto, PlatformMeDto, TeamMemberDto, UpdateTeamMemberDto } from './schemas';

/** Brixx's own team: who can open the admin console, and as what. */
@Injectable()
export class PlatformTeam {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  async list() {
    return withPlatform(this.database.db, async (tx) => {
      const { rows } = await tx.execute<{
        user_id: string;
        name: string;
        email: string;
        role: PlatformRole;
        active: boolean;
        added_by_name: string | null;
        created_at: Date;
        last_sign_in_at: Date | null;
      }>(sql`
        select p.user_id, u.name, u.email, p.role, p.active, a.name as added_by_name, p.created_at,
          (select max(s.created_at) from session s where s.user_id = p.user_id) as last_sign_in_at
        from platform_staff p join "user" u on u.id = p.user_id
        left join "user" a on a.id = p.added_by
        order by p.active desc, p.role, u.name`);
      return rows.map((row) => ({
        userId: row.user_id,
        name: row.name,
        email: row.email,
        role: row.role,
        active: row.active,
        addedByName: row.added_by_name,
        createdAt: new Date(row.created_at).toISOString(),
        lastSignInAt: row.last_sign_in_at ? new Date(row.last_sign_in_at).toISOString() : null,
      }));
    });
  }

  /**
   * Adds someone by email. Usually the login is made here, with the name and starting password
   * given, for the Admin to pass on. An existing login can join only if no business uses it: the
   * team and vendors never share a login, so the team never shows up as a vendor.
   */
  async add(
    by: PlatformUser,
    input: { email: string; role: PlatformRole; name?: string; password?: string },
  ) {
    let [existing] = await withPlatform(this.database.db, (tx) =>
      tx.select({ id: user.id }).from(user).where(eq(user.email, input.email)),
    );
    if (existing && (await vendorLogin(this.database.db, existing.id))) {
      throw new BadRequestException(VENDOR_LOGIN);
    }
    if (!existing) {
      if (!input.name || !input.password) {
        throw new BadRequestException(
          'There is no Brixx login with that email yet. Give their name and a starting password.',
        );
      }
      const created = await this.auth.api.signUpEmail({
        body: { email: input.email, password: input.password, name: input.name },
      });
      existing = { id: created.user.id };
    }
    await withPlatform(this.database.db, (tx) =>
      tx
        .insert(platformStaff)
        .values({ userId: existing.id, role: input.role, addedBy: by.id })
        .onConflictDoUpdate({
          target: platformStaff.userId,
          set: { role: input.role, active: true },
        }),
    );
  }

  async update(by: PlatformUser, userId: string, input: { role: PlatformRole; active: boolean }) {
    if (userId === by.id) {
      throw new ForbiddenException("You can't change your own role or take yourself off the team");
    }
    const [changed] = await withPlatform(this.database.db, (tx) =>
      tx
        .update(platformStaff)
        .set(input)
        .where(eq(platformStaff.userId, userId))
        .returning({ userId: platformStaff.userId }),
    );
    if (!changed) throw new NotFoundException("That person isn't on the team");
  }
}

@Controller('platform')
@ApiBearerAuth()
export class PlatformTeamController {
  constructor(private readonly team: PlatformTeam) {}

  /** Who's signed in to the admin console, and what they may do. */
  @Get('me')
  @Platform()
  @ApiOkResponse({ type: PlatformMeDto.Output })
  me(@CurrentPlatformUser() me: PlatformUser) {
    return {
      id: me.id,
      name: me.name,
      email: me.email,
      role: me.role,
      capabilities: [...me.capabilities],
    };
  }

  @Get('team')
  @Platform('platform.view')
  @ApiOkResponse({ type: TeamMemberDto.Output, isArray: true })
  list() {
    return this.team.list();
  }

  @Post('team')
  @Platform('team.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async add(@CurrentPlatformUser() by: PlatformUser, @Body() body: AddTeamMemberDto) {
    await this.team.add(by, body);
  }

  @Put('team/:userId')
  @Platform('team.manage')
  @HttpCode(204)
  @ApiNoContentResponse()
  async update(
    @CurrentPlatformUser() by: PlatformUser,
    @Param('userId') userId: string,
    @Body() body: UpdateTeamMemberDto,
  ) {
    await this.team.update(by, userId, body);
  }
}
