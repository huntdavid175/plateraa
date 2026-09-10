import { Body, Controller, Get, Inject, Injectable, Post, UseGuards } from '@nestjs/common';
import {
  and,
  eq,
  inArray,
  isNull,
  locations,
  staffMembers,
  tenantSettings,
  tenants,
  withPlatform,
  withTenant,
} from '@plateraa/db';
import { VENDOR_TYPES } from '@plateraa/shared';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { CurrentUser, SessionGuard } from './guards';
import type { AuthUser } from './request-context';

const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(80),
  vendorType: z.enum(VENDOR_TYPES),
});
class CreateBusinessDto extends createZodDto(createBusinessSchema) {}

function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'business';
}

@Injectable()
export class OnboardingService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /** Creates the business, its default location and settings, and makes the login its owner. */
  async createBusiness(user: AuthUser, input: z.infer<typeof createBusinessSchema>) {
    const tenantId = ulid();
    const staffId = ulid();
    const slug = await this.uniqueSlug(input.name);

    await withTenant(this.database.db, tenantId, async (tx) => {
      await tx
        .insert(tenants)
        .values({ id: tenantId, slug, name: input.name, vendorType: input.vendorType });
      await tx.insert(locations).values({ id: ulid(), tenantId, name: 'Main', isDefault: true });
      await tx.insert(tenantSettings).values({ tenantId });
      await tx.insert(staffMembers).values({
        id: staffId,
        tenantId,
        userId: user.id,
        displayName: user.name,
        role: 'OWNER',
      });
      await recordAudit(tx, {
        tenantId,
        actorStaffId: staffId,
        action: 'tenant.created',
        entityType: 'tenant',
        entityId: tenantId,
        after: { name: input.name, slug, vendorType: input.vendorType },
      });
    });

    return { tenantId, slug, staffId };
  }

  /** The businesses this login can manage. */
  async listBusinesses(userId: string) {
    return withPlatform(this.database.db, (tx) =>
      tx
        .select({
          tenantId: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          staffId: staffMembers.id,
          role: staffMembers.role,
        })
        .from(staffMembers)
        .innerJoin(tenants, eq(tenants.id, staffMembers.tenantId))
        .where(
          and(
            eq(staffMembers.userId, userId),
            eq(staffMembers.active, true),
            isNull(staffMembers.deletedAt),
            inArray(staffMembers.role, ['OWNER', 'MANAGER']),
            eq(tenants.status, 'ACTIVE'),
          ),
        ),
    );
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const [taken] = await withPlatform(this.database.db, (tx) =>
        tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, candidate)),
      );
      if (!taken) return candidate;
    }
    return `${base}-${ulid().slice(-8).toLowerCase()}`;
  }
}

@Controller()
@UseGuards(SessionGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('onboarding/business')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateBusinessDto) {
    return this.onboarding.createBusiness(user, body);
  }

  @Get('me/businesses')
  list(@CurrentUser() user: AuthUser) {
    return this.onboarding.listBusinesses(user.id);
  }
}
