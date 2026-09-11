import type { CommandHandlers } from '../sync.types';
import { customerUpsert } from './customers';
import { paymentRequestLink } from './links';
import { paymentRecordCash, paymentRecordPlatform } from './money';
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
  'payment.request_link': paymentRequestLink,
  'shift.open': shiftOpen,
  'shift.cash_movement': shiftCashMovement,
  'shift.close': shiftClose,
  'item.set_sold_out': itemSetSoldOut,
  'stock.prep_count': stockPrepCount,
  'stock.raw_count': stockRawCount,
  'customer.upsert': customerUpsert,
};
