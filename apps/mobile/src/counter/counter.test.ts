import { pesewas } from '@plateraa/shared';
import { ulid } from 'ulid';
import { describe, expect, it } from 'vitest';
import { InvalidCommandError } from '../offline/engine';
import { DEVICE_ID, MENU, NOW, STAFF_ID, TODAY, setUp } from '../offline/testing/fixtures';
import {
  advance,
  cancelOrder,
  markPaidOnPlatform,
  openDrawer,
  openShiftOf,
  payCash,
  placeOrder,
  requestLink,
  setOnHold,
  type Counter,
} from './actions';
import { laneOf, urgency, waitingFor } from './lanes';
import { loadMenu, needsChoice } from './menu';
import { nextDisplayNumber } from './numbers';
import { loadQueue } from './queue';
import { addToTicket, changeQuantity, priceTicket, type TicketLine } from './ticket';
import { linkWords, phoneWords } from './words';

const jollof = (quantity = 1, extra: Partial<TicketLine> = {}): TicketLine => ({
  lineId: ulid(),
  itemId: MENU.jollof,
  name: 'Jollof rice',
  unitPrice: pesewas(4500),
  modifiers: [],
  quantity,
  ...extra,
});

async function counter() {
  const tablet = await setUp();
  const at: Counter = {
    engine: tablet.engine,
    staffId: STAFF_ID,
    deviceId: DEVICE_ID,
    deviceCode: 'A',
    now: () => NOW,
  };
  return { ...tablet, counter: at };
}

const settingOn = true;

describe('the ticket', () => {
  it('adds one more of the same thing rather than a second line', () => {
    let lines = addToTicket([], jollof());
    lines = addToTicket(lines, jollof());
    const chicken = {
      modifierId: MENU.chicken,
      name: 'Chicken',
      unitPriceDelta: pesewas(1500),
      quantity: 1,
    };
    lines = addToTicket(lines, jollof(1, { modifiers: [chicken] }));
    expect(lines.map((line) => line.quantity)).toEqual([2, 1]);
    expect(priceTicket(lines).total).toBe(4500 * 2 + 6000);

    lines = changeQuantity(lines, lines[1]!.lineId, -1);
    expect(lines).toHaveLength(1);
  });
});

describe('order numbers', () => {
  it("count up through the day with the tablet's letter, and start again the next day", async () => {
    const { db } = await counter();
    expect(await nextDisplayNumber(db, 'A', TODAY)).toBe('A1');
    expect(await nextDisplayNumber(db, 'A', TODAY)).toBe('A2');
    expect(await nextDisplayNumber(db, 'A', '2026-09-18')).toBe('A1');
  });
});

describe('the menu', () => {
  it('shows sizes, today’s count and what needs a choice first', async () => {
    const { db } = await counter();
    const [other] = await loadMenu(db, TODAY);
    const item = other!.items.find((i) => i.id === MENU.jollof)!;
    expect(item).toMatchObject({ left: 3, soldOut: false, variants: [{ name: 'Large' }] });
    expect(needsChoice(item)).toBe(true);
  });
});

