import { useSyncExternalStore } from 'react';

const KEY = 'plateraa.theme';

function initial(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved === 'dark';
  } catch {
    // storage blocked: fall back to the device setting
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

let dark = initial();
const listeners = new Set<() => void>();

function apply() {
  document.documentElement.classList.toggle('dark', dark);
}
apply();

/** Light or dark, remembered on this browser. Starts from the device's own setting. */
export function setDark(next: boolean) {
  dark = next;
  apply();
  try {
    localStorage.setItem(KEY, next ? 'dark' : 'light');
  } catch {
    // storage blocked: the choice lasts until the tab closes
  }
  listeners.forEach((listener) => listener());
}

export function useDark(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => dark,
  );
}
