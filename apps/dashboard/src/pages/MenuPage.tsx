import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  STATION_WORDS,
  fetchMenu,
  marginOf,
  marginTone,
  refreshMenu,
  setSoldOut,
  type MenuItem,
} from '../lib/menu';
import { cedis } from '../lib/money';
import { useSession } from '../lib/session';
import { useMe } from '../shell/Shell';
import { Badge, ErrorNote, Spinner, cx } from '../ui/controls';
import { Page } from '../ui/Page';

const ALL = 'all';
const NONE = 'none';

export function MenuPage() {
  const me = useMe();
  const { tenantId } = useSession();
  const seesMoney = me.capabilities.includes('reports.revenue.view');
  const menu = useQuery({ queryKey: ['menu', tenantId], queryFn: fetchMenu });
  const [category, setCategory] = useState(ALL);

  if (menu.isPending) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (menu.isError) {
    return (
      <Page title="Menu">
        <ErrorNote>{menu.error.message}</ErrorNote>
      </Page>
    );
  }

  const { items, categories } = menu.data;
  if (items.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-tile text-4xl">
          🍽️
        </div>
        <h2 className="mb-2 text-xl font-bold">No menu items yet</h2>
        <p className="mb-8 text-sm text-muted">
          Add your first item to start taking orders on the tablet.
        </p>
        <Link
          to="/menu/items/new"
          className="inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-brand-fg"
        >
          Add your first item
        </Link>
      </div>
    );
  }

  const uncategorised = items.filter((item) => item.categoryId === null);
  const pills = [
    { id: ALL, name: 'All', count: items.length },
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      count: items.filter((item) => item.categoryId === c.id).length,
    })),
    ...(uncategorised.length
      ? [{ id: NONE, name: 'No category', count: uncategorised.length }]
      : []),
  ];
  const shown =
    category === ALL ? items : items.filter((item) => (item.categoryId ?? NONE) === category);

  return (
    <Page
      title="Menu"
      actions={
        <Link
          to={
            category === ALL || category === NONE
              ? '/menu/items/new'
              : `/menu/items/new?category=${category}`
          }
          className="inline-flex h-9 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-fg"
        >
          + Add item
        </Link>
      }
    >
      <div className="no-scrollbar mb-6 flex gap-1 overflow-x-auto rounded-xl bg-tile p-1">
        {pills.map((pill) => (
          <button
            key={pill.id}
            type="button"
            aria-pressed={category === pill.id}
            onClick={() => setCategory(pill.id)}
            className={cx(
              'h-8 shrink-0 rounded-lg px-4 text-sm font-medium transition-all',
              category === pill.id ? 'bg-surface text-text shadow-sm' : 'text-muted',
            )}
          >
            {pill.name}
            <span className="ml-1.5 text-xs text-muted">{pill.count}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {shown.map((item) => (
          <ItemCard key={item.id} item={item} seesMoney={seesMoney} />
        ))}
      </div>
    </Page>
  );
}

function ItemCard({ item, seesMoney }: { item: MenuItem; seesMoney: boolean }) {
  const soldOut = useMutation({
    mutationFn: () => setSoldOut(item.id, !item.soldOutToday),
    onSuccess: () => refreshMenu(),
  });
  const margin = marginOf(item.price, item.costPrice);

  return (
    <div
      className={cx(
        'flex items-start gap-3 rounded-xl border border-border p-4',
        item.soldOutToday ? 'bg-tile opacity-70' : 'bg-surface',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-2">
          <p className="text-sm font-semibold">{item.name}</p>
          {item.soldOutToday && <Badge tone="amber">Sold out today</Badge>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {item.variants.length > 0 ? (
            item.variants.map((variant) => (
              <span key={variant.id} className="font-mono">
                {variant.name} {cedis(variant.price)}
              </span>
            ))
          ) : (
            <span className="font-mono">{cedis(item.price)}</span>
          )}
          {item.prepMinutes !== null && <span>· ⏱ {item.prepMinutes}m</span>}
          <span>· {STATION_WORDS[item.station]}</span>
          {item.groups.length > 0 && (
            <span>
              · {item.groups.length} extra{item.groups.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {seesMoney && item.costPrice !== null && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted">Cost {cedis(item.costPrice)}</span>
            {margin !== null && <Badge tone={marginTone(margin)}>{margin}% margin</Badge>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Link
          to={`/menu/items/${item.id}`}
          className="rounded-lg bg-tile px-3 py-1.5 text-xs font-semibold"
        >
          Edit
        </Link>
        <button
          type="button"
          disabled={soldOut.isPending}
          onClick={() => soldOut.mutate()}
          className={cx('text-xs font-medium', item.soldOutToday ? 'text-green' : 'text-amber')}
        >
          {item.soldOutToday ? 'Back in stock' : 'Sold out'}
        </button>
      </div>
    </div>
  );
}
