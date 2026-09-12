import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  and,
  approvalRequests,
  cashMovements,
  categories,
  changedSince,
  customers,
  deliveryZones,
  eq,
  getTableColumns,
  gte,
  inArray,
  itemModifierGroups,
  itemVariants,
  items,
  modifierGroups,
  modifiers,
  nextSyncCursor,
  or,
  orderItems,
  orders,
  paymentLinks,
  payments,
  refunds,
  shifts,
  sql,
  staffMembers,
  stockItems,
  syncCommands,
  tenantSettings,
  tenants,
  withTenant,
} from '@plateraa/db';
import {
  COMMAND_CAPABILITY,
  businessDateOf,
  type SyncCommand,
  type SyncCommandType,
} from '@plateraa/shared';
import * as Sentry from '@sentry/nestjs';
import { DATABASE, type DatabaseHandle } from '../database/database.module';
import { Directories, type ResolvedStaff } from '../identity/directories.service';
import type { DeviceContext } from '../identity/request-context';
import { PaymentLinks } from '../payments/payment-links.service';
import { HANDLERS } from './handlers';
import {
  CommandRejected,
  type CommandContext,
  type CommandHandler,
  type CommandResult,
  type PushResult,
  type TenantInfo,
} from './sync.types';

const ACTIVE_STATUSES = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] as const;
const HOUR_MS = 3_600_000;

