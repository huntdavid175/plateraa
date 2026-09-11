import {
  formatCedis,
  type OrderStatus,
  type Pesewas,
  type SyncCommandOf,
  type SyncCommandType,
} from '@plateraa/shared';

const STATUS_WORDS: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  OUT_FOR_DELIVERY: 'out for delivery',
  COMPLETED: 'done',
};

const payloadOf = <T extends SyncCommandType>(_type: T, payload: unknown) =>
  payload as SyncCommandOf<T>['payload'];

const cedis = (amount: number) => formatCedis(amount as Pesewas);

/** A change made on the tablet, in words, for the "Needs attention" list. */
export function describeCommand(command: { type: SyncCommandType; payload: unknown }): string {
  const { type, payload } = command;
  switch (type) {
    case 'order.create':
      return `New order ${payloadOf(type, payload).displayNumber}`;
    case 'order.update_items':
      return "Change to an order's items";
    case 'order.set_status': {
      const { status } = payloadOf(type, payload);
      return `Order marked ${STATUS_WORDS[status] ?? status.toLowerCase()}`;
    }
    case 'order.hold':
      return 'Order put on hold';
    case 'order.resume':
      return 'Order taken off hold';
    case 'order.cancel':
      return `Order cancelled: ${payloadOf(type, payload).reason}`;
    case 'payment.record_cash':
      return `Cash payment of ${cedis(payloadOf(type, payload).amount)}`;
    case 'payment.record_platform':
      return `${cedis(payloadOf(type, payload).amount)} marked as paid via the platform`;
    case 'payment.request_link':
      return `Payment link to ${payloadOf(type, payload).phone}`;
    case 'shift.open':
      return `Drawer opened with ${cedis(payloadOf(type, payload).float)}`;
    case 'shift.cash_movement': {
      const movement = payloadOf(type, payload);
      return `${movement.type === 'DROP' ? 'Cash drop' : 'Pay-in'} of ${cedis(movement.amount)}`;
    }
    case 'shift.close':
      return `Drawer closed with ${cedis(payloadOf(type, payload).counted)} counted`;
    case 'item.set_sold_out':
      return payloadOf(type, payload).soldOut ? 'Item marked sold out' : 'Item back on sale';
    case 'stock.prep_count':
      return `Prep count of ${payloadOf(type, payload).quantity}`;
    case 'stock.raw_count':
      return `Stock count of ${payloadOf(type, payload).counted}`;
    case 'customer.upsert':
      return `Customer ${payloadOf(type, payload).phone}`;
  }
}
