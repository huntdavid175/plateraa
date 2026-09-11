/**
 * The trading day a moment falls on, in the business's timezone (`YYYY-MM-DD`). Daily counts,
 * order numbers and reports hang off it. Built from parts rather than a locale's date format,
 * which differs between Node and Android.
 */
export function businessDateOf(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
