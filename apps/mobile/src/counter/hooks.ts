import { businessDateOf } from '@plateraa/shared';
import { useEffect, useMemo, useState } from 'react';
import type { Database } from '../offline/sql';
import { useEngineState, useLocalQuery, useTablet } from '../tablet/TabletProvider';
import type { Counter } from './actions';
import { loadMenu, type MenuCategory } from './menu';
import { loadQueue, type QueueOrder } from './queue';

export const today = () => businessDateOf(new Date(), 'Africa/Accra');

/** The unlocked person at this tablet, for recording what they do. Null while locked. */
export function useCounter(): Counter | null {
  const { engine, staff, device } = useTablet();
  return useMemo(
    () =>
      engine && staff && device
        ? {
            engine,
            staffId: staff.id,
            deviceId: device.deviceId,
            deviceCode: device.deviceCode,
          }
        : null,
    [engine, staff, device],
  );
}

/** Loads from the tablet's database, and again whenever its data or the trading day changes. */
function useLoaded<T>(load: (db: Database, date: string) => Promise<T>): T | null {
  const { db, engine } = useTablet();
  const version = useEngineState(engine)?.dataVersion ?? 0;
  const date = today();
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!db) return;
    let current = true;
    load(db, date).then(
      (result) => {
        if (current) setValue(result);
      },
      (error: unknown) => console.warn('Reading the tablet database failed', error),
    );
    return () => {
      current = false;
    };
    // `load` is a new function each render; what matters is the data and the day.
  }, [db, version, date]);
  return value;
}

export const useMenu = (): MenuCategory[] | null => useLoaded(loadMenu);

export const useQueue = (): QueueOrder[] | null => useLoaded(loadQueue);

/** The business's pay-before-prep setting: on unless the owner turned it off. */
export function usePayBeforePrep(): boolean {
  const rows = useLocalQuery<{ on: number | null }>(
    'SELECT require_payment_before_prep AS "on" FROM settings LIMIT 1',
  );
  const on = rows?.[0]?.on;
  return on === null || on === undefined ? true : on === 1;
}

/** The time now, ticking over every `everyMs`, for the queue's timers. */
export function useNow(everyMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
