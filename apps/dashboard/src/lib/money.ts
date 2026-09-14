import { formatCedis, pesewas } from '@plateraa/shared';

/** Pesewas from the API, shown as GH₵1,085.00. */
export const cedis = (amount: number): string => formatCedis(pesewas(amount));

/**
 * What someone typed ("12", "12.5", "12.50") as pesewas, or null if it isn't an amount.
 * Whole-number maths only, so no float rounding creeps in.
 */
export function parseAmount(text: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{0,2}))?$/.exec(text.trim().replace(/,/g, ''));
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return Number(match[1]) * 100 + Number(fraction);
}

/** Pesewas as the plain number someone would type: 9000 → "90.00". */
export function amountText(amount: number): string {
  return `${Math.trunc(amount / 100)}.${String(amount % 100).padStart(2, '0')}`;
}

/** A trading day (YYYY-MM-DD) as "Saturday 12 Sep 2026". */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

/** A trading day (YYYY-MM-DD) as "Sat 12 Sep". */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

/** A moment as "13:42", in this browser's timezone (Ghana's, for the vendors). */
export function clock(isoTime: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(isoTime),
  );
}

/** How long ago something happened: "just now", "5 min ago", "3 hours ago", "2 days ago". */
export function ago(isoTime: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(isoTime).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Today as YYYY-MM-DD in this browser's timezone. */
export function todayHere(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** 0–23 as "6am", "12pm", "1pm". */
export function hourLabel(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${hour < 12 ? 'am' : 'pm'}`;
}

/** The hour starting at 0–23 as "12pm–1pm". */
export function hourRange(hour: number): string {
  return `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;
}
