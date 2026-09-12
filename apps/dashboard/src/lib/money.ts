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

/** 0–23 as "6am", "12pm", "1pm". */
export function hourLabel(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${hour < 12 ? 'am' : 'pm'}`;
}
