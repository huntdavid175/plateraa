'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a tap's scroll is given to arrive before scrolling decides the pill again. */
const JUMP_MS = 1200;

/** Sliding, unless the phone is set to keep still. */
const behaviour = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/**
 * The menu's category pills. They stay pinned at the top of the page, and follow the customer:
 * whichever section has passed under the bar is the one lit, and the strip slides that pill into
 * view. Tapping a pill scrolls to its section and holds it lit until the page arrives, so the
 * pills don't flicker through every category on the way.
 */
export function useMenuNav(ids: readonly string[]) {
  const [active, setActive] = useState(ids[0] ?? '');
  const sections = useRef<Record<string, HTMLElement | null>>({});
  const pills = useRef<Record<string, HTMLElement | null>>({});
  const navRef = useRef<HTMLElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const jumpingTo = useRef<{ id: string; until: number } | null>(null);

  useEffect(() => {
    if (ids.length < 2) return;
    let waiting = false;

    const look = () => {
      waiting = false;
      // The reading line: just under the pinned bar, matching the sections' scroll-mt.
      const line = (navRef.current?.offsetHeight ?? 56) + 8;
      const jump = jumpingTo.current;
      if (jump) {
        // Hold the tapped pill until its section reaches the line (or the scroll gives up).
        const element = sections.current[jump.id];
        const there = element && element.getBoundingClientRect().top - line <= 2;
        if (there || Date.now() > jump.until) jumpingTo.current = null;
        return;
      }
      let current = ids[0] ?? '';
      // At the foot of the page the last section can be too short to reach the line.
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) {
        current = ids[ids.length - 1] ?? current;
      } else {
        for (const id of ids) {
          const element = sections.current[id];
          if (!element) continue;
          if (element.getBoundingClientRect().top - line > 1) break;
          current = id;
        }
      }
      setActive(current);
    };

    const onScroll = () => {
      if (waiting) return;
      waiting = true;
      requestAnimationFrame(look);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    look();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids]);

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

  const jump = useCallback((id: string) => {
    const element = sections.current[id];
    if (!element) return;
    jumpingTo.current = { id, until: Date.now() + JUMP_MS };
    setActive(id);
    element.scrollIntoView({ behavior: behaviour(), block: 'start' });
  }, []);

  return { active, jump, navRef, stripRef, sections, pills };
}
