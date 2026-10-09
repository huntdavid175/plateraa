import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, ImageOff, Plus, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  STATION_WORDS,
  fetchMenu,
  marginOf,
  marginTone,
  refreshMenu,
  setSoldOut,
  type Menu,
  type MenuItem,
} from '../lib/menu';
import { cedis } from '../lib/money';
import { saveInPlace } from '../lib/save-in-place';
import { useSession } from '../lib/session';
import { useMe } from '../shell/Shell';
import { Page } from '../ui/Page';

const ALL = 'all';
const NONE = 'none';
const MARGIN_TONES = { green: 'success', amber: 'warning', red: 'danger' } as const;

export function MenuPage() {
  const me = useMe();
  const { tenantId } = useSession();
  const navigate = useNavigate();
  const seesMoney = me.capabilities.includes('reports.revenue.view');
  const menu = useQuery({ queryKey: ['menu', tenantId], queryFn: fetchMenu });
  const [category, setCategory] = useState(ALL);

  const addItem = (
    <Button
      onClick={() =>
        navigate(
          category === ALL || category === NONE
            ? '/menu/items/new'
            : `/menu/items/new?category=${category}`,
        )
      }
    >
      <Plus size={16} strokeWidth={1.75} aria-hidden />
      Add item
    </Button>
  );

  if (menu.isPending) {
    return (
      <Page title="Menu">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3].map((card) => (
            <Skeleton key={card} className="h-36 w-full rounded-(--radius-surface)" />
          ))}
        </div>
      </Page>
    );
  }
  if (menu.isError) {
    return (
      <Page title="Menu">
        <Alert tone="danger" title="Couldn’t load the menu">
          {menu.error.message}
        </Alert>
      </Page>
    );
  }

  const { items, categories } = menu.data;
  if (items.length === 0) {
    return (
      <Page title="Menu">
        <div className="rounded-(--radius-surface) border bg-card">
          <EmptyState
            icon={<UtensilsCrossed size={24} strokeWidth={1.75} />}
            title="No menu items yet"
            description="Add your first item to start taking orders on the tablet and your online store."
            action={
              <Button onClick={() => navigate('/menu/items/new')}>Add your first item</Button>
            }
          />
        </div>
      </Page>
    );
  }

  const uncategorised = items.filter((item) => item.categoryId === null);
  const options = [
    { value: ALL, name: 'All', count: items.length },
    ...categories.map((c) => ({
      value: c.id,
      name: c.name,
      count: items.filter((item) => item.categoryId === c.id).length,
    })),
    ...(uncategorised.length
      ? [{ value: NONE, name: 'No category', count: uncategorised.length }]
      : []),
  ];
  const shown =
    category === ALL ? items : items.filter((item) => (item.categoryId ?? NONE) === category);
  const soldOutCount = items.filter((item) => item.soldOutToday).length;

  return (
    <Page
      title="Menu"
      subtitle={
        soldOutCount > 0
          ? `${items.length} items, ${soldOutCount} sold out today`
          : `${items.length} items`
      }
      actions={addItem}
    >
      <div className="flex flex-col gap-6">
        <SegmentedControl
          label="Category"
          value={category}
          onValueChange={setCategory}
          options={options.map((option) => ({
            value: option.value,
            label: option.name,
            accessory: (
              <span className="text-xs text-muted-foreground tabular-nums">{option.count}</span>
            ),
          }))}
        />

        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => (
            <ItemCard key={item.id} item={item} seesMoney={seesMoney} />
          ))}
        </ul>
      </div>
    </Page>
  );
}

function ItemCard({ item, seesMoney }: { item: MenuItem; seesMoney: boolean }) {
  const { tenantId } = useSession();
  const soldOut = useMutation({
    mutationFn: (next: boolean) => setSoldOut(item.id, next),
    // The card changes at once; it goes back if saving fails.
    ...saveInPlace(['menu', tenantId], (menu: Menu, next: boolean) => ({
      ...menu,
      items: menu.items.map((each) =>
        each.id === item.id ? { ...each, soldOutToday: next } : each,
      ),
    })),
    onSettled: () => refreshMenu(),
  });
  const margin = marginOf(item.price, item.costPrice);
  const details = [
    STATION_WORDS[item.station],
    item.prepMinutes !== null && `${item.prepMinutes} min`,
    item.groups.length > 0 &&
      (item.groups.length === 1 ? '1 group of extras' : `${item.groups.length} groups of extras`),
  ].filter(Boolean);

  return (
    <li className="flex flex-col overflow-hidden rounded-(--radius-surface) border bg-card">
      <Link
        to={`/menu/items/${item.id}`}
        aria-label={`Edit ${item.name}`}
        className="flex flex-1 items-start gap-4 p-4 transition-colors hover:bg-muted/60"
      >
        <span
          className={cn(
            'flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-control) bg-muted text-muted-foreground',
            item.soldOutToday && 'opacity-50 grayscale',
          )}
        >
          {item.photoUrl ? (
            <img src={item.photoUrl} alt="" className="size-full object-cover" />
          ) : (
            <ImageOff size={18} strokeWidth={1.75} aria-hidden />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-start justify-between gap-2">
            <span className={cn('font-medium', item.soldOutToday && 'text-muted-foreground')}>
              {item.name}
            </span>
            <ChevronRight
              size={16}
              strokeWidth={1.75}
              className="mt-1 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </span>
          <span className="flex flex-wrap gap-x-3 font-mono text-sm">
            {item.variants.length > 0 ? (
              item.variants.map((variant) => (
                <span key={variant.id}>
                  <span className="font-sans text-muted-foreground">{variant.name}</span>{' '}
                  {cedis(variant.price)}
                </span>
              ))
            ) : (
              <span>{cedis(item.price)}</span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">{details.join(', ')}</span>
          {seesMoney && item.costPrice !== null && (
            <span className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              Costs {cedis(item.costPrice)}
              {margin !== null && (
                <Badge tone={MARGIN_TONES[marginTone(margin)]} size="sm">
                  {margin}% margin
                </Badge>
              )}
            </span>
          )}
        </span>
      </Link>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
        {item.soldOutToday ? (
          <Badge tone="warning" size="sm">
            Sold out today
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">On sale</span>
        )}
        {/* An action, so it reads as one: "Sold out" alone looked like every item's status. */}
        <Button
          variant={item.soldOutToday ? 'secondary' : 'ghost'}
          size="sm"
          disabled={soldOut.isPending}
          onClick={() => soldOut.mutate(!item.soldOutToday)}
        >
          {item.soldOutToday ? 'Back in stock' : 'Mark sold out'}
        </Button>
      </div>
    </li>
  );
}