describe('taking orders at the counter', () => {
  it('takes a walk-in with cash and sends it straight to the kitchen', async () => {
    const { db, counter: at } = await counter();
    expect(await openShiftOf(db, DEVICE_ID)).toBeNull();
    const shiftId = await openDrawer(at, pesewas(10000));
    expect(await openShiftOf(db, DEVICE_ID)).toBe(shiftId);

    const placed = await placeOrder(at, { source: 'POS', type: 'WALK_IN', lines: [jollof(2)] });
    expect(placed).toMatchObject({ displayNumber: 'A1', total: 9000, due: 9000 });
    await payCash(at, {
      orderId: placed.orderId,
      shiftId,
      amount: placed.due,
      tendered: pesewas(10000),
    });

    const [order] = await loadQueue(db, TODAY);
    expect(order).toMatchObject({ status: 'PREPARING', amount_paid: 9000, provisional: 1 });
    expect(order!.lines).toMatchObject([{ name: 'Jollof rice', quantity: 2 }]);
    expect(laneOf(order!, settingOn)).toBe('kitchen');
  });

  it("needs the caller's number for a phone order, which then waits for its payment link", async () => {
    const { db, counter: at } = await counter();
    await expect(
      placeOrder(at, { source: 'PHONE', type: 'PICKUP', lines: [jollof()] }),
    ).rejects.toBeInstanceOf(InvalidCommandError);

    await placeOrder(at, {
      source: 'PHONE',
      type: 'PICKUP',
      lines: [jollof()],
      customer: { phone: '024 123 4567', name: 'Kofi' },
    });
    const [order] = await loadQueue(db, TODAY);
    expect(order).toMatchObject({ customer_phone: '+233241234567', customer_name: 'Kofi' });
    expect(laneOf(order!, settingOn)).toBe('awaiting-payment');
    expect(laneOf(order!, false)).toBe('kitchen');
  });

  it('queues one payment link per order, and says where it stands', async () => {
    const { db, counter: at } = await counter();
    const placed = await placeOrder(at, {
      source: 'PHONE',
      type: 'PICKUP',
      lines: [jollof()],
      customer: { phone: '024 123 4567' },
    });
    await requestLink(at, placed.orderId, '+233241234567');

    const [order] = await loadQueue(db, TODAY);
    expect(order!.link).toMatchObject({ status: 'QUEUED', phone: '+233241234567' });
    expect(linkWords(order!.link!)).toEqual({
      text: 'Payment link to 024 123 4567 goes out as soon as the tablet is online.',
      tone: 'info',
    });
    // A second link while one is open would let the customer pay twice.
    await expect(requestLink(at, placed.orderId, '+233241234567')).rejects.toMatchObject({
      code: 'LINK_ALREADY_OPEN',
    });
    expect(
      linkWords({ status: 'FAILED', phone: '+233241234567', failure: 'Moolre said: no.' }),
    ).toEqual({ text: "The payment link didn't go. Moolre said: no.", tone: 'red' });
    expect(phoneWords('+233501234567')).toBe('050 123 4567');
  });

  it('takes a Bolt order without a number, paid on the platform', async () => {
    const { db, counter: at } = await counter();
    const placed = await placeOrder(at, {
      source: 'BOLT_FOOD',
      type: 'PICKUP',
      lines: [jollof()],
      externalReference: 'BF-2231',
    });
    await markPaidOnPlatform(at, { orderId: placed.orderId, amount: placed.due });
    const [order] = await loadQueue(db, TODAY);
    expect(order).toMatchObject({ status: 'PREPARING', external_reference: 'BF-2231' });
  });

  it('moves orders along with one tap each, and a delivery goes out before it is done', async () => {
    const { db, counter: at } = await counter();
    const shiftId = await openDrawer(at, pesewas(0));
    const walkIn = await placeOrder(at, { source: 'POS', type: 'WALK_IN', lines: [jollof()] });
    await payCash(at, { orderId: walkIn.orderId, shiftId, amount: walkIn.due });
    const statusOf = async (id: string) => (await loadQueue(db, TODAY)).find((o) => o.id === id)!;

    let order = await statusOf(walkIn.orderId);
    expect(await advance(at, order)).toBe('READY');
    order = await statusOf(walkIn.orderId);
    expect(laneOf(order, settingOn)).toBe('ready');
    expect(await advance(at, order)).toBe('COMPLETED');
    expect(laneOf(await statusOf(walkIn.orderId), settingOn)).toBe('done');

    const delivery = await placeOrder(at, {
      source: 'PHONE',
      type: 'DELIVERY',
      lines: [jollof()],
      customer: { phone: '0241234567' },
      delivery: { address: 'Osu, near the Shell', fee: pesewas(1500), feeCollectedBy: 'VENDOR' },
    });
    expect(delivery.due).toBe(6000);
    await payCash(at, { orderId: delivery.orderId, shiftId, amount: delivery.due });
    await advance(at, await statusOf(delivery.orderId));
    expect(await advance(at, await statusOf(delivery.orderId))).toBe('OUT_FOR_DELIVERY');
  });

  it('holds, resumes and cancels, leaving a refund owed on a paid order', async () => {
    const { db, counter: at } = await counter();
    const shiftId = await openDrawer(at, pesewas(0));
    const placed = await placeOrder(at, { source: 'POS', type: 'WALK_IN', lines: [jollof()] });
    await payCash(at, { orderId: placed.orderId, shiftId, amount: placed.due });

    await setOnHold(at, placed.orderId, true);
    expect(laneOf((await loadQueue(db, TODAY))[0]!, settingOn)).toBe('on-hold');
    await setOnHold(at, placed.orderId, false);
    await cancelOrder(at, placed.orderId, 'Customer left');
    const [order] = await loadQueue(db, TODAY);
    expect(order).toMatchObject({
      status: 'CANCELLED',
      amount_paid: 4500,
      cancel_reason: 'Customer left',
    });
    expect(laneOf(order!, settingOn)).toBe('done');
  });
});

describe('queue timers', () => {
  it('turn amber at the prep time and red at half as long again', () => {
    const since = '2026-09-17T10:00:00.000Z';
    const at = (minutes: number) => new Date(Date.parse(since) + minutes * 60_000);
    expect(urgency(since, 10, at(9))).toBe('normal');
    expect(urgency(since, 10, at(10))).toBe('amber');
    expect(urgency(since, 10, at(15))).toBe('red');
    expect(waitingFor(since, at(4))).toBe('4 min');
    expect(waitingFor(since, at(65))).toBe('1 h 05');
  });
});
