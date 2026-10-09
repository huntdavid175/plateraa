import { useEffect, useState } from 'react';

/** The time now, a minute at a time, for "5 min ago" in a feed (Arc's `Timeline` takes it). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
