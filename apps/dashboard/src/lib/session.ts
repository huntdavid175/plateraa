import { useSyncExternalStore } from 'react';

/** The dashboard login: a Better Auth bearer token, and the business being worked on. */
export interface Session {
  token: string | null;
  tenantId: string | null;
}

const TOKEN_KEY = 'plateraa.token';
const TENANT_KEY = 'plateraa.tenant';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked: the login lasts until the tab closes
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked: keep going in memory
  }
}

let current: Session = { token: read(TOKEN_KEY), tenantId: read(TENANT_KEY) };
const listeners = new Set<() => void>();

function update(next: Session) {
  current = next;
  write(TOKEN_KEY, next.token);
  write(TENANT_KEY, next.tenantId);
  listeners.forEach((listener) => listener());
}

export const session = {
  get: (): Session => current,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  signedIn: (token: string) => update({ token, tenantId: null }),
  chooseBusiness: (tenantId: string | null) => update({ ...current, tenantId }),
  signOut: () => update({ token: null, tenantId: null }),
};

export function useSession(): Session {
  return useSyncExternalStore(session.subscribe, session.get);
}
