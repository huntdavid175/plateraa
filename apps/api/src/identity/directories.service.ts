import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  devices,
  eq,
  isNull,
  staffMembers,
  tenantSettings,
  tenants,
  withPlatform,
  withTenant,
  type Tx,
} from '@plateraa/db';
import { resolveCapabilities, type Capability, type Role } from '@plateraa/shared';
import { z } from 'zod';
import { hashToken } from '../auth/secrets';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import type { DeviceContext } from './request-context';

export interface ResolvedStaff {
  staffId: string;
  role: Role;
  capabilities: ReadonlySet<Capability>;
}

const isUlid = (value: string) => z.ulid().safeParse(value).success;

/** Looks up devices and staff for the guards. Suspended businesses resolve to nothing. */
@Injectable()
export class Directories {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  async deviceByToken(token: string): Promise<DeviceContext | null> {
    return withPlatform(this.database.db, async (tx) => {
      const [device] = await tx
        .select({
          id: devices.id,
          tenantId: devices.tenantId,
          locationId: devices.locationId,
          code: devices.code,
        })
        .from(devices)
        .innerJoin(tenants, eq(tenants.id, devices.tenantId))
        .where(
          and(
            eq(devices.tokenHash, hashToken(token)),
            isNull(devices.revokedAt),
            eq(tenants.status, 'ACTIVE'),
          ),
        );
      return device ?? null;
    });
  }

  /** A staff member by id (PIN sessions). */
  async staffById(tenantId: string, staffId: string): Promise<ResolvedStaff | null> {
    if (!isUlid(tenantId) || !isUlid(staffId)) return null;
    return withTenant(this.database.db, tenantId, (tx) =>
      this.resolve(tx, and(eq(staffMembers.id, staffId), isNull(staffMembers.deletedAt))),
    );
  }

  /** The staff record an email login has in a business (dashboard). */
  async staffByLogin(tenantId: string, userId: string): Promise<ResolvedStaff | null> {
    if (!isUlid(tenantId)) return null;
    return withTenant(this.database.db, tenantId, (tx) =>
      this.resolve(tx, and(eq(staffMembers.userId, userId), isNull(staffMembers.deletedAt))),
    );
  }

  private async resolve(tx: Tx, where: ReturnType<typeof and>): Promise<ResolvedStaff | null> {
    const [tenant] = await tx.select({ status: tenants.status }).from(tenants);
    if (tenant?.status !== 'ACTIVE') return null;

    const [staff] = await tx
      .select({
        id: staffMembers.id,
        role: staffMembers.role,
        active: staffMembers.active,
        override: staffMembers.revenueVisibilityOverride,
      })
      .from(staffMembers)
      .where(where);
    if (!staff?.active) return null;

    const [settings] = await tx
      .select({ byRole: tenantSettings.revenueVisibilityByRole })
      .from(tenantSettings);
    return {
      staffId: staff.id,
      role: staff.role,
      capabilities: resolveCapabilities(staff.role, {
        byRole: settings?.byRole ?? {},
        override: staff.override,
      }),
    };
  }
}
