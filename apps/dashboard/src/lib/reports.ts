import { api, call } from './api';

/** The day summary; leave out the date for today. Needs permission to see sales. */
export const fetchDay = (date?: string) =>
  call(api.GET('/api/reports/day', { params: { query: date ? { date } : {} } }));

/** Money in pesewas: in, not yet collected, out, what's left, profit, and the breakdowns. */
export type DaySummary = Awaited<ReturnType<typeof fetchDay>>;

/** Reports over a range of trading days (at most 92). */
export const fetchPeriod = (from: string, to: string) =>
  call(api.GET('/api/reports/period', { params: { query: { from, to } } }));

export type Period = Awaited<ReturnType<typeof fetchPeriod>>;
