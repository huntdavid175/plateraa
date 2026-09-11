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
 * an 8"), and a strip of what the kitchen is cooking and what's ready to go out.
 */
export function MenuPane({
  menu,
  onPick,
  cooking,
  ready,
  onOrder,
}: {
  menu: MenuCategory[] | null;
  onPick: (item: MenuItem) => void;
  cooking: QueueOrder[];
  ready: QueueOrder[];
  /** An order in the strip was tapped: show it, with its next step. */
  onOrder: (order: QueueOrder) => void;
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

      <KitchenStrip cooking={cooking} ready={ready} onOrder={onOrder} />
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

/**
 * The kitchen at a glance, so a one-tablet counter never leaves the till: what's cooking (timers
 * turn amber, then red) and what's ready to hand over. Tapping an order shows it with its next step.
 */
function KitchenStrip({
  cooking,
  ready,
  onOrder,
}: {
  cooking: QueueOrder[];
  ready: QueueOrder[];
  onOrder: (order: QueueOrder) => void;
}) {
  const now = useNow();
  return (
    <View style={styles.strip}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripContent}
      >
        <Text style={styles.stripLabel}>Cooking</Text>
        {cooking.length === 0 && <Text style={styles.stripNone}>Nothing yet</Text>}
        {cooking.map((order) => {
          const since = kitchenSince(order);
          const late = urgency(since, order.prepMinutes, now);
          const minutes = minutesSince(since, now);
          return (
            <Pressable
              key={order.id}
              accessibilityRole="button"
              accessibilityLabel={`Order ${order.display_number}, cooking for ${minutes} minutes${late === 'red' ? ', late' : late === 'amber' ? ', getting late' : ''}`}
              hitSlop={4}
              onPress={() => onOrder(order)}
              style={({ pressed }) => [
                styles.orderChip,
                late === 'amber' && styles.amberChip,
                late === 'red' && styles.redChip,
                pressed && styles.pressedChip,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  late === 'amber' && styles.amberText,
                  late === 'red' && styles.redText,
                ]}
              >
                {order.display_number} · {minutes}m
              </Text>
            </Pressable>
          );
        })}
        {ready.length > 0 && (
          <>
            <View style={styles.stripDivider} />
            <Text style={styles.stripLabel}>Ready</Text>
            {ready.map((order) => (
              <Pressable
                key={order.id}
                accessibilityRole="button"
                accessibilityLabel={`Order ${order.display_number}, ready`}
                hitSlop={4}
                onPress={() => onOrder(order)}
                style={({ pressed }) => [
                  styles.orderChip,
                  styles.readyChip,
                  pressed && styles.pressedChip,
                ]}
              >
                <Text style={[styles.chipText, styles.readyText]}>{order.display_number} ✓</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
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
  strip: { height: 60, borderTopWidth: 1, borderTopColor: colors.line },
  stripContent: { alignItems: 'center', gap: 8, paddingHorizontal: GUTTER },
  stripLabel: { fontFamily: font.medium, fontSize: 13, color: colors.muted, marginRight: 2 },
  stripNone: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  stripDivider: { width: 1, height: 24, backgroundColor: colors.line, marginHorizontal: 8 },
  orderChip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.track,
    justifyContent: 'center',
  },
  amberChip: { backgroundColor: colors.amberBg },
  redChip: { backgroundColor: '#FEE2E2' },
  readyChip: { backgroundColor: colors.goodBg },
  pressedChip: { opacity: 0.7 },
  chipText: { fontFamily: font.monoMedium, fontSize: 14, color: colors.text2 },
  amberText: { color: colors.amberInk },
  redText: { color: colors.redInk },
  readyText: { color: colors.goodInk },
});
