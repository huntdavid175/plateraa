import type { Station } from '@plateraa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ulid } from 'ulid';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Checkbox } from '@/components/arc/checkbox/checkbox';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Input } from '@/components/arc/input/input';
import { Select } from '@/components/arc/select/select';
import { Switch } from '@/components/arc/switch/switch';
import { MoneyField, PlainField } from '@/components/app/money-field';
import { Panel } from '@/components/app/panel';
import { Skeleton } from '@/components/ui/skeleton';
import {
  STATION_WORDS,
  addCategory,
  fetchMenu,
  marginOf,
  marginTone,
  refreshMenu,
  removeItem,
  saveItem,
  setSoldOut,
  type ItemInput,
  type Menu,
  type MenuItem,
} from '../lib/menu';
import { amountText, parseAmount } from '../lib/money';
import { PHOTO_SIZES, itemPhotoPath } from '../lib/photos';
import { useSession } from '../lib/session';
import { useMe } from '../shell/Shell';
import { PhotoPicker } from '../ui/PhotoPicker';

const NEW_CATEGORY = '__new__';

interface SizeForm {
  id: string;
  name: string;
  price: string;
  cost: string;
  bolt: string;
  chowdeck: string;
}

interface OptionForm {
  id: string;
  name: string;
  price: string;
}

interface GroupForm {
  id: string;
  name: string;
  required: boolean;
  maxSelect: string;
  options: OptionForm[];
  sharedWith: string[];
}

interface ItemForm {
  name: string;
  categoryId: string;
  newCategory: string;
  station: Station;
  price: string;
  prep: string;
  cost: string;
  bolt: string;
  chowdeck: string;
  soldOut: boolean;
  sizes: SizeForm[];
  groups: GroupForm[];
}

const money = (amount: number | null | undefined) =>
  amount === null || amount === undefined ? '' : amountText(amount);

function formOf(item: MenuItem | undefined, categoryId: string): ItemForm {
  return {
    name: item?.name ?? '',
    categoryId: item ? (item.categoryId ?? '') : categoryId,
    newCategory: '',
    station: item?.station ?? 'KITCHEN',
    price: money(item?.price),
    prep: item?.prepMinutes === null || item === undefined ? '' : String(item.prepMinutes),
    cost: money(item?.costPrice),
    bolt: money(item?.channelPrices.BOLT_FOOD),
    chowdeck: money(item?.channelPrices.CHOWDECK),
    soldOut: item?.soldOutToday ?? false,
    sizes: (item?.variants ?? []).map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: money(variant.price),
      cost: money(variant.costPrice),
      bolt: money(variant.channelPrices.BOLT_FOOD),
      chowdeck: money(variant.channelPrices.CHOWDECK),
    })),
    groups: (item?.groups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      required: group.required,
      maxSelect: String(group.maxSelect),
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        price: money(option.priceDelta),
      })),
      sharedWith: group.sharedWith,
    })),
  };
}

/** Blank is fine (null); anything else has to be an amount. */
function optionalAmount(text: string): number | null | 'bad' {
  if (text.trim() === '') return null;
  return parseAmount(text) ?? 'bad';
}

