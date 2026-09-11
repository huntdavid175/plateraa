import { createApiClient } from '@plateraa/api-client';
import { resolveCapabilities, type Capability, type Role } from '@plateraa/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { API_URL } from '../config';
import { SyncEngine, type SyncState } from '../offline/engine';
import { opSqliteDriver } from '../offline/op-sqlite';
import { openLocalDatabase, resetLocalData } from '../offline/schema';
import type { Database, SqlValue } from '../offline/sql';
import { httpTransport } from '../offline/transport';
import {
  forgetCredentials,
  loadCredentials,
  saveCredentials,
  type DeviceCredentials,
} from './credentials';
import { newId } from './ids';

export interface UnlockedStaff {
  id: string;
  displayName: string;
  role: Role;
  capabilities: ReadonlySet<Capability>;
}

/** loading → unregistered (set the tablet up) → locked (PIN switcher) ⇄ unlocked. */
export type Phase = 'loading' | 'unregistered' | 'locked' | 'unlocked';

interface Tablet {
  phase: Phase;
  /** Set if the tablet's database couldn't be opened. */
  problem: string | null;
  db: Database | null;
  device: DeviceCredentials | null;
  engine: SyncEngine | null;
  staff: UnlockedStaff | null;
  /** The registration screen hands over once the first sync is done and the owner has a PIN. */
  completeRegistration(device: DeviceCredentials, engine: SyncEngine): Promise<void>;
  unlock(staff: { id: string; displayName: string; role: Role }): void;
  lock(): void;
  /** Forgets the registration and everything on the tablet, so it can be registered again. */
  forget(): Promise<void>;
}

let opening: Promise<Database> | null = null;

/** The tablet's one database, opened on first use. */
export function localDatabase(): Promise<Database> {
  opening ??= openLocalDatabase(opSqliteDriver());
  return opening;
}

/** The sync engine of a registered tablet, talking to the API with its device token. */
export function createEngine(db: Database, device: DeviceCredentials): SyncEngine {
  const api = createApiClient(API_URL, { deviceToken: () => device.token });
  return new SyncEngine({ db, transport: httpTransport(api), deviceId: device.deviceId, newId });
}

const TabletContext = createContext<Tablet | null>(null);

export function TabletProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [db, setDb] = useState<Database | null>(null);
  const [device, setDevice] = useState<DeviceCredentials | null>(null);
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [staff, setStaff] = useState<UnlockedStaff | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [database, saved] = await Promise.all([localDatabase(), loadCredentials()]);
        if (cancelled) return;
        setDb(database);
        if (saved) {
          const registered = createEngine(database, saved);
          await registered.init();
          setDevice(saved);
          setEngine(registered);
        }
      } catch (error) {
        setProblem(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep syncing while this is the tablet's engine; pulls pause in the background.
  useEffect(() => {
    if (!engine) return;
    engine.start();
    const subscription = AppState.addEventListener('change', (state) =>
      engine.setForeground(state === 'active'),
    );
    return () => {
      subscription.remove();
      engine.stop();
    };
  }, [engine]);

  // Someone switched off on the dashboard can't carry on using the tablet.
  const version = useEngineState(engine)?.dataVersion ?? 0;
  useEffect(() => {
    if (!db || !staff) return;
    let current = true;
    void db
      .get<{ active: number | null }>('SELECT active FROM staff WHERE id = ?', [staff.id])
      .then((row) => {
        if (current && row?.active !== 1) setStaff(null);
      });
    return () => {
      current = false;
    };
  }, [db, staff, version]);

  const completeRegistration = useCallback(
    async (registered: DeviceCredentials, started: SyncEngine) => {
      await saveCredentials(registered);
      setStaff(null);
      setDevice(registered);
      setEngine(started);
    },
    [],
  );

  const forget = useCallback(async () => {
    engine?.stop();
    await forgetCredentials();
    if (db) await resetLocalData(db);
    setStaff(null);
    setEngine(null);
    setDevice(null);
  }, [db, engine]);

  const unlock = useCallback(
    (person: { id: string; displayName: string; role: Role }) =>
      setStaff({ ...person, capabilities: resolveCapabilities(person.role) }),
    [],
  );
  const lock = useCallback(() => setStaff(null), []);

  const phase: Phase = !loaded
    ? 'loading'
    : !device
      ? 'unregistered'
      : staff
        ? 'unlocked'
        : 'locked';

  const value = useMemo<Tablet>(
    () => ({
      phase,
      problem,
      db,
      device,
      engine,
      staff,
      completeRegistration,
      unlock,
      lock,
      forget,
    }),
    [phase, problem, db, device, engine, staff, completeRegistration, unlock, lock, forget],
  );
  return <TabletContext.Provider value={value}>{children}</TabletContext.Provider>;
}

export function useTablet(): Tablet {
  const tablet = useContext(TabletContext);
  if (!tablet) throw new Error('useTablet must be used inside TabletProvider');
  return tablet;
}

/** The sync engine's state (connection, what's waiting, Needs attention), or null before setup. */
export function useEngineState(engine: SyncEngine | null): SyncState | null {
  const subscribe = useCallback(
    (onChange: () => void) => (engine ? engine.subscribe(onChange) : () => undefined),
    [engine],
  );
  return useSyncExternalStore(subscribe, () => engine?.getState() ?? null);
}

/** Rows from the tablet's database, read again whenever its data changes. Null while loading. */
export function useLocalQuery<T extends object>(
  sql: string,
  params: readonly SqlValue[] = [],
): T[] | null {
  const { db, engine } = useTablet();
  const version = useEngineState(engine)?.dataVersion ?? 0;
  const [rows, setRows] = useState<T[] | null>(null);
  const key = JSON.stringify(params);
  useEffect(() => {
    if (!db) return;
    let current = true;
    db.all<T>(sql, JSON.parse(key) as SqlValue[]).then(
      (result) => {
        if (current) setRows(result);
      },
      (error: unknown) => console.warn('Reading the tablet database failed', error),
    );
    return () => {
      current = false;
    };
  }, [db, sql, key, version]);
  return rows;
}