/** Drizzle wraps driver errors; the Postgres error (with its code) is the cause. */
function postgresError(error: unknown): { code?: string; constraint?: string } {
  const candidate = error instanceof Error && error.cause ? error.cause : error;
  return typeof candidate === 'object' && candidate !== null ? candidate : {};
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly directories: Directories,
    private readonly paymentLinks: PaymentLinks,
  ) {}

  /**
   * Applies commands in the order they happened on the tablet, each in its own transaction and
   * at most once. Stops at the first temporary failure so the tablet retries from there.
   */
  async push(device: DeviceContext, commands: SyncCommand[]): Promise<PushResult[]> {
    const tenant = await this.tenantInfo(device.tenantId);
    const staffCache = new Map<string, ResolvedStaff | null>();
    const results: PushResult[] = [];
    let linkAsked = false;

    for (const command of [...commands].sort((a, b) => a.deviceSeq - b.deviceSeq)) {
      if (!staffCache.has(command.staffId)) {
        staffCache.set(
          command.staffId,
          await this.directories.staffById(device.tenantId, command.staffId),
        );
      }
      const result = await this.applyOne(
        device,
        tenant,
        staffCache.get(command.staffId) ?? null,
        command,
      );
      results.push(result);
      if (result.status === 'APPLIED' && command.type === 'payment.request_link') linkAsked = true;
      if (result.status === 'RETRY') break;
    }
    // Links are made and texted outside the sync, so a slow Moolre never holds up a tablet.
    if (linkAsked) this.paymentLinks.sendSoon();
    return results;
  }

  private async applyOne(
    device: DeviceContext,
    tenant: TenantInfo,
    staff: ResolvedStaff | null,
    command: SyncCommand,
  ): Promise<PushResult> {
    try {
      return await withTenant(this.database.db, device.tenantId, async (tx) => {
        const stored = await this.storedResult(tx, command.id);
        if (stored) return stored;

        if (!staff) throw new CommandRejected('UNKNOWN_STAFF', 'This staff member is not active');
        if (!staff.capabilities.has(COMMAND_CAPABILITY[command.type])) {
          throw new CommandRejected('NOT_ALLOWED', "This staff member isn't allowed to do that");
        }

        const handler = HANDLERS[command.type] as CommandHandler<SyncCommandType>;
        const context = { tx, device, tenant, staff, command } as CommandContext;
        const result = await handler(context);
        await tx.insert(syncCommands).values({
          id: command.id,
          tenantId: device.tenantId,
          deviceId: device.id,
          staffId: staff.staffId,
          type: command.type,
          deviceSeq: command.deviceSeq,
          status: 'APPLIED',
          result,
        });
        return { id: command.id, status: 'APPLIED', result } satisfies PushResult;
      });
    } catch (error) {
      if (error instanceof CommandRejected)
        return this.recordRejection(device, command, staff, error);
      if (postgresError(error).constraint === 'sync_commands_pkey') {
        // The same command arrived twice at once; the other request applied it.
        return (
          (await withTenant(this.database.db, device.tenantId, (tx) =>
            this.storedResult(tx, command.id),
          )) ?? this.retry(command)
        );
      }
      this.logger.error(`Sync command ${command.type} ${command.id} failed`, error as Error);
      Sentry.captureException(error);
      return this.retry(command);
    }
  }

  private retry(command: SyncCommand): PushResult {
    return {
      id: command.id,
      status: 'RETRY',
      error: { code: 'TRY_AGAIN', message: 'Could not save this yet; the tablet will try again' },
    };
  }

  private async recordRejection(
    device: DeviceContext,
    command: SyncCommand,
    staff: ResolvedStaff | null,
    rejection: CommandRejected,
  ): Promise<PushResult> {
    const error = { code: rejection.code, message: rejection.message };
    try {
      await withTenant(this.database.db, device.tenantId, (tx) =>
        tx.insert(syncCommands).values({
          id: command.id,
          tenantId: device.tenantId,
          deviceId: device.id,
          staffId: staff?.staffId ?? null,
          type: command.type,
          deviceSeq: command.deviceSeq,
          status: 'REJECTED',
          result: error,
        }),
      );
    } catch (insertError) {
      if (postgresError(insertError).constraint !== 'sync_commands_pkey') throw insertError;
    }
    return { id: command.id, status: 'REJECTED', error };
  }

  private async storedResult(
    tx: Parameters<Parameters<typeof withTenant>[2]>[0],
    commandId: string,
  ): Promise<PushResult | null> {
    const [row] = await tx
      .select({ status: syncCommands.status, result: syncCommands.result })
      .from(syncCommands)
      .where(eq(syncCommands.id, commandId));
    if (!row) return null;
    return row.status === 'APPLIED'
      ? { id: commandId, status: 'APPLIED', result: (row.result ?? {}) as CommandResult }
      : {
          id: commandId,
          status: 'REJECTED',
          error: row.result as { code: string; message: string },
        };
  }

  private async tenantInfo(tenantId: string): Promise<TenantInfo> {
    return withTenant(this.database.db, tenantId, async (tx) => {
      const [row] = await tx
        .select({
          timezone: tenants.timezone,
          requirePaymentBeforePrep: tenantSettings.requirePaymentBeforePrep,
        })
        .from(tenants)
        .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id));
      return {
        id: tenantId,
        timezone: row?.timezone ?? 'Africa/Accra',
        requirePaymentBeforePrep: row?.requirePaymentBeforePrep ?? true,
      };
    });
  }

  /**
   * Everything a counter tablet needs that changed since its cursor, read from one snapshot.
   * Never includes cost prices or aggregate money figures: several people share one tablet.
   *
   * The first sync (no cursor) sends only what the counter works with: orders from yesterday
   * on plus anything still open, and this tablet's recent drawer shifts. After that, every
   * change is sent, so an old order that finishes or is refunded still reaches the tablet,
   * which then clears it out itself.
   */
  async pull(device: DeviceContext, cursor: string | undefined) {
    return withTenant(
      this.database.db,
      device.tenantId,
      async (tx) => {
        const [meta] = await tx
          .select({ cursor: nextSyncCursor, timezone: tenants.timezone })
          .from(tenants);
        const timezone = meta?.timezone ?? 'Africa/Accra';
        const yesterday = businessDateOf(new Date(Date.now() - 24 * HOUR_MS), timezone);

        const { costPrice: _itemCost, ...itemColumns } = getTableColumns(items);
        const { costPrice: _variantCost, ...variantColumns } = getTableColumns(itemVariants);
        const { costPrice: _lineCost, ...orderItemColumns } = getTableColumns(orderItems);

        const firstSync = !cursor;
        const orderScope = firstSync
          ? or(gte(orders.businessDate, yesterday), inArray(orders.status, [...ACTIVE_STATUSES]))
          : undefined;
        const scopedOrderIds = tx.select({ id: orders.id }).from(orders).where(orderScope);
        const shiftScope = and(
          eq(shifts.deviceId, device.id),
          firstSync
            ? or(
                eq(shifts.status, 'OPEN'),
                gte(shifts.openedAt, new Date(Date.now() - 36 * HOUR_MS)),
              )
            : undefined,
        );
        const scopedShiftIds = tx.select({ id: shifts.id }).from(shifts).where(shiftScope);

        return {
          cursor: meta?.cursor ?? '0',
          changes: {
            tenantSettings: await tx
              .select({
                requirePaymentBeforePrep: tenantSettings.requirePaymentBeforePrep,
                idleLockSeconds: tenantSettings.idleLockSeconds,
                countPortions: tenantSettings.countPortions,
              })
              .from(tenantSettings)
              .where(changedSince(tenantSettings, cursor)),
            staff: await tx
              .select({
                id: staffMembers.id,
                displayName: staffMembers.displayName,
                role: staffMembers.role,
                active: staffMembers.active,
                pinVerifier: staffMembers.pinVerifier,
                deletedAt: staffMembers.deletedAt,
              })
              .from(staffMembers)
              .where(changedSince(staffMembers, cursor)),
            categories: await tx.select().from(categories).where(changedSince(categories, cursor)),
            items: await tx.select(itemColumns).from(items).where(changedSince(items, cursor)),
            itemVariants: await tx
              .select(variantColumns)
              .from(itemVariants)
              .where(changedSince(itemVariants, cursor)),
            modifierGroups: await tx
              .select()
              .from(modifierGroups)
              .where(changedSince(modifierGroups, cursor)),
            modifiers: await tx.select().from(modifiers).where(changedSince(modifiers, cursor)),
            itemModifierGroups: await tx
              .select()
              .from(itemModifierGroups)
              .where(changedSince(itemModifierGroups, cursor)),
            deliveryZones: await tx
              .select()
              .from(deliveryZones)
              .where(changedSince(deliveryZones, cursor)),
            customers: await tx.select().from(customers).where(changedSince(customers, cursor)),
            stockItems: await tx.select().from(stockItems).where(changedSince(stockItems, cursor)),
            orders: await tx
              .select()
              .from(orders)
              .where(and(changedSince(orders, cursor), orderScope)),
            orderItems: await tx
              .select(orderItemColumns)
              .from(orderItems)
              .where(
                and(
                  changedSince(orderItems, cursor),
                  firstSync ? inArray(orderItems.orderId, scopedOrderIds) : undefined,
                ),
              ),
            payments: await tx
              .select()
              .from(payments)
              .where(
                and(
                  changedSince(payments, cursor),
                  firstSync ? inArray(payments.orderId, scopedOrderIds) : undefined,
                ),
              ),
            refunds: await tx
              .select()
              .from(refunds)
              .where(
                and(
                  changedSince(refunds, cursor),
                  firstSync ? inArray(refunds.orderId, scopedOrderIds) : undefined,
                ),
              ),
            paymentLinks: await tx
              .select()
              .from(paymentLinks)
              .where(
                and(
                  changedSince(paymentLinks, cursor),
                  firstSync ? inArray(paymentLinks.orderId, scopedOrderIds) : undefined,
                ),
              ),
            shifts: await tx
              .select()
              .from(shifts)
              .where(and(changedSince(shifts, cursor), shiftScope)),
            cashMovements: await tx
              .select()
              .from(cashMovements)
              .where(
                and(
                  changedSince(cashMovements, cursor),
                  inArray(cashMovements.shiftId, scopedShiftIds),
                ),
              ),
            approvalRequests: await tx
              .select()
              .from(approvalRequests)
              .where(
                and(
                  changedSince(approvalRequests, cursor),
                  eq(approvalRequests.deviceId, device.id),
                  gte(approvalRequests.createdAt, sql`now() - interval '1 day'`),
                ),
              ),
          },
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
