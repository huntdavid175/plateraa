import { formatCedis } from '@plateraa/shared';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, text } from '../ui/theme';
import type { MenuCategory, MenuItem } from './menu';

const priceLabel = (item: MenuItem) =>
  item.variants.length
    ? `from ${formatCedis(item.variants.reduce((low, v) => (v.price < low ? v.price : low), item.variants[0]!.price))}`
    : formatCedis(item.price);

/** Big text tiles, one category at a time. No photos: they cost data and slow the counter. */
export function MenuTiles({
  menu,
  onPick,
}: {
  menu: MenuCategory[];
  onPick: (item: MenuItem) => void;
}) {
  const [categoryId, setCategoryId] = useState<string | null | undefined>(undefined);
  if (!menu.length) {
    return (
      <Text style={styles.hint}>
        There's no menu on this tablet yet. It's set up on the dashboard, then arrives here on its
        own.
      </Text>
    );
  }
  const selected = menu.find((category) => category.id === categoryId) ?? menu[0]!;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipRow}
      >
        {menu.map((category) => {
          const active = category === selected;
          return (
            <Pressable
              key={category.id ?? 'other'}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setCategoryId(category.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                {category.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView contentContainerStyle={styles.grid}>
        {selected.items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ disabled: item.soldOut }}
            disabled={item.soldOut}
            onPress={() => onPick(item)}
            style={({ pressed }) => [
              styles.tile,
              pressed && styles.pressed,
              item.soldOut && styles.soldOut,
            ]}
          >
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.price}>{priceLabel(item)}</Text>
            {item.soldOut ? (
              <Text style={styles.flag}>Sold out</Text>
            ) : item.left !== null ? (
              <Text style={styles.left}>{item.left} left</Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: space.sm },
  hint: { fontSize: text.body, color: colors.muted, padding: space.md },
  chipRow: { flexGrow: 0 },
  chips: { gap: space.sm },
  chip: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipLabel: { fontSize: text.body, fontWeight: '600', color: colors.ink },
  chipLabelActive: { color: colors.onInk },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingBottom: space.md },
  tile: {
    width: 150,
    minHeight: 100,
    borderRadius: radius,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.line,
    padding: space.sm,
    justifyContent: 'space-between',
  },
  pressed: { backgroundColor: colors.line },
  soldOut: { opacity: 0.45 },
  name: { fontSize: 20, fontWeight: '700', color: colors.ink },
  price: { fontSize: text.small, fontWeight: '600', color: colors.muted },
  left: { fontSize: text.small, color: colors.infoInk, fontWeight: '600' },
  flag: { fontSize: text.small, color: colors.dangerInk, fontWeight: '700' },
});
