import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@plateraa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ulid } from 'ulid';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { FilterToolbar } from '@/components/arc/filter-toolbar/filter-toolbar';
import { Input } from '@/components/arc/input/input';
import { RadioGroup } from '@/components/arc/radio-group/radio-group';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Select } from '@/components/arc/select/select';
import { Switch } from '@/components/arc/switch/switch';
import { DateField } from '@/components/app/day-picker';
import { MoneyField, PlainField } from '@/components/app/money-field';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Page } from '../ui/Page';

const RANGES = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: 'pick', label: 'Pick days' },
] as const;
type Range = (typeof RANGES)[number]['value'];

function rangeOf(range: Exclude<Range, 'pick'>, today: string): { from: string; to: string } {
  if (range === 'week') return { from: shiftDays(today, -6), to: today };
  if (range === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return lastMonth(today);
}

const KIND_WORDS = { purchase: 'Purchases only', other: 'Other expenses only' } as const;
type Kind = keyof typeof KIND_WORDS;

/**
 * Money out: purchases, bills and drawer payouts. The days (`?range=`, or `from`/`to`), and a
 * category (`?category=`) or purchases against the rest (`?kind=`), live in the address, so the
 * figures on Home and Reports link straight here.
 */
export function ExpensesPage() {
  const { tenantId } = useSession();
  const [params, setParams] = useSearchParams();
  const today = todayHere();
  const range =
    RANGES.find((r) => r.value === params.get('range'))?.value ??
    (params.get('from') ? 'pick' : 'week');
  const dates =
    range === 'pick'
      ? { from: params.get('from') ?? shiftDays(today, -6), to: params.get('to') ?? today }
      : rangeOf(range, today);
  const category = EXPENSE_CATEGORIES.find((value) => value === params.get('category')) ?? null;
  const kindParam = params.get('kind');
  const kind: Kind | null = kindParam === 'purchase' || kindParam === 'other' ? kindParam : null;

  const change = (patch: Record<string, string | null>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  const choose = (next: Range) =>
    change(
      next === 'pick'
        ? { range: 'pick', from: dates.from, to: dates.to }
        : { range: next === 'week' ? null : next, from: null, to: null },
    );

  const list = useQuery({
    queryKey: ['expenses', tenantId, dates],
    queryFn: () => fetchExpenses(dates),
  });
  const [adding, setAdding] = useState(false);
  const shown = (list.data ?? []).filter(
    (row) =>
      (!category || row.category === category) &&
      (!kind || (kind === 'purchase') === Boolean(row.purchase)),
  );
  const total = shown.reduce((sum, row) => sum + row.amount, 0);
  const chips = [
    category && { id: 'category', label: 'For', value: EXPENSE_WORDS[category] },
    kind && { id: 'kind', label: 'Showing', value: KIND_WORDS[kind] },
  ].filter((chip): chip is { id: string; label: string; value: string } => Boolean(chip));

  return (
    <Page
      title="Expenses"
      subtitle="Money out: purchases, bills and payouts."
      actions={
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} strokeWidth={1.75} aria-hidden />
          Add expense
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <SegmentedControl
              label="Which days"
              options={[...RANGES]}
              value={range}
              onValueChange={(value) => choose(value as Range)}
            />
            {range === 'pick' && (
              <>
                <DateField
                  label="From"
                  date={dates.from}
                  max={today}
                  onPick={(from) => change({ from })}
                />
                <DateField label="To" date={dates.to} max={today} onPick={(to) => change({ to })} />
              </>
            )}
          </div>
          {chips.length > 0 && (
            <FilterToolbar
              filters={chips}
              onRemove={(id) => change({ [id]: null })}
              onClearAll={() => change({ category: null, kind: null })}
            />
          )}
        </div>

        <section
          aria-label="Expenses"
          className="overflow-hidden rounded-(--radius-surface) border bg-card"
        >
          <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
            <span className="text-sm text-text-secondary">
              {dates.from === dates.to
                ? longDate(dates.from)
                : `${longDate(dates.from)} to ${longDate(dates.to)}`}
            </span>
            {list.data ? (
              <span className="font-mono text-lg">{cedis(total)}</span>
            ) : (
              <Skeleton className="h-6 w-24" />
            )}
          </div>
          {list.isPending && (
            <ul className="flex flex-col divide-y" aria-busy="true">
              {[0, 1, 2].map((row) => (
                <li key={row} className="flex items-center justify-between gap-4 px-5 py-4">
                  <span className="flex flex-col gap-2">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3.5 w-52" />
                  </span>
                  <Skeleton className="h-4 w-16" />
                </li>
              ))}
            </ul>
          )}
          {list.isError && (
            <div className="p-5">
              <Alert tone="danger" title="Couldn’t load the expenses">
                {list.error.message}
              </Alert>
            </div>
          )}
          {list.data && shown.length === 0 && (
            <EmptyState
              icon={<Wallet size={24} strokeWidth={1.75} />}
              title={chips.length ? 'Nothing like that' : 'Nothing spent'}
              description={
                chips.length
                  ? 'No expenses of that kind on these days. Clear the filter to see them all.'
                  : 'No money went out on these days.'
              }
            />
          )}
          {shown.length > 0 && (
            <ul className="flex flex-col divide-y">
              {shown.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && <AddExpense onClose={() => setAdding(false)} />}
      </Dialog>
    </Page>
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  const [confirming, setConfirming] = useState(false);
  const removing = useMutation({
    mutationFn: () => removeExpense(expense.id),
    meta: { ok: 'Expense removed' },
    onSuccess: refreshMoneyOut,
  });
  const detail = [
    longDate(expense.spentOn),
    expense.by,
    expense.purchase
      ? `${expense.purchase.quantity} ${expense.purchase.unit} ${expense.purchase.name}`
      : null,
    expense.supplierName,
    expense.note,
  ].filter(Boolean);

  return (
    <li className="flex items-start gap-4 px-5 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{EXPENSE_WORDS[expense.category]}</span>
          <Badge size="sm">{METHOD_OUT_WORDS[expense.method]}</Badge>
        </span>
        <span className="truncate text-xs text-muted-foreground">{detail.join(', ')}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-sm">{cedis(expense.amount)}</span>
        {!expense.fromDrawer && (
          // Two presses: the first asks, the second removes it.
          <Button
            variant={confirming ? 'danger' : 'ghost'}
            size="sm"
            loading={removing.isPending}
            onClick={() => (confirming ? removing.mutate() : setConfirming(true))}
            onBlur={() => setConfirming(false)}
          >
            {confirming ? (expense.purchase ? 'Remove, and its stock' : 'Yes, remove') : 'Remove'}
          </Button>
        )}
      </div>
    </li>
  );
}

const METHODS: { value: ManualMethod; label: string }[] = [
  { value: 'OWNER_CASH', label: 'Owner’s cash' },
  { value: 'MOMO', label: 'Mobile money' },
  { value: 'BANK', label: 'Bank' },
  { value: 'OTHER', label: 'Other' },
];

/** Radix's select can't hold an empty value, so "no ingredient yet" has a name of its own. */
const NO_INGREDIENT = '__none__';

function AddExpense({ onClose }: { onClose: () => void }) {
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
    meta: { ok: 'Expense added' },
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
    <DialogContent
      title="Add expense"
      description="Cash paid out of a tablet’s drawer is a payout: record it from the open drawers on Home."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <MoneyField label="Amount" value={text} onChange={setText} />
          <DateField
            label="Day"
            className="w-full"
            date={spentOn}
            max={todayHere()}
            onPick={setSpentOn}
          />
        </div>
        <Select
          label="What for"
          value={category}
          onValueChange={(value) => setCategory(value as ExpenseCategory)}
          options={EXPENSE_CATEGORIES.map((value) => ({ value, label: EXPENSE_WORDS[value] }))}
        />
        <RadioGroup
          label="How it was paid"
          options={METHODS}
          value={method}
          onValueChange={(value) => setMethod(value as ManualMethod)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Paid to"
            description="Optional."
            maxLength={80}
            value={supplier}
            onChange={(event) => setSupplier(event.target.value)}
          />
          <Input
            label="Note"
            description="Optional."
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {canStock && (
          <div className="flex flex-col gap-3 rounded-(--radius-panel) border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium" id="stock-purchase">
                  It’s a stock purchase
                </p>
                <p className="text-xs text-muted-foreground">
                  Adds what was bought to an ingredient’s stock.
                </p>
              </div>
              <Switch
                aria-labelledby="stock-purchase"
                checked={isPurchase}
                onCheckedChange={setIsPurchase}
              />
            </div>
            {isPurchase && (
              <div className="grid grid-cols-[1fr_7rem] items-end gap-3">
                <Select
                  label="Ingredient"
                  value={stockItemId || NO_INGREDIENT}
                  onValueChange={(value) => setStockItemId(value === NO_INGREDIENT ? '' : value)}
                  options={[
                    {
                      value: NO_INGREDIENT,
                      label:
                        stock.data?.length === 0
                          ? 'Add ingredients on the Stock page'
                          : 'Which ingredient',
                      disabled: true,
                    },
                    ...(stock.data ?? []).map((item) => ({
                      value: item.id,
                      label: `${item.name} (${item.unit})`,
                    })),
                  ]}
                />
                <PlainField
                  label="How many"
                  inputMode="numeric"
                  value={quantityText}
                  onChange={(value) => setQuantityText(value.replace(/\D/g, ''))}
                />
              </div>
            )}
          </div>
        )}
        {saving.error && (
          <Alert tone="danger" title="Couldn’t add the expense">
            {saving.error.message}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!!problem} loading={saving.isPending}>
            Add {amount ? cedis(amount) : 'expense'}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
