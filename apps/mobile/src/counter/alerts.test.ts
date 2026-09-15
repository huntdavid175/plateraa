import { pesewas } from '@plateraa/shared';
import { describe, expect, it } from 'vitest';
import { listen, type Heard, type WatchedLink, type WatchedOrder } from './alerts';

const HERE = 'tablet-a';
const context = { deviceId: HERE, payBeforePrep: true };

const order = (extra: Partial<WatchedOrder> = {}): WatchedOrder => ({
  id: 'o1',
  display_number: 'W1',
  source: 'STOREFRONT',
  type: 'PICKUP',
  device_id: null,
  status: 'CONFIRMED',
  on_hold: 0,
  total: pesewas(4500),
  delivery_fee: pesewas(0),
  delivery_fee_collected_by: null,
  amount_paid: pesewas(0),
  pay_on_collection: 0,
  ...extra,
});

const link = (extra: Partial<WatchedLink> = {}): WatchedLink => ({
  id: 'l1',
  order_id: 'a1',
  status: 'QUEUED',
  phone: '+233241234567',
  failure: null,
  ...extra,
});

/** Looks once to take note, then again at `now`. */
function after(
  before: { orders: WatchedOrder[]; links?: WatchedLink[] },
  now: { orders: WatchedOrder[]; links?: WatchedLink[] },
  ctx = context,
) {
  const first = listen(null, before.orders, before.links ?? [], ctx);
  return listen(first.heard, now.orders, now.links ?? [], ctx);
}

describe('new orders', () => {
  it('takes note of what is already there without announcing it', () => {
    const paid = order({ amount_paid: pesewas(4500) });
    expect(listen(null, [paid], [], context).alerts).toEqual([]);
  });

  it('rings for an online order once it is paid, and only once', () => {
    const unpaid = order();
    const paid = order({ amount_paid: pesewas(4500) });

    const arrived = after({ orders: [] }, { orders: [unpaid] });
    expect(arrived.alerts).toEqual([]);

    const settled = listen(arrived.heard, [paid], [], context);
    expect(settled.alerts).toEqual([
      expect.objectContaining({
        title: 'New online order W1',
        detail: 'Pickup · GH₵ 45.00. It’s with the kitchen.',
        chime: true,
      }),
    ]);
    expect(listen(settled.heard, [paid], [], context).alerts).toEqual([]);
  });

  it('rings at once for one paid in cash when collected, and asks for Accept where needed', () => {
    const cash = order({ pay_on_collection: 1, status: 'NEW', type: 'DELIVERY' });
    expect(after({ orders: [] }, { orders: [cash] }).alerts).toEqual([
      expect.objectContaining({
        detail: 'Delivery · GH₵ 45.00. Cash when collected. Accept it under Orders.',
        chime: true,
      }),
    ]);
  });

  it('rings for an unpaid online order when pay before prep is off', () => {
    const ctx = { ...context, payBeforePrep: false };
    expect(after({ orders: [] }, { orders: [order()] }, ctx).alerts).toHaveLength(1);
  });

  it('stays quiet for orders taken at a counter', () => {
    const counter = order({ source: 'POS', device_id: 'tablet-b', amount_paid: pesewas(4500) });
    expect(after({ orders: [] }, { orders: [counter] }).alerts).toEqual([]);
  });

  it('stays quiet for an online order cancelled before it was paid', () => {
    const cancelled = order({ status: 'CANCELLED' });
    expect(after({ orders: [order()] }, { orders: [cancelled] }).alerts).toEqual([]);
  });
});

describe('payment links from this tablet', () => {
  const mine = order({ id: 'a1', display_number: 'A12', source: 'POS', device_id: HERE });

  it('says when a link is texted, and rings when it is paid', () => {
    const sent = after(
      { orders: [mine], links: [link()] },
      { orders: [mine], links: [link({ status: 'SENT' })] },
    );
    expect(sent.alerts).toEqual([
      expect.objectContaining({
        title: 'Payment link sent',
        detail: 'A12: texted to 024 123 4567. Waiting for them to pay.',
        tone: 'good',
        chime: false,
      }),
    ]);

    const paid = listen(sent.heard, [mine], [link({ status: 'PAID' })], context);
    expect(paid.alerts).toEqual([
      expect.objectContaining({ title: 'A12 is paid', tone: 'good', chime: true }),
    ]);
  });

  it("says why a link didn't go", () => {
    const failed = after(
      { orders: [mine], links: [link()] },
      { orders: [mine], links: [link({ status: 'FAILED', failure: 'Moolre said: no.' })] },
    );
    expect(failed.alerts).toEqual([
      expect.objectContaining({ detail: 'A12: Moolre said: no.', tone: 'problem' }),
    ]);
  });

  it("leaves other tablets' links, and the store's own, alone", () => {
    const theirs = { ...mine, device_id: 'tablet-b' };
    const online = order({ id: 'a1' });
    for (const other of [theirs, online]) {
      const heard = after(
        { orders: [other], links: [link()] },
        { orders: [other], links: [link({ status: 'SENT' })] },
      );
      expect(heard.alerts).toEqual([]);
    }
  });

  it('stays quiet about a link it has never seen before', () => {
    const heard: Heard = { orders: new Set(), links: new Map() };
    expect(listen(heard, [mine], [link({ status: 'SENT' })], context).alerts).toEqual([]);
  });
});
