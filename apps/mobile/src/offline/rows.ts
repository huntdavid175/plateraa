import type {
  DeliveryFeeCollector,
  OrderSource,
  OrderStatus,
  OrderType,
  Pesewas,
  ShiftStatus,
  StockKind,
  SyncCommandType,
} from '@plateraa/shared';

/** Rows as the tablet stores them (schema.ts): booleans are 0/1, lists are JSON text. */

export interface OrderRow {
  id: string;
  device_id: string | null;
  display_number: string;
  business_date: string;
  source: OrderSource;
  type: OrderType;
  status: OrderStatus;
  on_hold: number;
  customer_id: string | null;
  delivery_fee: Pesewas;
  delivery_fee_collected_by: DeliveryFeeCollector | null;
  discount_bps: number | null;
  discount_amount_input: Pesewas | null;
  subtotal: Pesewas;
  discount: Pesewas;
  total: Pesewas;
  amount_paid: Pesewas;
  review_reasons: string;
  cancel_reason: string | null;
}

export interface ShiftRow {
  id: string;
  device_id: string;
  status: ShiftStatus;
  float_amount: Pesewas;
}

export interface StockItemRow {
  id: string;
  kind: StockKind;
  item_id: string | null;
  on_hand: number;
  on_hand_date: string | null;
}

export interface CustomerRow {
  id: string;
  phone: string;
  name: string | null;
  notes: string | null;
}

/** PENDING: not on the server yet. APPLIED: the server took it; its result isn't pulled yet.
 * SYNCED: done. REJECTED: refused ("Needs attention"). DISMISSED: someone has seen the refusal. */
export type OutboxStatus = 'PENDING' | 'APPLIED' | 'SYNCED' | 'REJECTED' | 'DISMISSED';

export interface OutboxRow {
  seq: number;
  id: string;
  type: SyncCommandType;
  payload: string;
  staff_id: string;
  device_ts: string;
  status: OutboxStatus;
  attempts: number;
  error_code: string | null;
  error_message: string | null;
}