/** Turns the form into what the server takes, or the first thing that needs fixing. */
function toInput(
  form: ItemForm,
  categoryId: string | null,
  seesMoney: boolean,
): { input: ItemInput } | { problem: string } {
  if (!form.name.trim()) return { problem: 'Give the item a name.' };
  if (form.categoryId === NEW_CATEGORY && !form.newCategory.trim()) {
    return { problem: 'Name the new category.' };
  }
  const prep = form.prep.trim() === '' ? null : Number(form.prep);
  if (prep !== null && (!Number.isInteger(prep) || prep < 0 || prep > 240)) {
    return { problem: 'Prep time is in whole minutes, up to 240.' };
  }

  const sizes = [];
  for (const size of form.sizes) {
    const price = parseAmount(size.price);
    const cost = optionalAmount(size.cost);
    const bolt = optionalAmount(size.bolt);
    const chowdeck = optionalAmount(size.chowdeck);
    if (!size.name.trim()) return { problem: 'Every size needs a name, like Regular or Large.' };
    if (price === null) return { problem: `Give ${size.name.trim()} a price.` };
    if (cost === 'bad' || bolt === 'bad' || chowdeck === 'bad') {
      return { problem: `Check the prices on ${size.name.trim()}.` };
    }
    sizes.push({
      id: size.id,
      name: size.name.trim(),
      price,
      ...(seesMoney ? { costPrice: cost } : {}),
      channelPrices: { BOLT_FOOD: bolt, CHOWDECK: chowdeck },
    });
  }

  const price = sizes[0]?.price ?? parseAmount(form.price);
  if (price === null || price === undefined) return { problem: 'Give the item a price.' };
  const cost = optionalAmount(form.cost);
  const bolt = optionalAmount(form.bolt);
  const chowdeck = optionalAmount(form.chowdeck);
  if (cost === 'bad' || bolt === 'bad' || chowdeck === 'bad') {
    return { problem: 'Check the cost price.' };
  }

  const groups = [];
  for (const group of form.groups) {
    const label = group.name.trim() || 'an extras group';
    if (!group.name.trim()) return { problem: 'Every extras group needs a name.' };
    if (group.options.length === 0) return { problem: `Add at least one option to ${label}.` };
    const maxSelect = Number(group.maxSelect);
    if (!Number.isInteger(maxSelect) || maxSelect < 1 || maxSelect > 20) {
      return { problem: `"Pick up to" on ${label} is a whole number from 1 to 20.` };
    }
    const options = [];
    for (const option of group.options) {
      if (!option.name.trim()) return { problem: `Every option in ${label} needs a name.` };
      const delta = option.price.trim() === '' ? 0 : parseAmount(option.price);
      if (delta === null) return { problem: `Check the price of ${option.name.trim()}.` };
      options.push({ id: option.id, name: option.name.trim(), priceDelta: delta });
    }
    groups.push({
      id: group.id,
      name: group.name.trim(),
      required: group.required,
      maxSelect,
      options,
    });
  }

  return {
    input: {
      categoryId,
      name: form.name.trim(),
      price,
      ...(seesMoney && sizes.length === 0 ? { costPrice: cost } : {}),
      prepMinutes: prep,
      station: form.station,
      variants: sizes,
      groups,
      channelPrices: sizes.length ? {} : { BOLT_FOOD: bolt, CHOWDECK: chowdeck },
    },
  };
}

export function ItemEditorPage() {
  const { itemId } = useParams();
  const { tenantId } = useSession();
  const menu = useQuery({ queryKey: ['menu', tenantId], queryFn: fetchMenu });

  if (menu.isPending) {
    return (
      <EditorFrame title={itemId ? 'Edit item' : 'New item'}>
        <div className="flex flex-col gap-6" aria-busy="true">
          <Skeleton className="h-72 w-full rounded-(--radius-surface)" />
          <Skeleton className="h-32 w-full rounded-(--radius-surface)" />
        </div>
      </EditorFrame>
    );
  }
  if (menu.isError) {
    return (
      <EditorFrame title="Menu">
        <Alert tone="danger" title="Couldn’t load the menu">
          {menu.error.message}
        </Alert>
      </EditorFrame>
    );
  }
  const item = itemId ? menu.data.items.find((i) => i.id === itemId) : undefined;
  if (itemId && !item) {
    return (
      <EditorFrame title="Edit item">
        <Alert tone="warning" title="That item is no longer on the menu">
          Someone may have removed it. Go back to the menu to see what’s there now.
        </Alert>
      </EditorFrame>
    );
  }
  return <Editor key={itemId ?? 'new'} menu={menu.data} item={item} />;
}

/**
 * The editor covers the whole screen: a bar with Close, the title and the one main action, then
 * the form in a narrow column.
 */
function EditorFrame({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b bg-surface px-4 py-3">
        <Link
          to="/menu"
          aria-label="Close"
          className="flex size-10 items-center justify-center rounded-(--radius-control) text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X size={20} strokeWidth={1.75} aria-hidden />
        </Link>
        <h1 className="flex-1 font-medium">{title}</h1>
        {action}
      </div>
      <div className="page-scroll flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">{children}</div>
      </div>
    </div>
  );
}

