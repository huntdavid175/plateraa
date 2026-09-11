import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Chip } from '../ui/controls';
import { cedis, colors, font, radii, space, text } from '../ui/theme';
import { useNow } from './hooks';
import { urgency } from './lanes';
import type { MenuCategory, MenuItem } from './menu';
import type { QueueOrder } from './queue';
import { kitchenSince, minutesSince } from './views';

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
 * The menu: category chips, a quiet grid of text tiles (four across on a 10" tablet, three on
 * an 8"), and a strip of what the kitchen is cooking.
 */
export function MenuPane({
  menu,
  onPick,
  cooking,
  onOpenKitchen,
}: {
  menu: MenuCategory[] | null;
  onPick: (item: MenuItem) => void;
  cooking: QueueOrder[];
  onOpenKitchen: () => void;
}) {
  const [category, setCategory] = useState<string>(ALL);
  const [width, setWidth] = useState(0);
  const items = !menu
    ? []
    : category === ALL
      ? menu.flatMap((c) => c.items)
      : (menu.find((c) => keyOf(c) === category)?.items ?? []);
  const columns = width >= 720 ? 4 : 3;
  const tileWidth =
    width > 0 ? Math.floor((width - GUTTER * 2 - GAP * (columns - 1)) / columns) : undefined;

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
          items.map((item) => (
            <MenuTile key={item.id} item={item} width={tileWidth} onPress={() => onPick(item)} />
          ))
        )}
      </ScrollView>

      <NowCooking orders={cooking} onPress={onOpenKitchen} />
    </View>
  );
}

function MenuTile({
  item,
  width,
  onPress,
}: {
  item: MenuItem;
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

function NowCooking({ orders, onPress }: { orders: QueueOrder[]; onPress: () => void }) {
  const now = useNow();
  return (
    <View style={styles.cooking}>
      <Text style={styles.cookingLabel}>Now cooking</Text>
      {orders.length === 0 ? (
        <Text style={styles.cookingNone}>Nothing yet</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cookingChips}
        >
          {orders.map((order) => {
            const since = kitchenSince(order);
            const late = urgency(since, order.prepMinutes, now);
            const minutes = minutesSince(since, now);
            return (
              <Pressable
                key={order.id}
                accessibilityRole="button"
                accessibilityLabel={`Order ${order.display_number}, ${minutes} minutes${late === 'red' ? ', late' : late === 'amber' ? ', getting late' : ''}`}
                onPress={onPress}
                style={[
                  styles.cookChip,
                  late === 'amber' && styles.cookAmber,
                  late === 'red' && styles.cookRed,
                ]}
              >
                <Text
                  style={[
                    styles.cookText,
                    late === 'amber' && styles.cookAmberText,
                    late === 'red' && styles.cookRedText,
                  ]}
                >
                  {order.display_number} · {minutes}m
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 62, backgroundColor: colors.ground },
  grow: { flex: 1 },
  chipRow: { flexGrow: 0 },
  chips: {
    gap: space.sm,
    paddingHorizontal: GUTTER,
    paddingTop: space.md,
    paddingBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    paddingHorizontal: GUTTER,
    paddingBottom: space.md,
  },
  empty: { fontFamily: font.regular, fontSize: text.body, color: colors.muted, maxWidth: 480 },
  tile: {
    minHeight: 88,
    borderRadius: radii.lg,
    backgroundColor: colors.tile,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 4,
  },
  tileFallback: { width: '23%' },
  tilePressed: { backgroundColor: colors.tilePressed },
  tileSoldOut: { backgroundColor: '#EDECEA', opacity: 0.55 },
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
  cooking: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: GUTTER,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cookingLabel: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  cookingNone: { fontFamily: font.regular, fontSize: 13, color: colors.faint },
  cookingChips: { gap: 6, alignItems: 'center' },
  cookChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.track,
    justifyContent: 'center',
  },
  cookAmber: { backgroundColor: colors.amberBg },
  cookRed: { backgroundColor: '#FEE2E2' },
  cookText: { fontFamily: font.monoMedium, fontSize: 13, color: colors.text2 },
  cookAmberText: { color: colors.amberInk },
  cookRedText: { color: colors.redInk },
});
