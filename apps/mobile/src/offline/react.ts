import { useCallback, useSyncExternalStore } from 'react';
import type { SyncEngine, SyncState } from './engine';

/** The engine's state (connection, what's waiting, Needs attention); re-renders when it changes. */
export function useSyncState(engine: SyncEngine): SyncState {
  const subscribe = useCallback((onChange: () => void) => engine.subscribe(onChange), [engine]);
  return useSyncExternalStore(subscribe, () => engine.getState());
}
