import type { Station } from '@plateraa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ulid } from 'ulid';
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
import {
  Badge,
  Button,
  ErrorNote,
  FieldLabel,
  Section,
  Spinner,
  TextInput,
  Toggle,
  cx,
} from '../ui/controls';

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
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (menu.isError) {
    return (
      <div className="p-6">
        <ErrorNote>{menu.error.message}</ErrorNote>
      </div>
    );
  }
  const item = itemId ? menu.data.items.find((i) => i.id === itemId) : undefined;
  if (itemId && !item) {
    return (
      <div className="p-6">
        <ErrorNote>That item is no longer on the menu.</ErrorNote>
      </div>
    );
  }
  return <Editor key={itemId ?? 'new'} menu={menu.data} item={item} />;
}

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-4">
        <Link
          to="/menu"
          aria-label="Close"
          className="px-1 text-2xl leading-none text-muted-foreground"
        >
          ×
        </Link>
        <h2 className="flex-1 font-semibold">{item ? 'Edit item' : 'New item'}</h2>
        <Button small busy={saving.isPending} onClick={save}>
          Save
        </Button>
      </div>

      <div className="page-scroll flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-5">
          {(problem ?? saving.error?.message) && (
            <ErrorNote>{problem ?? saving.error?.message}</ErrorNote>
          )}

          <Section title="Basic info">
            <div className="space-y-4 p-4">
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
                <p className="text-xs text-muted-foreground">
                  You can add a photo once the item is saved.
                </p>
              )}
              <div>
                <FieldLabel htmlFor="item-name">Item name</FieldLabel>
                <TextInput
                  id="item-name"
                  value={form.name}
                  placeholder="e.g. Jollof rice"
                  maxLength={80}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="item-category">Category</FieldLabel>
                  <Select
                    id="item-category"
                    value={form.categoryId}
                    onChange={(value) => update({ categoryId: value })}
                  >
                    <option value="">No category</option>
                    {menu.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                    <option value={NEW_CATEGORY}>New category…</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="item-station">Station</FieldLabel>
                  <Select
                    id="item-station"
                    value={form.station}
                    onChange={(value) => update({ station: value as Station })}
                  >
                    {(Object.keys(STATION_WORDS) as Station[]).map((station) => (
                      <option key={station} value={station}>
                        {STATION_WORDS[station]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              {form.categoryId === NEW_CATEGORY && (
                <div>
                  <FieldLabel htmlFor="new-category">New category name</FieldLabel>
                  <TextInput
                    id="new-category"
                    value={form.newCategory}
                    placeholder="e.g. Rice"
                    maxLength={40}
                    onChange={(event) => update({ newCategory: event.target.value })}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {form.sizes.length === 0 ? (
                  <MoneyInput
                    id="item-price"
                    label="Price"
                    value={form.price}
                    onChange={(value) => update({ price: value })}
                  />
                ) : (
                  <div>
                    <FieldLabel>Price</FieldLabel>
                    <p className="flex h-11 items-center text-sm text-muted-foreground">
                      Set for each size below
                    </p>
                  </div>
                )}
                <div>
                  <FieldLabel htmlFor="item-prep">Prep time (min)</FieldLabel>
                  <TextInput
                    id="item-prep"
                    inputMode="numeric"
                    className="font-mono"
                    value={form.prep}
                    onChange={(event) => update({ prep: event.target.value })}
                  />
                </div>
              </div>
              <div
                className={cx(
                  'flex items-center justify-between rounded-xl px-4 py-2',
                  form.soldOut ? 'bg-amber-bg' : 'bg-tile',
                )}
              >
                <div>
                  <p className={cx('text-sm font-medium', form.soldOut && 'text-amber')}>
                    Sold out today
                  </p>
                  <p className="text-xs text-muted-foreground">Can’t be ordered until tomorrow</p>
                </div>
                <Toggle
                  on={form.soldOut}
                  onChange={(soldOut) => update({ soldOut })}
                  label="Sold out today"
                />
              </div>
            </div>
          </Section>

          <Section title={`Sizes${form.sizes.length ? ` (${form.sizes.length})` : ''}`}>
            <div className="space-y-3 p-4">
              {form.sizes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No sizes: every order uses the one price.
                </p>
              )}
              {form.sizes.map((size, index) => (
                <div key={size.id} className="flex items-center gap-2">
                  <input
                    aria-label="Size name"
                    value={size.name}
                    placeholder="e.g. Regular"
                    maxLength={40}
                    onChange={(event) => updateSize(index, { name: event.target.value })}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand"
                  />
                  <SmallMoney
                    label={`${size.name || 'Size'} price`}
                    prefix="GH₵"
                    value={size.price}
                    onChange={(value) => updateSize(index, { price: value })}
                  />
                  <RemoveButton
                    label="Remove size"
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
                + Add size
              </AddButton>
            </div>
          </Section>

          <Section title={`Extras groups${form.groups.length ? ` (${form.groups.length})` : ''}`}>
            <div className="space-y-5 p-4">
              {form.groups.length === 0 && (
                <p className="text-sm text-muted-foreground">No extras yet.</p>
              )}
              {form.groups.map((group, groupIndex) => (
                <div key={group.id} className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-start gap-2">
                    <input
                      aria-label="Group name"
                      value={group.name}
                      placeholder="e.g. Choose your protein"
                      maxLength={60}
                      onChange={(event) => updateGroup(groupIndex, { name: event.target.value })}
                      className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm font-medium outline-none focus:border-brand"
                    />
                    <RemoveButton
                      label="Remove extras group"
                      onClick={() =>
                        update({ groups: form.groups.filter((_, i) => i !== groupIndex) })
                      }
                    />
                  </div>
                  {group.sharedWith.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Also on {group.sharedWith.join(', ')}. Changes here change it there too.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={group.required}
                        onChange={(event) =>
                          updateGroup(groupIndex, { required: event.target.checked })
                        }
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      Pick up to
                      <input
                        inputMode="numeric"
                        value={group.maxSelect}
                        onChange={(event) =>
                          updateGroup(groupIndex, { maxSelect: event.target.value })
                        }
                        className="h-8 w-14 rounded-lg border border-border bg-surface px-2 text-center font-mono text-sm text-text outline-none focus:border-brand"
                      />
                    </label>
                  </div>
                  <div className="space-y-2">
                    {group.options.map((option, index) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <input
                          aria-label="Option name"
                          value={option.name}
                          placeholder="Option name"
                          maxLength={60}
                          onChange={(event) =>
                            updateOption(groupIndex, index, { name: event.target.value })
                          }
                          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand"
                        />
                        <SmallMoney
                          label={`${option.name || 'Option'} extra price`}
                          prefix="+₵"
                          value={option.price}
                          onChange={(value) => updateOption(groupIndex, index, { price: value })}
                        />
                        <RemoveButton
                          label="Remove option"
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
                      + Add option
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
                + Add extras group
              </AddButton>
            </div>
          </Section>

          {/* Bolt Food and Chowdeck prices are kept but not shown until their APIs connect. */}
          {seesMoney && (
            <Section title="Cost and margin">
              <div className="space-y-4 p-4">
                {form.sizes.length === 0 ? (
                  <div>
                    <FieldLabel htmlFor="item-cost">Cost price (only you can see this)</FieldLabel>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <MoneyInput
                          id="item-cost"
                          value={form.cost}
                          onChange={(value) => update({ cost: value })}
                        />
                      </div>
                      {margin !== null && <Badge tone={marginTone(margin)}>{margin}% margin</Badge>}
                    </div>
                  </div>
                ) : (
                  <SizeCosts
                    sizes={form.sizes}
                    onChange={(index, patch) => updateSize(index, patch)}
                  />
                )}
              </div>
            </Section>
          )}

          {item && (
            <div className="pb-8">
              <Button
                variant="ghost"
                full
                busy={removing.isPending}
                onClick={() => {
                  if (window.confirm(`Take ${item.name} off the menu? Past orders keep it.`)) {
                    removing.mutate();
                  }
                }}
              >
                Remove from menu
              </Button>
              {removing.error && (
                <div className="mt-3">
                  <ErrorNote>{removing.error.message}</ErrorNote>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** What each size costs to make, with its margin. */
function SizeCosts({
  sizes,
  onChange,
}: {
  sizes: SizeForm[];
  onChange: (index: number, patch: Partial<SizeForm>) => void;
}) {
  return (
    <div className="space-y-3">
      {sizes.map((size, index) => {
        const sizePrice = parseAmount(size.price);
        const margin = sizePrice === null ? null : marginOf(sizePrice, parseAmount(size.cost));
        return (
          <div key={size.id} className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{size.name || 'Size'}</p>
              {margin !== null && <Badge tone={marginTone(margin)}>{margin}% margin</Badge>}
            </div>
            <MoneyInput
              id={`cost-${size.id}`}
              label="Cost"
              value={size.cost}
              onChange={(value) => onChange(index, { cost: value })}
            />
          </div>
        );
      })}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text outline-none focus:border-brand"
    >
      {children}
    </select>
  );
}

function MoneyInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <div className="flex h-11 items-center gap-1 rounded-xl border border-border bg-surface px-3 focus-within:border-brand">
        <span className="shrink-0 font-mono text-xs text-muted-foreground">GH₵</span>
        <input
          id={id}
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  );
}

function SmallMoney({
  label,
  prefix,
  value,
  onChange,
}: {
  label: string;
  prefix: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex h-10 w-28 shrink-0 items-center gap-1 rounded-lg border border-border bg-surface px-3 focus-within:border-brand">
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{prefix}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 bg-transparent font-mono text-sm outline-none"
      />
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-bg text-lg text-red"
    >
      ×
    </button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center gap-2 text-sm font-medium text-brand"
    >
      {children}
    </button>
  );
}
