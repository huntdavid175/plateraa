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
} from '@brixx/db';
import {
  DINE_IN_VENDOR_TYPES,
  ORDER_WAYS,
  ROLES,
  TENANT_STATUSES,
  VENDOR_TYPES,
  normalizeGhanaPhone,
} from '@brixx/shared';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { ulid } from 'ulid';
import { z } from 'zod';
import { recordAudit } from '../audit/audit';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { CurrentUser, SessionGuard } from './guards';
import type { AuthUser } from './request-context';

/**
 * A request to join (24 Oct, user decision): the business is saved as PENDING, and nothing works
 * for it until Brixx approves it (`approveBusiness`, run with `pnpm admin:approve`).
 */
const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(80),
  vendorType: z.enum(VENDOR_TYPES),
  phone: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const phone = normalizeGhanaPhone(value);
      if (!phone) ctx.addIssue({ code: 'custom', message: 'Enter a Ghanaian phone number' });
      return phone ?? value;
    }),
  area: z.string().trim().min(2).max(80),
  orderWays: z.array(z.enum(ORDER_WAYS)).min(1).max(ORDER_WAYS.length),
});
class CreateBusinessDto extends createZodDto(createBusinessSchema) {}

class BusinessCreatedDto extends createZodDto(
  z.object({ tenantId: z.string(), slug: z.string(), staffId: z.string() }),
) {}

class BusinessDto extends createZodDto(
  z.object({
    tenantId: z.string(),
    name: z.string(),
    slug: z.string(),
    staffId: z.string(),
    role: z.enum(ROLES),
    /** PENDING until Brixx approves the request; the dashboard then shows only "request received". */
    status: z.enum(TENANT_STATUSES),
  }),
) {}

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
      await tx.insert(tenants).values({
        id: tenantId,
        slug,
        name: input.name,
        vendorType: input.vendorType,
        status: 'PENDING',
        contactPhone: input.phone,
        area: input.area,
        orderWays: [...new Set(input.orderWays)],
      });
      await tx.insert(locations).values({ id: ulid(), tenantId, name: 'Main', isDefault: true });
      await tx
        .insert(tenantSettings)
        .values({ tenantId, offersDineIn: DINE_IN_VENDOR_TYPES.includes(input.vendorType) });
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
        after: { name: input.name, slug, vendorType: input.vendorType, status: 'PENDING' },
      });
    });

    return { tenantId, slug, staffId };
  }

  /** The businesses this login can manage, and its requests still waiting for approval. */
  async listBusinesses(userId: string) {
    return withPlatform(this.database.db, (tx) =>
      tx
        .select({
          tenantId: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          staffId: staffMembers.id,
          role: staffMembers.role,
          status: tenants.status,
        })
        .from(staffMembers)
        .innerJoin(tenants, eq(tenants.id, staffMembers.tenantId))
        .where(
          and(
            eq(staffMembers.userId, userId),
            eq(staffMembers.active, true),
            isNull(staffMembers.deletedAt),
            inArray(staffMembers.role, ['OWNER', 'MANAGER']),
            inArray(tenants.status, ['ACTIVE', 'PENDING']),
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

/** A request waiting for approval, for the admin commands. */
export interface BusinessRequest {
  tenantId: string;
  name: string;
  slug: string;
  vendorType: string;
  contactPhone: string | null;
  area: string | null;
  orderWays: string[] | null;
  createdAt: Date;
}

/** Every business still waiting for approval, oldest first. Platform-level: admin use only. */
export async function pendingBusinesses(db: DatabaseHandle['db']): Promise<BusinessRequest[]> {
  return withPlatform(db, (tx) =>
    tx
      .select({
        tenantId: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        vendorType: tenants.vendorType,
        contactPhone: tenants.contactPhone,
        area: tenants.area,
        orderWays: tenants.orderWays,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .where(eq(tenants.status, 'PENDING'))
      .orderBy(tenants.createdAt),
  );
}

/**
 * Approves a request: the business becomes ACTIVE and its dashboard, tablet and store start
 * working. Audited. Returns false when there's no such business waiting.
 */
export async function approveBusiness(db: DatabaseHandle['db'], tenantId: string) {
  return withTenant(db, tenantId, async (tx) => {
    const [approved] = await tx
      .update(tenants)
      .set({ status: 'ACTIVE', approvedAt: new Date() })
      .where(and(eq(tenants.id, tenantId), eq(tenants.status, 'PENDING')))
      .returning({ id: tenants.id });
    if (!approved) return false;
    await recordAudit(tx, {
      tenantId,
      actorPlatform: 'admin',
      action: 'tenant.approved',
      entityType: 'tenant',
      entityId: tenantId,
      before: { status: 'PENDING' },
      after: { status: 'ACTIVE' },
    });
    return true;
  });
}

@Controller()
@UseGuards(SessionGuard)
@ApiBearerAuth()
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('onboarding/business')
  @ApiCreatedResponse({ type: BusinessCreatedDto.Output })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateBusinessDto) {
    return this.onboarding.createBusiness(user, body);
  }

  @Get('me/businesses')
  @ApiOkResponse({ type: BusinessDto.Output, isArray: true })
  list(@CurrentUser() user: AuthUser) {
    return this.onboarding.listBusinesses(user.id);
  }
}
