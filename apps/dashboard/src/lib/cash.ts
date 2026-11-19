import { api, call } from './api';

/** Drawer closes over some days (at most 92): the figures, every close, who was on them. */
export const fetchCashCloses = (from: string, to: string) =>
  call(api.GET('/api/cash/closes', { params: { query: { from, to } } }));

export type CashCloses = Awaited<ReturnType<typeof fetchCashCloses>>;
export type CashClose = CashCloses['closes'][number];

/** One drawer: how its expected cash was worked out, its movements, who took cash on it. */
export const fetchCashClose = (shiftId: string) =>
  call(api.GET('/api/cash/closes/{shiftId}', { params: { path: { shiftId } } }));

export type CashCloseDetail = Awaited<ReturnType<typeof fetchCashClose>>;

/** How a close came out, as the page says and colours it. */
export const RESULT_WORDS = { EXACT: 'Exact', SHORT: 'Short', OVER: 'Over' } as const;
export const RESULT_TONES = {
  EXACT: 'text-success',
  SHORT: 'text-danger',
  OVER: 'text-warning',
} as const;
