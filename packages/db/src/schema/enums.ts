import {
  APPROVAL_ACTIONS,
  APPROVAL_METHODS,
  APPROVAL_STATUSES,
  ARRIVAL_METHODS,
  CASH_MOVEMENT_TYPES,
  DELIVERY_FEE_COLLECTORS,
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  ORDER_SOURCES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  ROLES,
  SHIFT_STATUSES,
  STATIONS,
  STOCK_KINDS,
  STOCK_MOVEMENT_TYPES,
  TENANT_STATUSES,
  VENDOR_TYPES,
} from '@plateraa/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

export const tenantStatus = pgEnum('tenant_status', TENANT_STATUSES);
export const vendorType = pgEnum('vendor_type', VENDOR_TYPES);
export const staffRole = pgEnum('staff_role', ROLES);
export const station = pgEnum('station', STATIONS);
export const orderSource = pgEnum('order_source', ORDER_SOURCES);
export const arrivalMethod = pgEnum('arrival_method', ARRIVAL_METHODS);
export const orderType = pgEnum('order_type', ORDER_TYPES);
export const orderStatus = pgEnum('order_status', ORDER_STATUSES);
export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);
export const paymentStatus = pgEnum('payment_status', PAYMENT_STATUSES);
export const deliveryFeeCollector = pgEnum('delivery_fee_collector', DELIVERY_FEE_COLLECTORS);
export const shiftStatus = pgEnum('shift_status', SHIFT_STATUSES);
export const cashMovementType = pgEnum('cash_movement_type', CASH_MOVEMENT_TYPES);
export const stockKind = pgEnum('stock_kind', STOCK_KINDS);
export const stockMovementType = pgEnum('stock_movement_type', STOCK_MOVEMENT_TYPES);
export const expenseCategory = pgEnum('expense_category', EXPENSE_CATEGORIES);
export const expenseMethod = pgEnum('expense_method', EXPENSE_METHODS);
export const approvalAction = pgEnum('approval_action', APPROVAL_ACTIONS);
export const approvalStatus = pgEnum('approval_status', APPROVAL_STATUSES);
export const approvalMethod = pgEnum('approval_method', APPROVAL_METHODS);
export const syncCommandStatus = pgEnum('sync_command_status', ['APPLIED', 'REJECTED']);
