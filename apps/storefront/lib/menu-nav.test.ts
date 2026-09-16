import { describe, expect, it } from 'vitest';
import { nextLit } from './menu-nav';

/** A phone: an 800 px window with the pinned bar about 64 px down. */
const VIEWPORT = 800;
const LINE = 64;

const look = (tops: (number | null)[], lit: number, atFoot = false) =>
  nextLit({ tops, line: LINE, lit, viewport: VIEWPORT, atFoot });

describe('which category pill is lit', () => {
  it('lights the first category at the top of the menu', () => {
    // Nothing has scrolled: every heading is below the bar.
    expect(look([200, 900, 1600], -1)).toBe(0);
    expect(look([200, 900, 1600], 0)).toBe(0);
  });

  it('lights a category as its heading reaches the bar, reading down', () => {
    expect(look([-500, 100, 900], 0)).toBe(0); // Still coming up the screen.
    expect(look([-700, LINE, 800], 0)).toBe(1); // Arrived under the bar.
    expect(look([-1500, -700, LINE], 1)).toBe(2);
  });

  it('does not jump back up the moment the category above peeps in', () => {
    // Scrolling back up: Mains' heading has just slipped below the bar, so all that shows of
    // Drinks is its last item. The user's complaint on 16 Sep: it lit Drinks straight away.
    expect(look([-900, LINE + 20, 900], 1)).toBe(1);
    expect(look([-900, LINE + 200, 1100], 1)).toBe(1);
  });

  it('lights the category above once it is properly on screen again', () => {
    // A third of the window down (0.35 × 800 = 280), Drinks has a real presence.
    expect(look([-600, LINE + 290, 1200], 1)).toBe(0);
  });

  it('keeps the rule when several categories are skipped at once', () => {
    expect(look([-200, 600, 1300], 2)).toBe(0);
  });

  it('lights the last category at the foot of the page', () => {
    // Too short to reach the bar, but it is what fills the bottom of the screen.
    expect(look([-2000, -1200, 420], 1, true)).toBe(2);
  });

  it('leaves a short menu that never scrolls on the first category', () => {
    // Everything fits on one screen, so the page is at its foot from the start.
    expect(look([200, 620], 0, true)).toBe(0);
  });

  it('recovers when the lit category is no longer on the menu', () => {
    expect(look([-700, LINE, 800], 7)).toBe(1);
    expect(look([], 0)).toBe(-1);
  });

  it('ignores a category whose heading it cannot measure yet', () => {
    expect(look([-700, null, 800], 0)).toBe(0);
  });
});
