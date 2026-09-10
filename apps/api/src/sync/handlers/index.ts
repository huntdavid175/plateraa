import type { SyncCommandType } from '@plateraa/shared';
import type { CommandHandler, CommandHandlers } from '../sync.types';
import {
  orderCancel,
  orderCreate,
  orderHold,
  orderResume,
  orderSetStatus,
  orderUpdateItems,
} from './orders';

/**
 * Not built yet (Phase 1.6, stage 2). A plain error is treated as temporary, so the phone
 * keeps the command and retries it instead of getting a permanent refusal.
 */
function comingSoon<T extends SyncCommandType>(type: T): CommandHandler<T> {
  return async () => {
    throw new Error(`${type} is not handled yet`);
  };
}

/** One handler per command type; the compiler insists every type has one. */
export const HANDLERS: CommandHandlers = {
  'order.create': orderCreate,
  'order.update_items': orderUpdateItems,
  'order.set_status': orderSetStatus,
  'order.hold': orderHold,
  'order.resume': orderResume,
  'order.cancel': orderCancel,
  'payment.record_cash': comingSoon('payment.record_cash'),
  'payment.record_platform': comingSoon('payment.record_platform'),
  'refund.create_cash': comingSoon('refund.create_cash'),
  'shift.open': comingSoon('shift.open'),
  'shift.cash_movement': comingSoon('shift.cash_movement'),
  'shift.close': comingSoon('shift.close'),
  'item.set_sold_out': comingSoon('item.set_sold_out'),
  'stock.prep_count': comingSoon('stock.prep_count'),
  'stock.raw_count': comingSoon('stock.raw_count'),
  'customer.upsert': comingSoon('customer.upsert'),
  'receipt.create_link': comingSoon('receipt.create_link'),
  'approval.record_offline_code': comingSoon('approval.record_offline_code'),
};
