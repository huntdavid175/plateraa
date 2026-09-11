import {
  categories,
  createDatabase,
  devices,
  eq,
  itemModifierGroups,
  itemVariants,
  items,
  modifierGroups,
  modifiers,
  or,
  priceHistory,
  stockItems,
  tenants,
  withPlatform,
  withTenant,
} from '@plateraa/db';
import { businessDateOf, pesewas, type Station } from '@plateraa/shared';
import { ulid } from 'ulid';
import { loadEnv } from '../config/env';

/**
 * Fills a test business with a small chop-bar menu, prices included, so there's something to sell
 * on the tablet before the dashboard's menu setup exists (plan.md §3.1).
 *
 *   pnpm --filter @plateraa/api seed:test-menu "Test Chop Bar"
 *
 * Takes the business's name or slug, and refuses one that already has a menu.
 */

type GroupKey = 'protein' | 'soup';

const GROUPS: Record<
  GroupKey,
  { name: string; minSelect: number; maxSelect: number; options: [string, number][] }
> = {
  protein: {
    name: 'Protein',
    minSelect: 0,
    maxSelect: 3,
    options: [
      ['Chicken', 1500],
      ['Fish', 2000],
      ['Egg', 500],
      ['Wele', 1000],
    ],
  },
  soup: {
    name: 'Choose your soup',
    minSelect: 1,
    maxSelect: 1,
    options: [
      ['Light soup', 0],
      ['Groundnut soup', 500],
      ['Palm nut soup', 500],
    ],
  },
};

interface SeedItem {
  name: string;
  price: number;
  prepMinutes: number;
  station?: Station;
  variants?: [string, number][];
  groups?: GroupKey[];
  /** Today's prep count, so the tablet shows how many are left. */
  stock?: number;
}

const MENU: { category: string; items: SeedItem[] }[] = [
  {
    category: 'Rice',
    items: [
      {
        name: 'Jollof rice',
        price: 4500,
        prepMinutes: 8,
        variants: [
          ['Regular', 4500],
          ['Large', 6000],
        ],
        groups: ['protein'],
        stock: 30,
      },
      { name: 'Waakye', price: 4000, prepMinutes: 8, groups: ['protein'] },
      { name: 'Fried rice', price: 5000, prepMinutes: 10, groups: ['protein'] },
    ],
  },
  {
    category: 'Local dishes',
    items: [
      { name: 'Fufu', price: 5500, prepMinutes: 12, groups: ['soup', 'protein'] },
      { name: 'Banku & tilapia', price: 8000, prepMinutes: 15 },
      { name: 'Kenkey & fried fish', price: 4500, prepMinutes: 5 },
    ],
  },
  {
    category: 'Sides',
    items: [
      { name: 'Kelewele', price: 2000, prepMinutes: 6, stock: 10 },
      { name: 'Extra shito', price: 500, prepMinutes: 1 },
    ],
  },
  {
    category: 'Drinks',
    items: [
      { name: 'Sobolo', price: 1000, prepMinutes: 1, station: 'DRINKS' },
      { name: 'Bottled water', price: 500, prepMinutes: 1, station: 'DRINKS' },
      { name: 'Malt', price: 1200, prepMinutes: 1, station: 'DRINKS' },
    ],
  },
];

async function main() {
  const wanted = process.argv[2]?.trim();
  if (!wanted) throw new Error('Say which business: seed:test-menu "<business name or slug>"');

  const env = loadEnv();
  const { db, pool } = createDatabase(env.DATABASE_URL, { max: 1 });
  try {
    const matches = await withPlatform(db, (tx) =>
      tx
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          timezone: tenants.timezone,
          createdAt: tenants.createdAt,
        })
        .from(tenants)
        .where(or(eq(tenants.slug, wanted), eq(tenants.name, wanted))),
    );
    if (!matches.length) throw new Error(`No business is called "${wanted}"`);
    if (matches.length > 1) {
      // Say which is which, so the right one can be picked by its slug.
      const choices: string[] = [];
      for (const match of matches) {
        const tablets = await withTenant(db, match.id, (tx) => tx.$count(devices));
        const menuItems = await withTenant(db, match.id, (tx) => tx.$count(items));
        const setUp = match.createdAt.toISOString().slice(0, 16).replace('T', ' ');
        choices.push(
          `  ${match.slug}  (set up ${setUp} UTC, ${tablets} tablet(s) registered, ${menuItems ? 'has a menu' : 'no menu yet'})`,
        );
      }
      throw new Error(
        `${matches.length} businesses are called "${wanted}". Run it again with one of these slugs:\n${choices.join('\n')}`,
      );
    }
    const tenant = matches[0]!;
    const today = businessDateOf(new Date(), tenant.timezone);
    let added = 0;

    await withTenant(db, tenant.id, async (tx) => {
      const [existing] = await tx.select({ id: items.id }).from(items).limit(1);
      if (existing) throw new Error(`${tenant.name} already has a menu; not adding another`);

      const groupIds: Record<GroupKey, string> = { protein: ulid(), soup: ulid() };
      for (const [position, key] of (Object.keys(GROUPS) as GroupKey[]).entries()) {
        const group = GROUPS[key];
        await tx.insert(modifierGroups).values({
          id: groupIds[key],
          tenantId: tenant.id,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          position,
        });
        await tx.insert(modifiers).values(
          group.options.map(([name, delta], index) => ({
            id: ulid(),
            tenantId: tenant.id,
            groupId: groupIds[key],
            name,
            priceDelta: pesewas(delta),
            position: index,
          })),
        );
      }

      for (const [categoryPosition, category] of MENU.entries()) {
        const categoryId = ulid();
        await tx.insert(categories).values({
          id: categoryId,
          tenantId: tenant.id,
          name: category.category,
          position: categoryPosition,
        });
        for (const [position, item] of category.items.entries()) {
          const itemId = ulid();
          await tx.insert(items).values({
            id: itemId,
            tenantId: tenant.id,
            categoryId,
            name: item.name,
            price: pesewas(item.price),
            prepMinutes: item.prepMinutes,
            station: item.station ?? 'KITCHEN',
            position,
          });
          await tx
            .insert(priceHistory)
            .values({ id: ulid(), tenantId: tenant.id, itemId, price: pesewas(item.price) });

          for (const [variantPosition, [name, price]] of (item.variants ?? []).entries()) {
            const variantId = ulid();
            await tx.insert(itemVariants).values({
              id: variantId,
              tenantId: tenant.id,
              itemId,
              name,
              price: pesewas(price),
              position: variantPosition,
            });
            await tx.insert(priceHistory).values({
              id: ulid(),
              tenantId: tenant.id,
              itemId,
              variantId,
              price: pesewas(price),
            });
          }

          for (const [groupPosition, key] of (item.groups ?? []).entries()) {
            await tx.insert(itemModifierGroups).values({
              id: ulid(),
              tenantId: tenant.id,
              itemId,
              groupId: groupIds[key],
              position: groupPosition,
            });
          }

          if (item.stock !== undefined) {
            await tx.insert(stockItems).values({
              id: ulid(),
              tenantId: tenant.id,
              kind: 'SELLABLE',
              itemId,
              name: item.name,
              unit: 'portion',
              onHand: item.stock,
              onHandDate: today,
            });
          }
          added += 1;
        }
      }
    });

    console.log(
      `Added ${added} menu items to ${tenant.name}. The tablet shows them after its next sync.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
