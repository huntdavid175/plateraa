import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ulid } from 'ulid';
import {
  addStockItem,
  countStock,
  fetchStock,
  refreshMoneyOut,
  removeStockItem,
  updateStockItem,
  type StockItem,
} from '../lib/expenses';
import { useSession } from '../lib/session';
import { Badge, Button, Card, ErrorNote, FieldLabel, Spinner, TextInput } from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { Page } from '../ui/Page';

const wholeNumber = (text: string) => (/^\d{1,6}$/.test(text.trim()) ? Number(text) : null);

/**
 * Key ingredients: bags of rice, crates of eggs, gas. Purchases add to them; a count sets what's
 * really there and records the difference, so what went missing shows up.
 */
export function StockPage() {
  const { tenantId } = useSession();
  const stock = useQuery({ queryKey: ['stock', tenantId], queryFn: fetchStock });
  const [dialog, setDialog] = useState<
    { kind: 'add' } | { kind: 'edit'; item: StockItem } | { kind: 'count'; item: StockItem } | null
  >(null);
  const low = stock.data?.filter((item) => item.low) ?? [];

  return (
    <Page
      title="Stock"
      subtitle="Key ingredients. Daily portion counts are on the tablet’s Stock tab."
      narrow
      actions={
        <Button small onClick={() => setDialog({ kind: 'add' })}>
          + Add ingredient
        </Button>
      }
    >
      {low.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber/25 bg-amber-bg px-5 py-4 text-sm text-amber">
          <p className="font-semibold">Running low</p>
          <p className="mt-0.5 text-xs">{low.map((item) => item.name).join(', ')}</p>
        </div>
      )}
      <Card className="overflow-hidden">
        {stock.isPending && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {stock.isError && (
          <div className="p-4">
            <ErrorNote>{stock.error.message}</ErrorNote>
          </div>
        )}
        {stock.data?.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No ingredients yet. Add the ones you buy often, like rice, oil or gas.
          </p>
        )}
        {stock.data?.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{item.name}</p>
                {item.low && <Badge tone="amber">Running low</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-mono text-text">{item.onHand}</span> {item.unit}
                {item.lowThreshold !== null ? ` · low at ${item.lowThreshold}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" small onClick={() => setDialog({ kind: 'count', item })}>
                Count
              </Button>
              <Button variant="ghost" small onClick={() => setDialog({ kind: 'edit', item })}>
                Edit
              </Button>
            </div>
          </div>
        ))}
      </Card>
      {dialog?.kind === 'add' && <ItemDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && <ItemDialog item={dialog.item} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'count' && (
        <CountDialog item={dialog.item} onClose={() => setDialog(null)} />
      )}
    </Page>
  );
}

function ItemDialog({ item, onClose }: { item?: StockItem; onClose: () => void }) {
  const [id] = useState(() => item?.id ?? ulid());
  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [lowText, setLowText] = useState(item?.lowThreshold?.toString() ?? '');
  const [onHandText, setOnHandText] = useState('');
  const lowThreshold = lowText.trim() ? wholeNumber(lowText) : null;
  const onHand = onHandText.trim() ? wholeNumber(onHandText) : 0;
  const problem = !name.trim()
    ? 'Name it.'
    : !unit.trim()
      ? 'Say what it’s counted in, like bag or crate.'
      : lowText.trim() && lowThreshold === null
        ? 'The low mark is a whole number.'
        : onHand === null
          ? 'How many is a whole number.'
          : null;

  const saving = useMutation({
    meta: { ok: 'Stock item saved' },
    mutationFn: () =>
      item
        ? updateStockItem(item.id, { name: name.trim(), unit: unit.trim(), lowThreshold })
        : addStockItem({ id, name: name.trim(), unit: unit.trim(), lowThreshold, onHand: onHand! }),
    onSuccess: () => {
      refreshMoneyOut();
      onClose();
    },
  });
  const removing = useMutation({
    mutationFn: () => removeStockItem(item!.id),
    meta: { ok: 'Stock item removed' },
    onSuccess: () => {
      refreshMoneyOut();
      onClose();
    },
  });

  return (
    <Dialog title={item ? `Edit ${item.name}` : 'Add ingredient'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div>
            <FieldLabel htmlFor="stock-name">Name</FieldLabel>
            <TextInput
              id="stock-name"
              autoFocus
              maxLength={60}
              placeholder="e.g. Rice"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="stock-unit">Counted in</FieldLabel>
            <TextInput
              id="stock-unit"
              maxLength={20}
              placeholder="bag"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="stock-low">Low at (optional)</FieldLabel>
            <TextInput
              id="stock-low"
              inputMode="numeric"
              className="font-mono"
              value={lowText}
              onChange={(event) => setLowText(event.target.value)}
            />
          </div>
          {!item && (
            <div>
              <FieldLabel htmlFor="stock-now">How many now</FieldLabel>
              <TextInput
                id="stock-now"
                inputMode="numeric"
                className="font-mono"
                placeholder="0"
                value={onHandText}
                onChange={(event) => setOnHandText(event.target.value)}
              />
            </div>
          )}
        </div>
        {(saving.error ?? removing.error) && (
          <ErrorNote>{(saving.error ?? removing.error)!.message}</ErrorNote>
        )}
        <div className="mt-6 flex gap-2">
          {item ? (
            <Button
              variant="ghost"
              busy={removing.isPending}
              onClick={() => {
                if (window.confirm(`Stop tracking ${item.name}?`)) removing.mutate();
              }}
            >
              Remove
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button type="submit" full disabled={!!problem} busy={saving.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CountDialog({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const [movementId] = useState(() => ulid());
  const [text, setText] = useState('');
  const counted = wholeNumber(text);
  const saving = useMutation({
    mutationFn: () => countStock(item.id, { movementId, counted: counted! }),
    meta: { ok: 'Count saved' },
    onSuccess: () => {
      refreshMoneyOut();
      onClose();
    },
  });
  const difference = counted === null ? null : counted - item.onHand;

  return (
    <Dialog title={`Count ${item.name}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (counted !== null) saving.mutate();
        }}
      >
        <p className="text-sm text-muted-foreground">
          Plateraa expects {item.onHand} {item.unit}. Count what’s really there.
        </p>
        <div>
          <FieldLabel htmlFor="stock-count">Counted ({item.unit})</FieldLabel>
          <TextInput
            id="stock-count"
            inputMode="numeric"
            autoFocus
            className="font-mono"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        {difference !== null && difference !== 0 && (
          <p className={difference < 0 ? 'text-sm text-red' : 'text-sm text-green'}>
            {difference < 0
              ? `${-difference} ${item.unit} fewer than expected.`
              : `${difference} ${item.unit} more than expected.`}
          </p>
        )}
        {saving.error && <ErrorNote>{saving.error.message}</ErrorNote>}
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" full disabled={counted === null} busy={saving.isPending}>
            Save count
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
