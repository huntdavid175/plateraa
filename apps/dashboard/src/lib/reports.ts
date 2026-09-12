import { api, call } from './api';

/** The day summary; leave out the date for today. Needs permission to see sales. */
export const fetchDay = (date?: string) =>
  call(api.GET('/api/reports/day', { params: { query: date ? { date } : {} } }));

/** Money in pesewas: in, not yet collected, out, what's left, profit, and the breakdowns. */
export type DaySummary = Awaited<ReturnType<typeof fetchDay>>;
