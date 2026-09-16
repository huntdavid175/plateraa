import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Chip } from '../ui/controls';
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
 * The menu: category chips and a quiet grid of text tiles (four across on a 10" tablet, three
 * on an 8"). What the kitchen is cooking sits in the bar across the top of the screen.
 */
export function MenuPane({
  menu,
  onPick,
}: {
  menu: MenuCategory[] | null;
  onPick: (item: MenuItem) => void;
}) {
  const [category, setCategory] = useState<string>(ALL);
  const [width, setWidth] = useState(0);
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
  width,
  onPress,
}: {
  item: MenuItem;
  /** Unknown until the pane is measured (the first frame). */
  width: number | undefined;
  onPress: () => void;
}) {
  const low = !item.soldOut && item.left !== null && item.left <= LOW_STOCK;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: item.soldOut }}
      disabled={item.soldOut}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        width ? { width } : styles.tileFallback,
        pressed && styles.tilePressed,
        item.soldOut && styles.tileSoldOut,
      ]}
    >
      <View style={styles.tileTop}>
        <Text style={[styles.tileName, item.soldOut && styles.faded]} numberOfLines={2}>
          {item.name}
        </Text>
        {low && <Badge label={`${item.left} left`} tone="stock" />}
      </View>
      <Text style={[styles.tilePrice, item.soldOut && styles.faded]}>{priceLabel(item)}</Text>
      {item.soldOut && <Text style={styles.soldOut}>Sold out</Text>}
    </Pressable>
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
    paddingBottom: 12,
  },
  grid: { gap: GAP, paddingHorizontal: GUTTER, paddingBottom: space.md },
  row: { flexDirection: 'row', gap: GAP },
  empty: { fontFamily: font.regular, fontSize: text.body, color: colors.muted, maxWidth: 480 },
  tile: {
    minHeight: 88,
    overflow: 'hidden',
    borderRadius: radii.lg,
    backgroundColor: colors.tile,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 4,
  },
  tileFallback: { flex: 1 },
  tilePressed: { backgroundColor: colors.tilePressed },
  tileSoldOut: { backgroundColor: colors.tileMuted, opacity: 0.55 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs },
  tileName: {
    flexShrink: 1,
    fontFamily: font.medium,
    fontSize: text.body,
    lineHeight: 21,
    color: colors.ink,
  },
  tilePrice: { fontFamily: font.mono, fontSize: text.small, color: colors.muted },
  faded: { color: colors.faint },
  soldOut: { fontFamily: font.medium, fontSize: text.label, color: colors.muted },
}));
