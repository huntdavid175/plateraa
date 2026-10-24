'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Prints its children in from the top once, the first time they're mostly in view, like a receipt
 * leaving the printer. It renders fully shown, and is only hidden after mount while still off
 * screen, so without script or under reduced motion nothing is ever hidden.
 */
export function PrintIn({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'shown' | 'waiting' | 'printing'>('shown');

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setState('waiting');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setState('printing');
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The observer watches the outer box: a box clipped to nothing never counts as in view.
  return (
    <div ref={ref}>
      <div
        className={
          state === 'waiting'
            ? '[clip-path:inset(0_0_100%_0)]'
            : state === 'printing'
              ? 'animate-[print-in_1100ms_cubic-bezier(0.16,1,0.3,1)_both]'
              : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
