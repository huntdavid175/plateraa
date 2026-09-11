import type { Tx } from '@plateraa/db';
import type { SyncCommandOf, SyncCommandType } from '@plateraa/shared';
import type { ResolvedStaff } from '../identity/directories.service';
import type { DeviceContext } from '../identity/request-context';

export interface TenantInfo {
  id: string;
  timezone: string;
  /** Pay before prep: an order can't go to the kitchen until it's fully paid (on by default). */
  requirePaymentBeforePrep: boolean;
}

/** What shared helpers need from any command's context. */
export interface HandlerContext {
  tx: Tx;
  device: DeviceContext;
  tenant: TenantInfo;
  /** Who did it: the staff member on the command, who may differ from whoever is syncing. */
  staff: ResolvedStaff;
  command: { deviceTs: string };
}

export interface CommandContext<
  T extends SyncCommandType = SyncCommandType,
> extends HandlerContext {
  command: SyncCommandOf<T>;
}

export type CommandResult = Record<string, unknown>;

export type CommandHandler<T extends SyncCommandType> = (
  ctx: CommandContext<T>,
) => Promise<CommandResult>;

export type CommandHandlers = { [T in SyncCommandType]: CommandHandler<T> };

/**
 * The server refuses the command for a business reason. The refusal is recorded, shown on the
 * tablet under "Needs attention", and never retried. Anything else that goes wrong is treated as
 * temporary: nothing is recorded and the tablet tries again.
 */
export class CommandRejected extends Error {
  override name = 'CommandRejected';

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type PushResult =
  | { id: string; status: 'APPLIED'; result: CommandResult }
  | { id: string; status: 'REJECTED' | 'RETRY'; error: { code: string; message: string } };
