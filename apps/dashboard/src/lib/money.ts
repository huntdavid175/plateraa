import { formatCedis, pesewas } from '@plateraa/shared';

/** Pesewas from the API, shown as GH₵1,085.00. */
export const cedis = (amount: number): string => formatCedis(pesewas(amount));

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

/** A moment as "13:42", in this browser's timezone (Ghana's, for the vendors). */
export function clock(isoTime: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(isoTime),
  );
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
