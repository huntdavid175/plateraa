'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a tap's scroll is given to arrive before scrolling decides the pill again. */
const JUMP_MS = 1200;

/** Sliding, unless the phone is set to keep still. */
const behaviour = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/** What the page looks like right now, as far as the pills are concerned. */
export interface Look {
  /** Each category's heading: how far below the top of the window it is, or null if unknown. */
  tops: readonly (number | null)[];
  /** The reading line, just under the pinned bar. */
  line: number;
  /** Which category is lit now, or -1. */
  lit: number;
  /** The height of the window. */
  viewport: number;
  /** The page is scrolled all the way down. */
  atFoot: boolean;
}

/**
 * Which category pill should be lit. Reading down the menu, a category lights as its heading
 * reaches the bar. Coming back up is not the same rule in reverse: the one above only lights
 * once it is properly on screen, a third of the way down, rather than the moment the heading
 * below it slips under the bar and its last item peeps in (16 Sep, after the user tried it).
 */
export function nextLit({ tops, line, lit, viewport, atFoot }: Look): number {
  const last = tops.length - 1;
  if (last < 0) return -1;

  // The last category can be too short to ever reach the line. Light it at the foot of the
  // page, but only once it really is what's on screen: a short menu never scrolls at all.
  const lastTop = tops[last];
  if (atFoot && lastTop !== null && lastTop !== undefined && lastTop < viewport * 0.6) {
    return last;
  }

  // The last category whose heading has passed under the bar.
  let next = 0;
  for (let index = 0; index <= last; index += 1) {
    const top = tops[index];
    if (top === null || top === undefined) continue;
    if (top - line > 1) break;
    next = index;
  }
  if (lit < 0 || lit > last) return next;
  if (next >= lit) return next;

  // Coming back up: how far the lit category's heading has moved back down the screen.
  const top = tops[lit];
  const backUp = Math.min(viewport * 0.35, 240);
  return top === null || top === undefined || top > line + backUp ? next : lit;
}

/**
 * The menu's category pills. They stay pinned at the top of the page, and follow the customer:
 * whichever category is being read is the one lit, and the strip slides that pill into view.
 * Tapping a pill scrolls to its category and holds it lit until the page arrives, so the pills
 * don't flicker through every category on the way.
 */
export function useMenuNav(ids: readonly string[]) {
  const [active, setActive] = useState(ids[0] ?? '');
  // The scroll handler reads this rather than `active`, so it never re-subscribes.
  const activeRef = useRef(active);
  const sections = useRef<Record<string, HTMLElement | null>>({});
  const pills = useRef<Record<string, HTMLElement | null>>({});
  const navRef = useRef<HTMLElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const jumpingTo = useRef<{ id: string; until: number } | null>(null);

  const light = useCallback((id: string) => {
    activeRef.current = id;
    setActive(id);
  }, []);

  useEffect(() => {
    if (ids.length < 2) return;
    let waiting = false;
    const topOf = (id: string) => sections.current[id]?.getBoundingClientRect().top ?? null;

    // The reading line is each section's own scroll-margin-top, so where a tap lands and where
    // scrolling decides the pill can't drift apart — on a phone it clears the pinned bar, and on
    // a laptop, where the categories stand in a column instead, it's the small top margin.
    let line: number | null = null;
    const lineOf = () => {
      if (line !== null) return line;
      const first = sections.current[ids[0] ?? ''];
      const margin = first ? parseFloat(getComputedStyle(first).scrollMarginTop) : NaN;
      line = Number.isFinite(margin) ? margin : (navRef.current?.offsetHeight ?? 56) + 8;
      return line;
    };

    const look = () => {
      waiting = false;
      const line = lineOf();

      const jump = jumpingTo.current;
      if (jump) {
        // Hold the tapped pill until its category reaches the line, from either direction (a
        // tap further up the menu scrolls back, so its heading starts above the line).
        const top = topOf(jump.id);
        if ((top !== null && Math.abs(top - line) <= 4) || Date.now() > jump.until) {
          jumpingTo.current = null;
        }
        return;
      }

      const index = nextLit({
        tops: ids.map(topOf),
        line,
        lit: ids.indexOf(activeRef.current),
        viewport: window.innerHeight,
        atFoot: window.innerHeight + window.scrollY >= document.body.scrollHeight - 2,
      });
      const id = ids[index];
      if (id && id !== activeRef.current) light(id);
    };

    const onScroll = () => {
      if (waiting) return;
      waiting = true;
      requestAnimationFrame(look);
    };
    // A wider window can change the layout, and with it where the line sits.
    const onResize = () => {
      line = null;
      onScroll();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    look();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [ids, light]);

  // Slide the lit pill into view along the strip, without moving the page itself.
  useEffect(() => {
    const strip = stripRef.current;
    const pill = pills.current[active];
    if (!strip || !pill) return;
    const stripBox = strip.getBoundingClientRect();
    const pillBox = pill.getBoundingClientRect();
    const middle = pillBox.left - stripBox.left - (stripBox.width - pillBox.width) / 2;
    const left = Math.max(
      0,
      Math.min(strip.scrollLeft + middle, strip.scrollWidth - strip.clientWidth),
    );
    if (Math.abs(strip.scrollLeft - left) > 4) strip.scrollTo({ left, behavior: behaviour() });
  }, [active]);

  const jump = useCallback(
    (id: string) => {
      const element = sections.current[id];
      if (!element) return;
      jumpingTo.current = { id, until: Date.now() + JUMP_MS };
      light(id);
      element.scrollIntoView({ behavior: behaviour(), block: 'start' });
    },
    [light],
  );

  return { active, jump, navRef, stripRef, sections, pills };
}
