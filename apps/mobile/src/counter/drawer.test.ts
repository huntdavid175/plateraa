import { describe, expect, it } from 'vitest';
import { asksForDrawer } from './drawer';

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
