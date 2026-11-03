import { useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { categoryColours, colourOf, type CategoryColour } from '../ui/categories';
import { Badge, Chip } from '../ui/controls';
import { usePressScale } from '../ui/press';
import { cedis, colors, font, radii, space, text, themedStyles } from '../ui/theme';
import type { MenuCategory, MenuItem } from './menu';

const GUTTER = space.lg;
const GAP = 12;
const ALL = 'all';
/** A count this low shows on the tile; higher counts would only be noise. */
const LOW_STOCK = 5;

const keyOf = (category: MenuCategory) => category.id ?? 'other';

function priceLabel(item: MenuItem): string {
  if (!item.variants.length) return cedis(item.price);
  const lowest = item.variants.reduce(
    (low, variant) => (variant.price < low ? variant.price : low),
    item.variants[0]!.price,
  );
  return `from ${cedis(lowest)}`;
}

/**
 * The menu: category chips and a grid of text tiles (four across on a 10" tablet, three on an
 * 8"), each in its category's pastel, so the eye finds the drinks before it reads a name. A
 * tile shows how many of it are on the order, so each tap is seen to land. What the kitchen is
 * cooking sits in the bar across the top of the screen.
 */
export function MenuPane({
  menu,
  onTicket,
  onPick,
}: {
  menu: MenuCategory[] | null;
  /** How many of each item (by id) are on the order being typed in. */
  onTicket: ReadonlyMap<string, number>;
  onPick: (item: MenuItem) => void;
}) {
  const [category, setCategory] = useState<string>(ALL);
  const [width, setWidth] = useState(0);
  const colours = useMemo(() => categoryColours(menu ?? []), [menu]);
  const items = !menu
    ? []
    : category === ALL
      ? menu.flatMap((c) => c.items)
      : (menu.find((c) => keyOf(c) === category)?.items ?? []);
  const columns = width >= 720 ? 4 : 3;
  // Every tile the same width, whatever its name. Tiles sit in explicit rows, so a width that
  // rounds up on the tablet's screen can't push a tile onto the next line.
  const tileWidth =
    width > 0 ? Math.floor((width - GUTTER * 2 - GAP * (columns - 1)) / columns) : undefined;
  const rows: MenuItem[][] = [];
  for (let start = 0; start < items.length; start += columns) {
    rows.push(items.slice(start, start + columns));
  }

  return (
    <View style={styles.pane} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chips}
      >
        <Chip label="All" selected={category === ALL} onPress={() => setCategory(ALL)} />
        {menu?.map((c) => (
          <Chip
            key={keyOf(c)}
            label={c.name}
            colour={colourOf(colours, c.id)}
            selected={category === keyOf(c)}
            onPress={() => setCategory(keyOf(c))}
          />
        ))}
      </ScrollView>

      <ScrollView style={styles.grow} contentContainerStyle={styles.grid}>
        {menu === null ? (
          <ActivityIndicator color={colors.brand} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>
            There's no menu on this tablet yet. It's set up on the dashboard and arrives here on its
            own.
          </Text>
        ) : (
          rows.map((row) => (
            <View key={row[0]!.id} style={styles.row}>
              {row.map((item) => (
                <MenuTile
                  key={item.id}
                  item={item}
                  colour={colourOf(colours, item.categoryId)}
                  count={onTicket.get(item.id) ?? 0}
                  width={tileWidth}
                  onPress={() => onPick(item)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function MenuTile({
  item,
  colour,
  count,
  width,
  onPress,
}: {
  item: MenuItem;
  colour: CategoryColour;
  /** How many are on the order already. */
  count: number;
  /** Unknown until the pane is measured (the first frame). */
  width: number | undefined;
  onPress: () => void;
}) {
  const press = usePressScale();
  const low = !item.soldOut && item.left !== null && item.left <= LOW_STOCK;
  return (
    <Animated.View style={[press.style, width ? { width } : styles.tileFallback]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${priceLabel(item)}${count ? `, ${count} on the order` : ''}${item.soldOut ? ', sold out' : ''}`}
        accessibilityState={{ disabled: item.soldOut }}
        disabled={item.soldOut}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) =>
          item.soldOut
            ? [styles.tile, styles.tileSoldOut]
            : [
                styles.tile,
                { backgroundColor: pressed ? colour.pressed : colour.tint },
                count > 0 && { borderColor: colour.ink },
              ]
        }
      >
        <View style={styles.tileTop}>
          <Text
            style={[styles.tileName, item.soldOut ? styles.faded : { color: colour.ink }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          {count > 0 && (
            <View style={[styles.count, { backgroundColor: colour.ink }]}>
              <Text style={[styles.countText, { color: colour.tint }]}>
                {count > 99 ? '99+' : count}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.tileFoot}>
          {item.soldOut ? (
            <Text style={styles.soldOut}>Sold out</Text>
          ) : (
            <Text style={[styles.tilePrice, { color: colour.soft }]}>{priceLabel(item)}</Text>
          )}
          {low && <Badge label={`${item.left} left`} tone="stock" />}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = themedStyles(() => ({
  pane: { flex: 62, backgroundColor: colors.ground },
  grow: { flex: 1 },
  chipRow: { flexGrow: 0 },
  chips: {
    gap: space.sm,
    paddingHorizontal: GUTTER,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  grid: { gap: GAP, paddingHorizontal: GUTTER, paddingBottom: space.lg },
  row: { flexDirection: 'row', gap: GAP },
  empty: { fontFamily: font.regular, fontSize: text.body, color: colors.muted, maxWidth: 480 },
  /** In its category's pastel; on the order already, ringed in the category's ink, with its count. */
  tile: {
    minHeight: 96,
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    justifyContent: 'space-between',
    gap: space.sm,
  },
  tileFallback: { flex: 1 },
  /** Sold out drops the colour, so what can't be sold steps back. */
  tileSoldOut: { backgroundColor: colors.tileMuted, opacity: 0.6 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs },
  tileName: {
    flexShrink: 1,
    fontFamily: font.semibold,
    fontSize: 17,
    lineHeight: 22,
  },
  count: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: font.semibold, fontSize: 14, fontVariant: ['tabular-nums'] },
  tileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  tilePrice: { fontFamily: font.medium, fontSize: 15, fontVariant: ['tabular-nums'] },
  faded: { color: colors.faint },
  soldOut: { fontFamily: font.medium, fontSize: text.small, color: colors.muted },
}));
