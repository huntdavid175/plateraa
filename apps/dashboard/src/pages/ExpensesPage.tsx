import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@plateraa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ulid } from 'ulid';
import {
  METHOD_OUT_WORDS,
  addExpense,
  fetchExpenses,
  fetchStock,
  lastMonth,
  refreshMoneyOut,
  removeExpense,
  shiftDays,
  type Expense,
  type ManualMethod,
} from '../lib/expenses';
import { cedis, longDate, parseAmount, todayHere } from '../lib/money';
import { useSession } from '../lib/session';
import { EXPENSE_WORDS } from '../lib/words';
import { useMe } from '../shell/Shell';
import {
  Button,
  Card,
  ErrorNote,
  FieldLabel,
  PillFilter,
  Spinner,
  Tag,
  TextInput,
  Toggle,
} from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { Page } from '../ui/Page';

const RANGES = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'last', label: 'Last month' },
] as const;
type Range = (typeof RANGES)[number]['value'];

function rangeOf(range: Range): { from: string; to: string } {
  const today = todayHere();
  if (range === 'week') return { from: shiftDays(today, -6), to: today };
  if (range === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return lastMonth(today);
}

/** Money out that isn't a drawer payout: rent, gas, a supplier paid by MoMo. */
export function ExpensesPage() {
  const { tenantId } = useSession();
  const [range, setRange] = useState<Range>('week');
  const dates = rangeOf(range);
  const list = useQuery({
    queryKey: ['expenses', tenantId, dates],
    queryFn: () => fetchExpenses(dates),
  });
  const [adding, setAdding] = useState(false);
  const total = (list.data ?? []).reduce((sum, row) => sum + row.amount, 0);

  return (
    <Page
      title="Expenses"
      subtitle="Money out: purchases, bills and payouts."
      actions={
        <Button small onClick={() => setAdding(true)}>
          + Add expense
        </Button>
      }
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <PillFilter label="Which days" options={RANGES} value={range} onChange={setRange} />
        {list.data && (
          <p className="text-sm text-muted">
            Total <span className="font-mono font-semibold text-text">{cedis(total)}</span>
          </p>
        )}
      </div>
      <Card className="overflow-hidden">
        {list.isPending && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {list.isError && (
          <div className="p-4">
            <ErrorNote>{list.error.message}</ErrorNote>
          </div>
        )}
        {list.data?.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted">Nothing spent on these days.</p>
        )}
        {list.data?.map((expense) => (
          <ExpenseRow key={expense.id} expense={expense} />
        ))}
      </Card>
      {adding && <AddExpenseDialog onClose={() => setAdding(false)} />}
    </Page>
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  const removing = useMutation({
    mutationFn: () => removeExpense(expense.id),
    onSuccess: refreshMoneyOut,
  });
  const detail = [
    expense.purchase
      ? `${expense.purchase.quantity} ${expense.purchase.unit} ${expense.purchase.name}`
      : null,
    expense.supplierName,
    expense.note,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-4 border-b border-border px-5 py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{EXPENSE_WORDS[expense.category]}</p>
          <Tag>{METHOD_OUT_WORDS[expense.method]}</Tag>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {longDate(expense.spentOn)}
          {expense.by ? ` · ${expense.by}` : ''}
          {detail.length ? ` · ${detail.join(' · ')}` : ''}
        </p>
        {removing.error && <p className="mt-1 text-xs text-red">{removing.error.message}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold">{cedis(expense.amount)}</p>
        {!expense.fromDrawer && (
          <button
            type="button"
            disabled={removing.isPending}
            onClick={() => {
              if (
                window.confirm(
                  'Remove this expense?' + (expense.purchase ? ' Its stock comes off too.' : ''),
                )
              ) {
                removing.mutate();
              }
            }}
            className="mt-1 text-xs text-muted hover:text-red"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

const METHODS: { value: ManualMethod; label: string }[] = [
  { value: 'OWNER_CASH', label: 'Owner’s cash' },
  { value: 'MOMO', label: 'Mobile money' },
  { value: 'BANK', label: 'Bank' },
  { value: 'OTHER', label: 'Other' },
];

function AddExpenseDialog({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const { tenantId } = useSession();
  const [id] = useState(() => ulid());
  const [text, setText] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('INGREDIENTS');
  const [method, setMethod] = useState<ManualMethod>('OWNER_CASH');
  const [spentOn, setSpentOn] = useState(todayHere());
  const [note, setNote] = useState('');
  const [supplier, setSupplier] = useState('');
  const [isPurchase, setIsPurchase] = useState(false);
  const [stockItemId, setStockItemId] = useState('');
  const [quantityText, setQuantityText] = useState('');
  const canStock = me.capabilities.includes('catalog.manage');
  const stock = useQuery({
    queryKey: ['stock', tenantId],
    queryFn: fetchStock,
    enabled: isPurchase && canStock,
  });

  const amount = parseAmount(text);
  const quantity = /^\d{1,6}$/.test(quantityText) ? Number(quantityText) : null;
  const problem = !amount
    ? 'Type the amount.'
    : isPurchase && (!stockItemId || !quantity)
      ? 'Pick the ingredient and how many.'
      : null;

  const saving = useMutation({
    mutationFn: () =>
      addExpense({
        id,
        amount: amount!,
        category,
        method,
        spentOn,
        note: note.trim() || undefined,
        supplierName: supplier.trim() || undefined,
        ...(isPurchase ? { purchase: { stockItemId, quantity: quantity! } } : {}),
      }),
    onSuccess: () => {
      refreshMoneyOut();
      onClose();
    },
  });

  return (
    <Dialog title="Add expense" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <p className="text-xs text-muted">
          Cash paid out of a tablet’s drawer is a payout: record it from Today’s open drawers.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="expense-amount">Amount (GH₵)</FieldLabel>
            <TextInput
              id="expense-amount"
              inputMode="decimal"
              autoFocus
              className="font-mono"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="expense-date">Day</FieldLabel>
            <TextInput
              id="expense-date"
              type="date"
              max={todayHere()}
              value={spentOn}
              onChange={(event) => setSpentOn(event.target.value || todayHere())}
            />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="expense-category">What for</FieldLabel>
          <select
            id="expense-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text outline-none focus:border-brand"
          >
            {EXPENSE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {EXPENSE_WORDS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>How it was paid</FieldLabel>
          <PillFilter
            label="How it was paid"
            options={METHODS}
            value={method}
            onChange={setMethod}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="expense-supplier">Paid to (optional)</FieldLabel>
            <TextInput
              id="expense-supplier"
              maxLength={80}
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="expense-note">Note (optional)</FieldLabel>
            <TextInput
              id="expense-note"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
        {canStock && (
          <div className="rounded-xl bg-tile px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">It’s a stock purchase</p>
                <p className="text-xs text-muted">Adds what was bought to an ingredient’s stock.</p>
              </div>
              <Toggle on={isPurchase} onChange={setIsPurchase} label="It’s a stock purchase" />
            </div>
            {isPurchase && (
              <div className="mt-3 grid grid-cols-[1fr_6rem] gap-3">
                <select
                  aria-label="Ingredient"
                  value={stockItemId}
                  onChange={(event) => setStockItemId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text outline-none focus:border-brand"
                >
                  <option value="">
                    {stock.data?.length === 0
                      ? 'Add ingredients on the Stock page'
                      : 'Which ingredient'}
                  </option>
                  {stock.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.unit})
                    </option>
                  ))}
                </select>
                <TextInput
                  aria-label="How many"
                  inputMode="numeric"
                  placeholder="How many"
                  className="font-mono"
                  value={quantityText}
                  onChange={(event) => setQuantityText(event.target.value.replace(/\D/g, ''))}
                />
              </div>
            )}
          </div>
        )}
        {saving.error && <ErrorNote>{saving.error.message}</ErrorNote>}
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" full disabled={!!problem} busy={saving.isPending}>
            Add {amount ? cedis(amount) : 'expense'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
