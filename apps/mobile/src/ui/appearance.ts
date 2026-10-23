import * as SecureStore from 'expo-secure-store';
import { setScheme, type Scheme } from './theme';

const KEY = 'brixx.appearance';

/** Puts back the look this tablet was left in. Synchronous, so the first screen is already right. */
export function loadAppearance() {
  try {
    const stored = SecureStore.getItem(KEY);
    if (stored === 'dark' || stored === 'light') setScheme(stored);
  } catch (error) {
    console.warn('Reading the saved look failed', error);
  }
}

/** Switches the counter to light or dark, and remembers it on this tablet. */
export function saveAppearance(scheme: Scheme) {
  setScheme(scheme);
  try {
    SecureStore.setItem(KEY, scheme);
  } catch (error) {
    console.warn('Saving the look failed', error);
  }
}
