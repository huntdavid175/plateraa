import { useMutation, useQuery } from '@tanstack/react-query';
import { Package, Plus } from 'lucide-react';
import { useState } from 'react';
import { ulid } from 'ulid';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { ConfirmMorph } from '@/components/arc/confirm-morph/confirm-morph';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { Input } from '@/components/arc/input/input';
import { Bento, Tile } from '@/components/app/bento';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
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
import { Page } from '../ui/Page';

const wholeNumber = (text: string) => (/^\d{1,6}$/.test(text.trim()) ? Number(text) : null);

type Open =
  { kind: 'add' } | { kind: 'edit'; item: StockItem } | { kind: 'count'; item: StockItem };

/**
 * Key ingredients: bags of rice, crates of eggs, gas. Purchases add to them; a count sets what's
 * really there and records the difference, so what went missing shows up.
 */
export function StockPage() {
  const { tenantId } = useSession();
  const stock = useQuery({ queryKey: ['stock', tenantId], queryFn: fetchStock });
  const [open, setOpen] = useState<Open | null>(null);
  const low = stock.data?.filter((item) => item.low) ?? [];
  const close = () => setOpen(null);

  return (
    <Page
      title="Stock"
      subtitle="Key ingredients. Daily portion counts are on the tablet’s Stock tab."
      actions={
        <Button onClick={() => setOpen({ kind: 'add' })}>
          <Plus size={16} strokeWidth={1.75} aria-hidden />
          Add ingredient
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {low.length > 0 && (
          <Alert tone="warning" title="Running low">
            {low.map((item) => item.name).join(', ')}
          </Alert>
        )}
        {stock.isError && (
          <Alert tone="danger" title="Couldn’t load your stock">
            {stock.error.message}
          </Alert>
        )}
        {stock.data?.length === 0 && (
          <div className="rounded-(--radius-surface) border bg-card">
            <EmptyState
              icon={<Package size={24} strokeWidth={1.75} />}
              title="No ingredients yet"
              description="Add the ones you buy often, like rice, oil or gas."
            />
          </div>
        )}
        <Bento>
          {stock.isPending &&
            [0, 1, 2, 3].map((tile) => (
              <Skeleton key={tile} className="h-44 rounded-(--radius-surface)" />
            ))}
          {stock.data?.map((item) => (
            <Tile key={item.id} title={item.name} tone={item.low ? 'warning' : undefined}>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-4xl leading-none tracking-[-0.03em] tabular-nums">
                  {item.onHand}
                </span>
                <span className="text-sm text-muted-foreground">{item.unit}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {item.low ? (
                  <Badge tone="warning" size="sm">
                    Running low
                  </Badge>
                ) : (
                  <Badge tone="success" size="sm">
                    Enough
                  </Badge>
                )}
                {item.lowThreshold !== null && (
                  <span className="text-xs text-muted-foreground">Low at {item.lowThreshold}</span>
                )}
              </div>
              <div className="mt-auto flex gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setOpen({ kind: 'count', item })}
                >
                  Count
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpen({ kind: 'edit', item })}>
                  Edit
                </Button>
              </div>
            </Tile>
          ))}
        </Bento>
        <p className="text-sm text-muted-foreground">
          Purchases on the Expenses page add to these. A count sets what’s really there and records
          the difference.
        </p>
      </div>

      <Dialog open={open !== null} onOpenChange={(next) => !next && close()}>
        {open?.kind === 'add' && <ItemForm onClose={close} />}
        {open?.kind === 'edit' && <ItemForm item={open.item} onClose={close} />}
        {open?.kind === 'count' && <CountForm item={open.item} onClose={close} />}
      </Dialog>
    </Page>
  );
}

function ItemForm({ item, onClose }: { item?: StockItem; onClose: () => void }) {
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
  const error = saving.error ?? removing.error;

  return (
    <DialogContent
      title={item ? `Edit ${item.name}` : 'Add ingredient'}
      description={item ? undefined : 'Something you buy often and want to keep an eye on.'}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Input
            label="Name"
            autoFocus
            maxLength={60}
            placeholder="For example: Rice"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label="Counted in"
            maxLength={20}
            placeholder="bag"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Low at"
            description="Optional. Warns when it gets this low."
            inputMode="numeric"
            value={lowText}
            onChange={(event) => setLowText(event.target.value)}
          />
          {!item && (
            <Input
              label="How many now"
              inputMode="numeric"
              placeholder="0"
              value={onHandText}
              onChange={(event) => setOnHandText(event.target.value)}
            />
          )}
        </div>
        {error && (
          <Alert tone="danger" title="Couldn’t save">
            {error.message}
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {item ? (
            <ConfirmMorph
              label="Remove"
              prompt={`Stop tracking ${item.name}?`}
              confirmLabel="Remove"
              pendingLabel="Removing"
              doneLabel="Removed"
              onConfirm={() => removing.mutateAsync()}
            />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!!problem} loading={saving.isPending}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}

function CountForm({ item, onClose }: { item: StockItem; onClose: () => void }) {
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
    <DialogContent
      title={`Count ${item.name}`}
      description={`Brixx expects ${item.onHand} ${item.unit}. Count what’s really there.`}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (counted !== null) saving.mutate();
        }}
      >
        <Input
          label={`Counted, in ${item.unit}`}
          inputMode="numeric"
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {difference !== null && difference !== 0 && (
          <p className={cn('text-sm', difference < 0 ? 'text-danger' : 'text-success')}>
            {difference < 0
              ? `${-difference} ${item.unit} fewer than expected.`
              : `${difference} ${item.unit} more than expected.`}
          </p>
        )}
        {saving.error && (
          <Alert tone="danger" title="Couldn’t save the count">
            {saving.error.message}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={counted === null} loading={saving.isPending}>
            Save count
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
