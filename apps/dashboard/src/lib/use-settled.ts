import { useEffect, useState } from 'react';

/** The value once it has stopped changing for `ms`: a search runs when typing pauses, not per key. */
export function useSettled<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
