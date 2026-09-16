'use client';

import { useEffect } from 'react';

/**
 * Holds the page still behind a sheet or a dialog (16 Sep, user request): scrolling with the
 * drawer open used to move the menu underneath it. The page is fixed where it stands rather than
 * only hidden, since hiding the overflow doesn't stop an iPhone, and it goes back to exactly
 * where the customer was when the sheet closes.
 */
export function useLockScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const body = document.body;
    const top = window.scrollY;
    // On a laptop the scrollbar disappears with the page: pad by its width so nothing shifts.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const was = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    body.style.position = 'fixed';
    body.style.top = `-${top}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      Object.assign(body.style, was);
      window.scrollTo(0, top);
    };
  }, [locked]);
}
