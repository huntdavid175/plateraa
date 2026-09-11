import type { OrderSource, OrderType, Pesewas, Station } from '@plateraa/shared';
import type { Sql } from '../offline/sql';
import { provisionalSql } from '../offline/store';
import type { LaneOrder } from './lanes';
import type { TicketLine, TicketModifier } from './ticket';

export interface QueueLine {
  id: string;
  item_id: string;
  variant_id: string | null;
  name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: Pesewas;
  line_total: Pesewas;
  /** JSON list of { modifierId, name, unitPriceDelta, quantity }. */
  modifiers: string;
  note: string | null;
  station: Station;
}

export interface QueueOrder extends LaneOrder {
  id: string;
  display_number: string;
  source: OrderSource;
  type: OrderType;
  business_date: string;
  subtotal: Pesewas;
  discount: Pesewas;
  customer_phone: string | null;
  customer_name: string | null;
  delivery_address: string | null;
  external_reference: string | null;
  note: string | null;
  cancel_reason: string | null;
  created_at_device: string;
  /** When the latest payment on it was taken. */
  paid_at: string | null;
  refunded: Pesewas;
  /** 1 while the tablet shows changes the server hasn't confirmed. */
  provisional: number;
  lines: QueueLine[];
  /** The longest prep time among its items (10 minutes when none is set). */
  prepMinutes: number;
}

const DEFAULT_PREP_MINUTES = 10;

/** Today's orders and anything older that's still open, oldest first. */
export async function loadQueue(db: Sql, businessDate: string): Promise<QueueOrder[]> {
  const orders = await db.all<Omit<QueueOrder, 'lines' | 'prepMinutes'>>(
    `SELECT o.id, o.display_number, o.source, o.type, o.status, o.on_hold, o.total, o.subtotal,
            o.discount, o.delivery_fee, o.delivery_fee_collected_by, o.amount_paid,
            o.business_date, o.delivery_address, o.external_reference, o.note, o.cancel_reason,
            o.created_at_device, c.phone AS customer_phone, c.name AS customer_name,
            (SELECT max(p.created_at_device) FROM payments p
              WHERE p.order_id = o.id AND p.status = 'CONFIRMED') AS paid_at,
            (SELECT coalesce(sum(r.amount), 0) FROM refunds r WHERE r.order_id = o.id) AS refunded,
            ${provisionalSql('orders', 'o.id')} AS provisional
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.business_date = ? OR o.status NOT IN ('COMPLETED', 'CANCELLED', 'REFUNDED')
      ORDER BY o.created_at_device`,
    [businessDate],
  );
  if (!orders.length) return [];

  const lines = await db.all<QueueLine & { order_id: string; prep_minutes: number | null }>(
    `SELECT li.order_id, li.id, li.item_id, li.variant_id, li.name, li.variant_name, li.quantity,
            li.unit_price, li.line_total, li.modifiers, li.note, li.station, i.prep_minutes
       FROM order_items li LEFT JOIN items i ON i.id = li.item_id
      ORDER BY li.order_id, li.position`,
  );
  const byOrder = new Map<string, typeof lines>();
  for (const line of lines) {
    const list = byOrder.get(line.order_id) ?? [];
    list.push(line);
    byOrder.set(line.order_id, list);
  }

  return orders.map((order) => {
    const orderLines = byOrder.get(order.id) ?? [];
    return {
      ...order,
      lines: orderLines.map(({ order_id: _orderId, prep_minutes: _prep, ...line }) => line),
      prepMinutes: Math.max(
        DEFAULT_PREP_MINUTES,
        ...orderLines.map((line) => line.prep_minutes ?? DEFAULT_PREP_MINUTES),
      ),
    };
  });
}

/** An order's lines back on the ticket, for editing before the kitchen starts. */
export function ticketLinesOf(order: Pick<QueueOrder, 'lines'>): TicketLine[] {
  return order.lines.map((line) => ({
    lineId: line.id,
    itemId: line.item_id,
    ...(line.variant_id ? { variantId: line.variant_id } : {}),
    name: line.name,
    ...(line.variant_name ? { variantName: line.variant_name } : {}),
    unitPrice: line.unit_price,
    modifiers: JSON.parse(line.modifiers || '[]') as TicketModifier[],
    quantity: line.quantity,
    ...(line.note ? { note: line.note } : {}),
  }));
}

/** Extras on a line, in words: "Chicken, Egg ×2". */
export function extrasText(line: Pick<QueueLine, 'modifiers'>): string {
  const extras = JSON.parse(line.modifiers || '[]') as { name: string; quantity: number }[];
  return extras
    .map((extra) => (extra.quantity > 1 ? `${extra.name} ×${extra.quantity}` : extra.name))
    .join(', ');
}
