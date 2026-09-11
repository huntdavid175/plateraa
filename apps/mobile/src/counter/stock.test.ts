import { describe, expect, it } from 'vitest';
import { DEVICE_ID, MENU, NOW, STAFF_ID, TODAY, setUp } from '../offline/testing/fixtures';
import { addPortions, setSoldOut, type Counter } from './actions';
import { loadMenu } from './menu';

type Tablet = Awaited<ReturnType<typeof setUp>>;

const atCounter = (engine: Tablet['engine']): Counter => ({
  engine,
  staffId: STAFF_ID,
  deviceId: DEVICE_ID,
  deviceCode: 'A',
  now: () => NOW,
});

const itemOn = async (db: Tablet['db'], itemId: string, date = TODAY) =>
  (await loadMenu(db, date)).flatMap((category) => category.items).find((i) => i.id === itemId);

describe('the sold-out switch', () => {
  it('takes an item off sale for today with one tap, and puts it back', async () => {
    const { db, engine } = await setUp();
    const counter = atCounter(engine);

    await setSoldOut(counter, MENU.waakye, true);
    expect((await itemOn(db, MENU.waakye))?.soldOut).toBe(true);
    expect((await itemOn(db, MENU.jollof))?.soldOut).toBe(false);
    // Sold out lasts the trading day: tomorrow it's on sale again.
    expect((await itemOn(db, MENU.waakye, '2026-09-18'))?.soldOut).toBe(false);

    await setSoldOut(counter, MENU.waakye, false);
    expect((await itemOn(db, MENU.waakye))?.soldOut).toBe(false);
  });
});

describe('portion counts', () => {
  it("adds the portions made to today's count, and brings a sold-out item back", async () => {
    const { db, engine } = await setUp();
    const counter = atCounter(engine);
    await setSoldOut(counter, MENU.jollof, true);

    // The test menu has 3 jollof counted today.
    await addPortions(counter, MENU.jollofStock, 20);
    expect(await itemOn(db, MENU.jollof)).toMatchObject({
      left: 23,
      soldOut: false,
      stockItemId: MENU.jollofStock,
    });
    // A count belongs to its trading day: tomorrow nothing is counted yet.
    expect((await itemOn(db, MENU.jollof, '2026-09-18'))?.left).toBeNull();
    // Only items with a count record can be counted.
    expect((await itemOn(db, MENU.waakye))?.stockItemId).toBeNull();
  });
});
