import { useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View } from 'react-native';
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
 * The menu: category chips and a quiet grid of text tiles (four across on a 10" tablet, three
 * on an 8"). A tile shows how many of it are on the order, so each tap is seen to land. What
 * the kitchen is cooking sits in the bar across the top of the screen.
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
  count,
  width,
  onPress,
}: {
  item: MenuItem;
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
        style={({ pressed }) => [
          styles.tile,
          count > 0 && styles.tileOn,
          pressed && styles.tilePressed,
          item.soldOut && styles.tileSoldOut,
        ]}
      >
        <View style={styles.tileTop}>
          <Text style={[styles.tileName, item.soldOut && styles.faded]} numberOfLines={2}>
            {item.name}
          </Text>
          {count > 0 && (
            <View style={styles.count}>
              <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
            </View>
          )}
        </View>
        <View style={styles.tileFoot}>
          {item.soldOut ? (
            <Text style={styles.soldOut}>Sold out</Text>
          ) : (
            <Text style={styles.tilePrice}>{priceLabel(item)}</Text>
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
  tile: {
    minHeight: 96,
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.tile,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    justifyContent: 'space-between',
    gap: space.sm,
  },
  tileFallback: { flex: 1 },
  /** On the order already: outlined in the brand colour, with its count. */
  tileOn: { borderColor: colors.brand },
  tilePressed: { backgroundColor: colors.tilePressed },
  tileSoldOut: { backgroundColor: colors.tileMuted, opacity: 0.6 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs },
  tileName: {
    flexShrink: 1,
    fontFamily: font.medium,
    fontSize: text.body,
    lineHeight: 21,
    color: colors.ink,
  },
  count: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 13,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: font.monoMedium, fontSize: 13, color: colors.onBrand },
  tileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  tilePrice: { fontFamily: font.mono, fontSize: text.small, color: colors.muted },
  faded: { color: colors.faint },
  soldOut: { fontFamily: font.medium, fontSize: text.small, color: colors.muted },
}));
