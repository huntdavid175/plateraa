import { describe, expect, it } from 'vitest';
import { DEVICE_ID, MENU, NOW, STAFF_ID, TODAY, setUp } from '../offline/testing/fixtures';
import { setSoldOut, type Counter } from './actions';
import { loadMenu } from './menu';

type Db = Awaited<ReturnType<typeof setUp>>['db'];

const soldOut = async (db: Db, itemId: string, date = TODAY) =>
  (await loadMenu(db, date)).flatMap((category) => category.items).find((i) => i.id === itemId)
    ?.soldOut;

describe('the sold-out switch', () => {
  it('takes an item off sale for today with one tap, and puts it back', async () => {
    const { db, engine } = await setUp();
    const counter: Counter = {
      engine,
      staffId: STAFF_ID,
      deviceId: DEVICE_ID,
      deviceCode: 'A',
      now: () => NOW,
    };

    await setSoldOut(counter, MENU.waakye, true);
    expect(await soldOut(db, MENU.waakye)).toBe(true);
    expect(await soldOut(db, MENU.jollof)).toBe(false);
    // Sold out lasts the trading day: tomorrow it's on sale again.
    expect(await soldOut(db, MENU.waakye, '2026-09-18')).toBe(false);

    await setSoldOut(counter, MENU.waakye, false);
    expect(await soldOut(db, MENU.waakye)).toBe(false);
  });
});
