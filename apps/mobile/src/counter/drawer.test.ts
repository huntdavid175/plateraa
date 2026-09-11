import { pesewas, resolveCapabilities } from '@plateraa/shared';
import { ulid } from 'ulid';
import { describe, expect, it } from 'vitest';
import { DEVICE_ID, STAFF_ID, serverShift, setUp } from '../offline/testing/fixtures';
import { asksForDrawer, loadDrawer, seesDrawerResult, varianceWords } from './drawer';

const base = { runsDrawer: true, drawerOpen: false, skippedOn: null, today: '2026-09-11' };

describe('the start-of-day drawer prompt', () => {
  it('asks someone who runs the drawer when none is open', () => {
    expect(asksForDrawer(base)).toBe(true);
  });

  it('stays quiet once a drawer is open, or while that is still being read', () => {
    expect(asksForDrawer({ ...base, drawerOpen: true })).toBe(false);
    expect(asksForDrawer({ ...base, drawerOpen: null })).toBe(false);
  });

  it("doesn't ask someone who can't run the drawer", () => {
    expect(asksForDrawer({ ...base, runsDrawer: false })).toBe(false);
  });

  it('"Not now" lasts the trading day, and it asks again the next day', () => {
    expect(asksForDrawer({ ...base, skippedOn: '2026-09-11' })).toBe(false);
    expect(asksForDrawer({ ...base, skippedOn: '2026-09-10' })).toBe(true);
  });
});

async function withOpenDrawer() {
  const tablet = await setUp();
  const shiftId = ulid();
  tablet.server.changes = { shifts: [serverShift(shiftId)] };
  await tablet.engine.syncNow();
  return { ...tablet, shiftId };
}

describe('the Drawer tab', () => {
  it('shows the open drawer, its float, and cash taken out or put in', async () => {
    const { db, engine, shiftId } = await withOpenDrawer();
    await engine.record(
      'shift.cash_movement',
      { movementId: ulid(), shiftId, type: 'DROP', amount: 2000, note: 'To the safe' },
      STAFF_ID,
    );

    const drawer = await loadDrawer(db, DEVICE_ID);
    expect(drawer.open).toMatchObject({ id: shiftId, openedByName: 'Ama', float: 10000 });
    expect(drawer.open?.movements).toMatchObject([
      { type: 'DROP', amount: 2000, note: 'To the safe', staffName: 'Ama' },
    ]);
    expect(drawer.lastClosed).toBeNull();
  });

  it('shows the last close, marked as not yet checked by the server', async () => {
    const { db, engine, shiftId } = await withOpenDrawer();
    await engine.record('shift.close', { shiftId, counted: 9500 }, STAFF_ID);

    const drawer = await loadDrawer(db, DEVICE_ID);
    expect(drawer.open).toBeNull();
    expect(drawer.lastClosed).toMatchObject({
      id: shiftId,
      closedBy: STAFF_ID,
      closedByName: 'Ama',
      expected: 10000,
      counted: 9500,
      variance: -500,
      provisional: 1,
    });
  });

  it('shows the figures only to whoever counted, or to someone who can see revenue', () => {
    const cashier = { id: STAFF_ID, capabilities: resolveCapabilities('STAFF') };
    const owner = { id: ulid(), capabilities: resolveCapabilities('OWNER') };
    expect(seesDrawerResult(cashier, STAFF_ID)).toBe(true);
    expect(seesDrawerResult(cashier, ulid())).toBe(false);
    expect(seesDrawerResult(owner, STAFF_ID)).toBe(true);
  });

  it('puts the difference in words', () => {
    expect(varianceWords(pesewas(0))).toEqual({ words: 'Exactly right', tone: 'good' });
    expect(varianceWords(pesewas(-500))).toEqual({ words: 'Short by GH₵ 5.00', tone: 'red' });
    expect(varianceWords(pesewas(250))).toEqual({ words: 'Over by GH₵ 2.50', tone: 'amber' });
  });
});
