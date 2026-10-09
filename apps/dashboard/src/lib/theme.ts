import { useSyncExternalStore } from 'react';

const KEY = 'plateraa.theme';

/** Light, dark, or whatever the device is set to. Remembered on this browser. */
export type ThemeChoice = 'light' | 'dark' | 'system';

const deviceDark = window.matchMedia('(prefers-color-scheme: dark)');

function saved(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // storage blocked: follow the device
  }
  return 'system';
}

let choice = saved();
let dark = false;
const listeners = new Set<() => void>();

function apply() {
  dark = choice === 'dark' || (choice === 'system' && deviceDark.matches);
  const html = document.documentElement;
  // Tailwind's `dark:` reads the class; Arc's tokens read data-theme.
  html.classList.toggle('dark', dark);
  html.dataset.theme = dark ? 'dark' : 'light';
  listeners.forEach((listener) => listener());
}
apply();
deviceDark.addEventListener('change', () => {
  if (choice === 'system') apply();
});

export function setTheme(next: ThemeChoice) {
  choice = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // storage blocked: the choice lasts until the tab closes
  }
  apply();
}

/** Turns dark on or off outright (the Settings switch). */
export function setDark(next: boolean) {
  setTheme(next ? 'dark' : 'light');
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, () => choice);
}

/** Whether the page is dark right now, whichever way it got there. */
export function useDark(): boolean {
  return useSyncExternalStore(subscribe, () => dark);
}
