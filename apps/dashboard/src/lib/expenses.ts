import type { ExpenseCategory } from '@plateraa/shared';
import { api, call } from './api';
import { queryClient } from './query';

export const fetchExpenses = (query: { from: string; to: string }) =>
  call(api.GET('/api/expenses', { params: { query } }));
export type Expense = Awaited<ReturnType<typeof fetchExpenses>>[number];

export type ManualMethod = 'OWNER_CASH' | 'MOMO' | 'BANK' | 'OTHER';

export const addExpense = (body: {
  id: string;
  amount: number;
  category: ExpenseCategory;
  method: ManualMethod;
  spentOn: string;
  note?: string;
  supplierName?: string;
  purchase?: { stockItemId: string; quantity: number };
}) => call(api.POST('/api/expenses', { body }));

export const removeExpense = (expenseId: string) =>
  call(api.DELETE('/api/expenses/{expenseId}', { params: { path: { expenseId } } }));

export const fetchStock = () => call(api.GET('/api/stock'));
export type StockItem = Awaited<ReturnType<typeof fetchStock>>[number];

export const addStockItem = (body: {
  id: string;
  name: string;
  unit: string;
  lowThreshold: number | null;
  onHand: number;
}) => call(api.POST('/api/stock', { body }));

export const updateStockItem = (
  stockItemId: string,
  body: { name: string; unit: string; lowThreshold: number | null },
) => call(api.PUT('/api/stock/{stockItemId}', { params: { path: { stockItemId } }, body }));

export const countStock = (stockItemId: string, body: { movementId: string; counted: number }) =>
  call(api.POST('/api/stock/{stockItemId}/count', { params: { path: { stockItemId } }, body }));

export const removeStockItem = (stockItemId: string) =>
  call(api.DELETE('/api/stock/{stockItemId}', { params: { path: { stockItemId } } }));

/** After money out or stock changes, the lists, the day and the drawers load again. */
export function refreshMoneyOut() {
  for (const key of ['expenses', 'stock', 'day', 'drawers']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export const METHOD_OUT_WORDS: Record<string, string> = {
  CASH_DRAWER: 'From a drawer',
  OWNER_CASH: 'Owner’s cash',
  MOMO: 'Mobile money',
  BANK: 'Bank',
  OTHER: 'Other',
};

const DAY_MS = 86_400_000;
export const shiftDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** First and last day of the month before the one `today` is in. */
export function lastMonth(today: string): { from: string; to: string } {
  const firstOfThis = `${today.slice(0, 7)}-01`;
  const to = shiftDays(firstOfThis, -1);
  return { from: `${to.slice(0, 7)}-01`, to };
}
