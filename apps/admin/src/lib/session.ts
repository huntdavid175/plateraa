import { useSyncExternalStore } from 'react';

/** The admin console's login: a Better Auth bearer token, kept apart from the dashboard's. */
const KEY = 'brixx.admin.token';

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked: the login lasts until the tab closes
  }
}

let token = read();
const listeners = new Set<() => void>();

function set(next: string | null) {
  token = next;
  try {
    if (next === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // storage blocked: keep going in memory
  }
  listeners.forEach((listener) => listener());
}

export const session = {
  token: () => token,
  signIn: (next: string) => set(next),
  signOut: () => set(null),
};

export function useToken() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => token,
  );
}
