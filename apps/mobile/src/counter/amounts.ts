import { formatCedis, parseCedis, type Pesewas } from '@plateraa/shared';

/** The cash keypad, as used by the payment sheet and the drawer prompt. */
export const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;
export type Key = (typeof KEYS)[number];

/** What one keypad press does to the amount typed so far: two decimals at most, eight digits. */
export function pressKey(typed: string, key: Key): string {
  if (key === 'back') return typed.slice(0, -1);
  if (key === '.') return typed.includes('.') ? typed : `${typed || '0'}.`;
  if (typed.includes('.') && typed.split('.')[1]!.length >= 2) return typed;
  if (typed.replace('.', '').length >= 8) return typed;
  if (typed === '0') return key;
  return typed + key;
}

/** The typed amount in pesewas, or null when nothing valid is typed. */
export function amountOf(typed: string): Pesewas | null {
  const trimmed = typed.endsWith('.') ? typed.slice(0, -1) : typed;
  return trimmed ? parseCedis(trimmed) : null;
}

/** An amount as the keypad shows it ("105.00"), without floating-point maths. */
export const plainAmount = (amount: Pesewas) => formatCedis(amount).replace(/[^\d.]/g, '');
