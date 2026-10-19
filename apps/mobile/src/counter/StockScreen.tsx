import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { problemText } from '../tablet/api';
import { cedis, colors, font, plural, radii, space, text, themedStyles } from '../ui/theme';
import { addPortions, setSoldOut, type Counter } from './actions';
import { useCountPortions, useMenu } from './hooks';
import type { MenuItem } from './menu';
import { PortionsSheet } from './PortionsSheet';

const GUTTER = space.lg;
const GAP = 12;

/**
 * What's on sale today, laid out like the counter's menu: a tile per item, three across on an
 * 8" tablet and four on a 10", under its category. One tap on a tile's switch marks it sold out,
 * and the counter shows it at once; another tap puts it back. Sold out lasts the trading day.
 * When the owner switches portion counts on, items with a count record also take the portions
 * made, and sell out by themselves at 0.
 */
export function StockScreen({ counter }: { counter: Counter }) {
  const menu = useMenu();
  const countPortions = useCountPortions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counting, setCounting] = useState<MenuItem | null>(null);
  const [width, setWidth] = useState(0);
  const columns = width >= 1100 ? 4 : 3;
  // Explicit rows of equal tiles, as on the menu, so a width that rounds up can't wrap a tile.
  const tileWidth =
    width > 0 ? Math.floor((width - GUTTER * 2 - GAP * (columns - 1)) / columns) : undefined;

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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View style={styles.intro}>
        <Text style={styles.title}>
          {menu.length === 0
            ? "There's no menu on this tablet yet."
            : soldOut.length === 0
              ? 'Everything is on sale'
              : `${plural(soldOut.length, 'item')} sold out today`}
        </Text>
        <Text style={styles.hint}>
          Tap an item's switch to mark it sold out for today, or to put it back on sale.
          {countPortions
            ? ' Portion counts are on: add what was made, and each sale counts down.'
            : ''}
        </Text>
      </View>
      {menu.map((category) => {
        const rows: MenuItem[][] = [];
        for (let at = 0; at < category.items.length; at += columns) {
          rows.push(category.items.slice(at, at + columns));
        }
        return (
          <View key={category.id ?? 'other'} style={styles.section}>
            <Text style={styles.sectionTitle}>{category.name}</Text>
            {rows.map((row) => (
              <View key={row[0]!.id} style={styles.row}>
                {row.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.tile,
                      tileWidth ? { width: tileWidth } : styles.tileFallback,
                      item.soldOut && styles.tileOut,
                    ]}
                  >
                    <View style={styles.tileText}>
                      <Text style={[styles.name, item.soldOut && styles.faded]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.price}>
                        {cedis(item.price)}
                        {item.left !== null ? ` · ${item.left} left` : ''}
                      </Text>
                    </View>
                    <View style={styles.tileFoot}>
                      <SoldOutSwitch
                        name={item.name}
                        soldOut={item.soldOut}
                        busy={busyId === item.id}
                        onPress={() => void toggle(item)}
                      />
                      {countPortions && item.stockItemId && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Add portions of ${item.name}`}
                          onPress={() => setCounting(item)}
                          style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
                        >
                          <Text style={styles.addLabel}>+ Portions</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      })}
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

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.ground },
  loading: { marginTop: space.xl },
  content: { paddingHorizontal: GUTTER, paddingVertical: space.lg, gap: space.lg },
  intro: { gap: 4 },
  title: { fontFamily: font.semibold, fontSize: text.heading, color: colors.ink },
  hint: { fontFamily: font.regular, fontSize: text.small, color: colors.muted },
  section: { gap: GAP },
  sectionTitle: { fontFamily: font.semibold, fontSize: text.body, color: colors.text2 },
  row: { flexDirection: 'row', gap: GAP },
  tile: {
    minHeight: 128,
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.canvas,
  },
  tileFallback: { flex: 1 },
  tileOut: { backgroundColor: colors.tileMuted },
  tileText: { gap: 3 },
  name: { fontFamily: font.medium, fontSize: 17, lineHeight: 22, color: colors.ink },
  faded: { color: colors.muted },
  price: { fontFamily: font.mono, fontSize: text.small, color: colors.muted },
  tileFoot: { flexDirection: 'row', gap: space.sm },
  switch: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  switchOut: { backgroundColor: colors.redBg, borderColor: colors.redLine },
  add: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.tile,
  },
  addPressed: { backgroundColor: colors.tilePressed },
  addLabel: { fontFamily: font.medium, fontSize: 15, color: colors.ink },
  pressed: { opacity: 0.6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  switchLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.text2 },
  switchLabelOut: { color: colors.redInk },
}));
