import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { problemText } from '../tablet/api';
import { Label } from '../ui/Field';
import { cedis, colors, font, plural, radii, space, text } from '../ui/theme';
import { addPortions, setSoldOut, type Counter } from './actions';
import { useCountPortions, useMenu } from './hooks';
import type { MenuItem } from './menu';
import { PortionsSheet } from './PortionsSheet';

/**
 * What's on sale today. One tap marks an item sold out, and the counter shows it at once; another
 * tap puts it back. Sold out lasts the trading day. When the owner switches portion counts on,
 * items with a count record also take the portions made, and sell out by themselves at 0.
 */
export function StockScreen({ counter }: { counter: Counter }) {
  const menu = useMenu();
  const countPortions = useCountPortions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counting, setCounting] = useState<MenuItem | null>(null);

  const toggle = async (item: MenuItem) => {
    setBusyId(item.id);
    try {
      await setSoldOut(counter, item.id, !item.soldOut);
    } catch (error) {
      Alert.alert(item.name, problemText(error));
    } finally {
      setBusyId(null);
    }
  };

  if (!menu) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color={colors.brand} style={styles.loading} />
      </View>
    );
  }
  const soldOut = menu.flatMap((category) => category.items).filter((item) => item.soldOut);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={styles.title}>
          {menu.length === 0
            ? "There's no menu on this tablet yet."
            : soldOut.length === 0
              ? 'Everything is on sale.'
              : `${plural(soldOut.length, 'item')} sold out today.`}
        </Text>
        <Text style={styles.hint}>
          Tap an item's button to mark it sold out for today, or to put it back on sale.
          {countPortions
            ? ' Portion counts are on: add what was made, and each sale counts down.'
            : ''}
        </Text>
      </View>
      {menu.map((category) => (
        <View key={category.id ?? 'other'} style={styles.section}>
          <Label text={category.name} />
          <View style={styles.card}>
            {category.items.map((item, index) => (
              <View key={item.id} style={[styles.row, index > 0 && styles.rowLine]}>
                <View style={styles.grow}>
                  <Text style={[styles.name, item.soldOut && styles.faded]}>{item.name}</Text>
                  <Text style={styles.price}>
                    {cedis(item.price)}
                    {item.left !== null ? ` · ${item.left} left` : ''}
                  </Text>
                </View>
                {countPortions && item.stockItemId && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add portions of ${item.name}`}
                    hitSlop={4}
                    onPress={() => setCounting(item)}
                    style={({ pressed }) => [styles.add, pressed && styles.pressed]}
                  >
                    <Text style={styles.addLabel}>Add portions</Text>
                  </Pressable>
                )}
                <SoldOutSwitch
                  name={item.name}
                  soldOut={item.soldOut}
                  busy={busyId === item.id}
                  onPress={() => void toggle(item)}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
      <PortionsSheet
        item={counting}
        onAdd={async (quantity) => {
          await addPortions(counter, counting!.stockItemId!, quantity);
          setCounting(null);
        }}
        onClose={() => setCounting(null)}
      />
    </ScrollView>
  );
}

/** Shows the item's state in words, "On sale" or "Sold out"; a tap flips it. */
function SoldOutSwitch({
  name,
  soldOut,
  busy,
  onPress,
}: {
  name: string;
  soldOut: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={`${name}, sold out`}
      accessibilityState={{ checked: soldOut, disabled: busy }}
      disabled={busy}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.switch,
        soldOut && styles.switchOut,
        (pressed || busy) && styles.pressed,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: soldOut ? colors.red : colors.online }]} />
      <Text style={[styles.switchLabel, soldOut && styles.switchLabelOut]}>
        {soldOut ? 'Sold out' : 'On sale'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  loading: { marginTop: space.xl },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: space.lg,
    gap: space.lg,
  },
  intro: { gap: 4 },
  title: { fontFamily: font.semibold, fontSize: text.heading, color: colors.ink },
  hint: { fontFamily: font.regular, fontSize: text.small, color: colors.muted },
  section: { gap: space.sm },
  card: { backgroundColor: colors.canvas, borderRadius: radii.xl, paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.divider },
  grow: { flex: 1 },
  name: { fontFamily: font.medium, fontSize: 17, color: colors.ink },
  faded: { color: colors.muted },
  price: { fontFamily: font.mono, fontSize: text.small, color: colors.muted, marginTop: 2 },
  switch: {
    minHeight: 44,
    minWidth: 128,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  switchOut: { backgroundColor: colors.redBg, borderColor: colors.redLine },
  add: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: colors.track,
  },
  addLabel: { fontFamily: font.medium, fontSize: 15, color: colors.ink },
  pressed: { opacity: 0.6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  switchLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.text2 },
  switchLabelOut: { color: colors.redInk },
});