const MARGIN_TONES = { green: 'success', amber: 'warning', red: 'danger' } as const;

function MarginBadge({ margin }: { margin: number }) {
  return (
    <Badge tone={MARGIN_TONES[marginTone(margin)]} size="sm">
      {margin}% margin
    </Badge>
  );
}

/** Radix's select can't hold an empty value, so "no category" has a name of its own. */
const NO_CATEGORY = '__none__';

function Editor({ menu, item }: { menu: Menu; item: MenuItem | undefined }) {
  const me = useMe();
  const seesMoney = me.capabilities.includes('reports.revenue.view');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [itemId] = useState(() => item?.id ?? ulid());
  const [newCategoryId] = useState(() => ulid());
  const [form, setForm] = useState(() =>
    formOf(item, params.get('category') ?? menu.categories[0]?.id ?? ''),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const update = (patch: Partial<ItemForm>) => setForm((current) => ({ ...current, ...patch }));
  const updateSize = (index: number, patch: Partial<SizeForm>) =>
    update({ sizes: form.sizes.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const updateGroup = (index: number, patch: Partial<GroupForm>) =>
    update({ groups: form.groups.map((g, i) => (i === index ? { ...g, ...patch } : g)) });
  const updateOption = (groupIndex: number, index: number, patch: Partial<OptionForm>) => {
    const group = form.groups[groupIndex]!;
    updateGroup(groupIndex, {
      options: group.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    });
  };

  const saving = useMutation({
    meta: { ok: 'Item saved' },
    mutationFn: async () => {
      let categoryId: string | null = form.categoryId || null;
      if (form.categoryId === NEW_CATEGORY) {
        categoryId = (await addCategory(newCategoryId, form.newCategory.trim())).id;
      }
      const result = toInput(form, categoryId, seesMoney);
      if ('problem' in result) throw new Error(result.problem);
      await saveItem(itemId, result.input);
      if (form.soldOut !== (item?.soldOutToday ?? false)) await setSoldOut(itemId, form.soldOut);
    },
    onSuccess: async () => {
      await refreshMenu();
      navigate('/menu');
    },
  });

  const removing = useMutation({
    mutationFn: () => removeItem(itemId),
    meta: { ok: 'Item removed' },
    onSuccess: async () => {
      await refreshMenu();
      navigate('/menu');
    },
  });

  const save = () => {
    const check = toInput(form, form.categoryId || null, seesMoney);
    if ('problem' in check) {
      setProblem(check.problem);
      return;
    }
    setProblem(null);
    saving.mutate();
  };

  const price = parseAmount(form.price);
  const cost = parseAmount(form.cost);
  const margin = price === null ? null : marginOf(price, cost);
  const trouble = problem ?? saving.error?.message;

  return (
    <EditorFrame
      title={item ? 'Edit item' : 'New item'}
      action={
        <Button loading={saving.isPending} onClick={save}>
          Save
        </Button>
      }
    >
      {trouble && (
        <Alert tone="danger" title="Not saved yet">
          {trouble}
        </Alert>
      )}

      <Panel title="The item">
        <div className="flex flex-col gap-4 border-t p-5">
          {item ? (
            <PhotoPicker
              path={itemPhotoPath(item.id)}
              url={item.photoUrl}
              longest={PHOTO_SIZES.item}
              label="Photo"
              hint="Shown on your online store. The food itself, in good light."
              onSaved={() => void refreshMenu()}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              You can add a photo once the item is saved.
            </p>
          )}
          <Input
            label="Name"
            value={form.name}
            placeholder="For example: Jollof rice"
            maxLength={80}
            onChange={(event) => update({ name: event.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Category"
              value={form.categoryId || NO_CATEGORY}
              onValueChange={(value) => update({ categoryId: value === NO_CATEGORY ? '' : value })}
              options={[
                { value: NO_CATEGORY, label: 'No category' },
                ...menu.categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
                { value: NEW_CATEGORY, label: 'New category…' },
              ]}
            />
            <Select
              label="Made at"
              value={form.station}
              onValueChange={(value) => update({ station: value as Station })}
              options={(Object.keys(STATION_WORDS) as Station[]).map((station) => ({
                value: station,
                label: STATION_WORDS[station],
              }))}
            />
          </div>
          {form.categoryId === NEW_CATEGORY && (
            <Input
              label="New category’s name"
              value={form.newCategory}
              placeholder="For example: Rice"
              maxLength={40}
              onChange={(event) => update({ newCategory: event.target.value })}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {form.sizes.length === 0 ? (
              <MoneyField
                label="Price"
                value={form.price}
                onChange={(value) => update({ price: value })}
              />
            ) : (
              <div className="grid content-start">
                <span className="mb-2 text-sm font-medium">Price</span>
                <span className="flex min-h-(--control-height-md) items-center text-sm text-muted-foreground">
                  Set for each size below
                </span>
              </div>
            )}
            <Input
              label="Prep time, in minutes"
              inputMode="numeric"
              value={form.prep}
              onChange={(event) => update({ prep: event.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-t px-5 py-4">
          <div>
            <p className="text-sm font-medium" id="sold-out">
              Sold out today
            </p>
            <p className="text-xs text-muted-foreground">Can’t be ordered until tomorrow.</p>
          </div>
          <Switch
            aria-labelledby="sold-out"
            checked={form.soldOut}
            onCheckedChange={(soldOut) => update({ soldOut })}
          />
        </div>
      </Panel>

      <Panel
        title="Sizes"
        description={
          form.sizes.length === 0
            ? 'No sizes: every order uses the one price.'
            : 'Each size has its own price.'
        }
      >
        <div className="flex flex-col gap-3 border-t p-5">
          {form.sizes.map((size, index) => (
            <div key={size.id} className="flex items-end gap-2">
              <PlainField
                label="Size"
                hideLabel={index > 0}
                className="flex-1"
                value={size.name}
                placeholder="For example: Regular"
                maxLength={40}
                onChange={(value) => updateSize(index, { name: value })}
              />
              <MoneyField
                label="Price"
                hideLabel={index > 0}
                className="w-32"
                value={size.price}
                onChange={(value) => updateSize(index, { price: value })}
              />
              <RemoveButton
                label={`Remove ${size.name || 'this size'}`}
                onClick={() => update({ sizes: form.sizes.filter((_, i) => i !== index) })}
              />
            </div>
          ))}
          <AddButton
            onClick={() =>
              update({
                sizes: [
                  ...form.sizes,
                  {
                    id: ulid(),
                    name: '',
                    price: form.sizes.length === 0 ? form.price : '',
                    cost: form.sizes.length === 0 ? form.cost : '',
                    bolt: form.sizes.length === 0 ? form.bolt : '',
                    chowdeck: form.sizes.length === 0 ? form.chowdeck : '',
                  },
                ],
              })
            }
          >
            Add a size
          </AddButton>
        </div>
      </Panel>

      <Panel
        title="Extras"
        description={
          form.groups.length === 0
            ? 'No extras yet. A group of extras is a choice the customer makes, like a protein.'
            : undefined
        }
      >
        <div className="flex flex-col gap-4 border-t p-5">
          {form.groups.map((group, groupIndex) => (
            <div
              key={group.id}
              className="flex flex-col gap-4 rounded-(--radius-panel) border bg-background p-4"
            >
              <div className="flex items-end gap-2">
                <PlainField
                  label="Group name"
                  className="flex-1"
                  value={group.name}
                  placeholder="For example: Choose your protein"
                  maxLength={60}
                  onChange={(value) => updateGroup(groupIndex, { name: value })}
                />
                <RemoveButton
                  label={`Remove ${group.name || 'this group'}`}
                  onClick={() => update({ groups: form.groups.filter((_, i) => i !== groupIndex) })}
                />
              </div>
              {group.sharedWith.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Also on {group.sharedWith.join(', ')}. Changes here change it there too.
                </p>
              )}
              <div className="flex flex-wrap items-end gap-6">
                <Checkbox
                  label="Required"
                  description="The customer has to pick one."
                  checked={group.required}
                  onCheckedChange={(checked) =>
                    updateGroup(groupIndex, { required: checked === true })
                  }
                />
                <PlainField
                  label="Pick up to"
                  className="w-24"
                  inputMode="numeric"
                  value={group.maxSelect}
                  onChange={(value) => updateGroup(groupIndex, { maxSelect: value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                {group.options.map((option, index) => (
                  <div key={option.id} className="flex items-end gap-2">
                    <PlainField
                      label="Option"
                      hideLabel={index > 0}
                      className="flex-1"
                      value={option.name}
                      placeholder="For example: Chicken"
                      maxLength={60}
                      onChange={(value) => updateOption(groupIndex, index, { name: value })}
                    />
                    <MoneyField
                      label="Adds"
                      hideLabel={index > 0}
                      prefix="+GH₵"
                      className="w-32"
                      value={option.price}
                      onChange={(value) => updateOption(groupIndex, index, { price: value })}
                    />
                    <RemoveButton
                      label={`Remove ${option.name || 'this option'}`}
                      onClick={() =>
                        updateGroup(groupIndex, {
                          options: group.options.filter((_, i) => i !== index),
                        })
                      }
                    />
                  </div>
                ))}
                <AddButton
                  onClick={() =>
                    updateGroup(groupIndex, {
                      options: [...group.options, { id: ulid(), name: '', price: '' }],
                    })
                  }
                >
                  Add an option
                </AddButton>
              </div>
            </div>
          ))}
          <AddButton
            onClick={() =>
              update({
                groups: [
                  ...form.groups,
                  {
                    id: ulid(),
                    name: '',
                    required: false,
                    maxSelect: '1',
                    options: [{ id: ulid(), name: '', price: '' }],
                    sharedWith: [],
                  },
                ],
              })
            }
          >
            Add a group of extras
          </AddButton>
        </div>
      </Panel>

      {/* Bolt Food and Chowdeck prices are kept but not shown until their APIs connect. */}
      {seesMoney && (
        <Panel title="Cost and margin" description="Only people who see sales totals see this.">
          <div className="flex flex-col gap-4 border-t p-5">
            {form.sizes.length === 0 ? (
              <div className="flex items-end gap-3">
                <MoneyField
                  label="What it costs you to make"
                  className="flex-1"
                  value={form.cost}
                  onChange={(value) => update({ cost: value })}
                />
                {margin !== null && (
                  <span className="flex min-h-(--control-height-md) items-center">
                    <MarginBadge margin={margin} />
                  </span>
                )}
              </div>
            ) : (
              form.sizes.map((size, index) => {
                const sizePrice = parseAmount(size.price);
                const sizeMargin =
                  sizePrice === null ? null : marginOf(sizePrice, parseAmount(size.cost));
                return (
                  <div key={size.id} className="flex items-end gap-3">
                    <MoneyField
                      label={`${size.name || 'This size'}: what it costs to make`}
                      className="flex-1"
                      value={size.cost}
                      onChange={(value) => updateSize(index, { cost: value })}
                    />
                    {sizeMargin !== null && (
                      <span className="flex min-h-(--control-height-md) items-center">
                        <MarginBadge margin={sizeMargin} />
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Panel>
      )}

      {item && (
        <div className="flex flex-col items-start gap-3 pb-8">
          <Button variant="danger" onClick={() => setConfirmRemove(true)}>
            Remove from menu
          </Button>
        </div>
      )}

      {item && (
        <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <DialogContent
            title={`Take ${item.name} off the menu?`}
            description="It can’t be ordered any more. Past orders keep it."
          >
            <div className="flex flex-col gap-4">
              {removing.error && (
                <Alert tone="danger" title="Couldn’t remove it">
                  {removing.error.message}
                </Alert>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
                  Keep it
                </Button>
                <Button
                  variant="danger"
                  loading={removing.isPending}
                  onClick={() => removing.mutate()}
                >
                  Remove from menu
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </EditorFrame>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" aria-label={label} onClick={onClick}>
      <X size={18} strokeWidth={1.75} aria-hidden />
    </Button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="secondary" size="sm" className="self-start" onClick={onClick}>
      <Plus size={16} strokeWidth={1.75} aria-hidden />
      {children}
    </Button>
  );
}
