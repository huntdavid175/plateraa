import { and, cashMovements, eq, isNull, payments, shifts, sql } from '@plateraa/db';
import { add, pesewas, sub, type Pesewas } from '@plateraa/shared';
import { recordAudit } from '../../audit/audit';
import { CommandRejected, type CommandHandler, type HandlerContext } from '../sync.types';
import { deviceTime } from './common';

type Shift = typeof shifts.$inferSelect;

/** An open drawer shift on this tablet. */
export async function loadOpenShift(ctx: HandlerContext, shiftId: string): Promise<Shift> {
  const [shift] = await ctx.tx.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift || shift.deviceId !== ctx.device.id) {
    throw new CommandRejected('SHIFT_NOT_FOUND', 'That drawer shift is not on this tablet');
  }
  if (shift.status !== 'OPEN') {
    throw new CommandRejected('SHIFT_CLOSED', 'That drawer shift is already closed');
  }
  return shift;
}

const toMoney = (total: string | undefined) => pesewas(Number(total ?? 0));

/**
 * Float + cash taken − payouts − drops + pay-ins. Payouts are recorded by a manager on the
 * dashboard against this shift. Refunds are paid back from outside the drawer, so they never
 * count here.
 */
async function expectedCash(ctx: HandlerContext, shift: Shift): Promise<Pesewas> {
  const [cashIn] = await ctx.tx
    .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(
      and(
        eq(payments.shiftId, shift.id),
        eq(payments.method, 'CASH'),
        eq(payments.status, 'CONFIRMED'),
        isNull(payments.deletedAt),
      ),
    );
  const movements = await ctx.tx
    .select({
      type: cashMovements.type,
      total: sql<string>`coalesce(sum(${cashMovements.amount}), 0)`,
    })
    .from(cashMovements)
    .where(and(eq(cashMovements.shiftId, shift.id), isNull(cashMovements.deletedAt)))
    .groupBy(cashMovements.type);
  const moved = (type: 'PAYOUT' | 'DROP' | 'PAY_IN') =>
    toMoney(movements.find((m) => m.type === type)?.total);

  return sub(
    add(shift.floatAmount, toMoney(cashIn?.total), moved('PAY_IN')),
    add(moved('PAYOUT'), moved('DROP')),
  );
}

export const shiftOpen: CommandHandler<'shift.open'> = async (ctx) => {
  const p = ctx.command.payload;
  const [open] = await ctx.tx
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.deviceId, ctx.device.id), eq(shifts.status, 'OPEN')));
  if (open) throw new CommandRejected('SHIFT_ALREADY_OPEN', 'Close the current drawer shift first');

  await ctx.tx.insert(shifts).values({
    id: p.shiftId,
    tenantId: ctx.tenant.id,
    locationId: ctx.device.locationId,
    deviceId: ctx.device.id,
    status: 'OPEN',
    openedBy: ctx.staff.staffId,
    openedAt: deviceTime(ctx),
    floatAmount: p.float,
  });
  await recordAudit(ctx.tx, {
    tenantId: ctx.tenant.id,
    actorStaffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    action: 'shift.opened',
    entityType: 'shift',
    entityId: p.shiftId,
    after: { float: p.float },
    deviceTs: deviceTime(ctx),
  });
  return { shiftId: p.shiftId, status: 'OPEN' };
};

/** Drops (cash taken out to the safe or the owner) and pay-ins. Payouts are dashboard-only. */
export const shiftCashMovement: CommandHandler<'shift.cash_movement'> = async (ctx) => {
  const p = ctx.command.payload;
  const shift = await loadOpenShift(ctx, p.shiftId);

  const [duplicate] = await ctx.tx
    .select({ id: cashMovements.id })
    .from(cashMovements)
    .where(eq(cashMovements.id, p.movementId));
  if (duplicate) throw new CommandRejected('DUPLICATE_MOVEMENT', 'This is already on the server');

  await ctx.tx.insert(cashMovements).values({
    id: p.movementId,
    tenantId: ctx.tenant.id,
    shiftId: shift.id,
    type: p.type,
    amount: p.amount,
    note: p.note ?? null,
    staffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    createdAtDevice: deviceTime(ctx),
  });
  await recordAudit(ctx.tx, {
    tenantId: ctx.tenant.id,
    actorStaffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    action: 'shift.cash_movement',
    entityType: 'cash_movement',
    entityId: p.movementId,
    after: { shiftId: shift.id, type: p.type, amount: p.amount },
    deviceTs: deviceTime(ctx),
  });
  return { movementId: p.movementId };
};

/** Closes the drawer. The result is this shift's cash only, never sales totals. */
export const shiftClose: CommandHandler<'shift.close'> = async (ctx) => {
  const p = ctx.command.payload;
  const shift = await loadOpenShift(ctx, p.shiftId);
  const expected = await expectedCash(ctx, shift);
  const variance = sub(p.counted, expected);

  await ctx.tx
    .update(shifts)
    .set({
      status: 'CLOSED',
      closedBy: ctx.staff.staffId,
      closedAt: deviceTime(ctx),
      expectedCash: expected,
      countedCash: p.counted,
      variance,
    })
    .where(eq(shifts.id, shift.id));
  await recordAudit(ctx.tx, {
    tenantId: ctx.tenant.id,
    actorStaffId: ctx.staff.staffId,
    deviceId: ctx.device.id,
    action: 'shift.closed',
    entityType: 'shift',
    entityId: shift.id,
    after: { float: shift.floatAmount, expected, counted: p.counted, variance },
    deviceTs: deviceTime(ctx),
  });
  return { shiftId: shift.id, expected, counted: p.counted, variance };
};
