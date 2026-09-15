import type { OrderSource, OrderType, PaymentLinkStatus } from '@plateraa/shared';
import { cedis } from '../ui/theme';
import { laneOf, type LaneOrder } from './lanes';
import { SOURCE_LABELS, TYPE_LABELS, phoneWords } from './words';

/** Where orders come from without anyone at a counter typing them in. */
const FROM_OUTSIDE: ReadonlySet<OrderSource> = new Set(['STOREFRONT', 'BOLT_FOOD', 'CHOWDECK']);

export interface WatchedOrder extends LaneOrder {
  id: string;
  display_number: string;
  source: OrderSource;
  type: OrderType;
  /** The tablet it was placed on; null for online orders. */
  device_id: string | null;
}

export interface WatchedLink {
  id: string;
  order_id: string;
  status: PaymentLinkStatus;
  phone: string;
  failure: string | null;
}

/** A note for the counter, and whether it rings the new-order chime. */
export interface OrderAlert {
  id: string;
  title: string;
  detail: string;
  tone: 'order' | 'good' | 'problem';
  chime: boolean;
}

/** What the tablet has already told staff about. */
export interface Heard {
  orders: ReadonlySet<string>;
  links: ReadonlyMap<string, PaymentLinkStatus>;
}

/**
 * Compares the tablet's orders and payment links with what was already heard, and says what's new:
 * - an order from outside (the online store; later Bolt Food and Chowdeck), once staff can act on
 *   it: one paid online only once it's paid, so an abandoned checkout never rings;
 * - each change to a payment link sent from this tablet (texted, paid, failed, expired).
 *
 * The first look only takes note, so opening the app doesn't announce the day so far.
 */
export function listen(
  heard: Heard | null,
  orders: readonly WatchedOrder[],
  links: readonly WatchedLink[],
  context: { deviceId: string; payBeforePrep: boolean },
): { heard: Heard; alerts: OrderAlert[] } {
  const actionable = orders.filter((order) => {
    if (!FROM_OUTSIDE.has(order.source)) return false;
    const lane = laneOf(order, context.payBeforePrep);
    return lane !== 'awaiting-payment' && lane !== 'done';
  });
  const byId = new Map(orders.map((order) => [order.id, order]));
  const linkStatuses = new Map(links.map((link) => [link.id, link.status]));
  if (!heard) {
    return {
      heard: { orders: new Set(actionable.map((order) => order.id)), links: linkStatuses },
      alerts: [],
    };
  }

  const alerts: OrderAlert[] = [];
  // Orders that have left the tablet's list won't come back, so they needn't be remembered.
  const heardOrders = new Set([...heard.orders].filter((id) => byId.has(id)));
  for (const order of actionable) {
    if (heardOrders.has(order.id)) continue;
    heardOrders.add(order.id);
    alerts.push(arrived(order));
  }

  for (const link of links) {
    const was = heard.links.get(link.id);
    const order = byId.get(link.order_id);
    if (!was || was === link.status || !order || order.device_id !== context.deviceId) continue;
    const alert = linkChanged(link, order.display_number);
    if (alert) alerts.push(alert);
  }
  return { heard: { orders: heardOrders, links: linkStatuses }, alerts };
}

function arrived(order: WatchedOrder): OrderAlert {
  const from = order.source === 'STOREFRONT' ? 'online' : SOURCE_LABELS[order.source];
  const cash = order.pay_on_collection === 1 ? ' Cash when collected.' : '';
  const next = order.status === 'NEW' ? 'Accept it under Orders.' : 'It’s with the kitchen.';
  return {
    id: `order:${order.id}`,
    title: `New ${from} order ${order.display_number}`,
    detail: `${TYPE_LABELS[order.type]} · ${cedis(order.total)}.${cash} ${next}`,
    tone: 'order',
    chime: true,
  };
}

function linkChanged(link: WatchedLink, number: string): OrderAlert | null {
  const id = `link:${link.id}:${link.status}`;
  switch (link.status) {
    case 'SENT':
      return {
        id,
        title: 'Payment link sent',
        detail: `${number}: texted to ${phoneWords(link.phone)}. Waiting for them to pay.`,
        tone: 'good',
        chime: false,
      };
    case 'PAID':
      // The payment moves the order on to the kitchen, so it rings like a new order.
      return {
        id,
        title: `${number} is paid`,
        detail: 'Paid by payment link. It’s with the kitchen.',
        tone: 'good',
        chime: true,
      };
    case 'FAILED':
      return {
        id,
        title: 'Payment link didn’t go',
        detail: `${number}: ${link.failure ?? 'Send it again from Orders.'}`,
        tone: 'problem',
        chime: false,
      };
    case 'EXPIRED':
      return {
        id,
        title: 'Payment link expired',
        detail: `${number} wasn’t paid. Send a new link from Orders.`,
        tone: 'problem',
        chime: false,
      };
    default:
      return null;
  }
}
