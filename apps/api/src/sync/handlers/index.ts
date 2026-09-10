import type { CommandHandler, CommandHandlers } from '../sync.types';
import { customerUpsert, receiptCreateLink } from './customers';
import { paymentRecordCash, paymentRecordPlatform, refundCreateCash } from './money';
import {
  orderCancel,
  orderCreate,
  orderHold,
  orderResume,
  orderSetStatus,
  orderUpdateItems,
} from './orders';
import { shiftCashMovement, shiftClose, shiftOpen } from './shifts';
import { itemSetSoldOut, stockPrepCount, stockRawCount } from './stock';

/**
 * Offline approval codes need the approvers' secrets, which Phase 2.2 provisions. Until then a
 * plain error is treated as temporary, so the phone keeps the command and retries it.
 */
const approvalRecordOfflineCode: CommandHandler<'approval.record_offline_code'> = async () => {
  throw new Error('approval.record_offline_code is not handled yet (Phase 2.2)');
};

/** One handler per command type; the compiler insists every type has one. */
export const HANDLERS: CommandHandlers = {
  'order.create': orderCreate,
  'order.update_items': orderUpdateItems,
  'order.set_status': orderSetStatus,
  'order.hold': orderHold,
  'order.resume': orderResume,
  'order.cancel': orderCancel,
  'payment.record_cash': paymentRecordCash,
  'payment.record_platform': paymentRecordPlatform,
  'refund.create_cash': refundCreateCash,
  'shift.open': shiftOpen,
  'shift.cash_movement': shiftCashMovement,
  'shift.close': shiftClose,
  'item.set_sold_out': itemSetSoldOut,
  'stock.prep_count': stockPrepCount,
  'stock.raw_count': stockRawCount,
  'customer.upsert': customerUpsert,
  'receipt.create_link': receiptCreateLink,
  'approval.record_offline_code': approvalRecordOfflineCode,
};
