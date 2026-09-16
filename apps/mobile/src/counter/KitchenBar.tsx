import { Pressable, ScrollView, Text, View } from 'react-native';
import type { SyncState } from '../offline/engine';
import { useEngineState, useTablet } from '../tablet/TabletProvider';
import { colors, font, space, text, themedStyles } from '../ui/theme';
import { useNow } from './hooks';
import { urgency } from './lanes';
import type { QueueOrder } from './queue';
import { kitchenSince, minutesSince } from './views';

/** How tall the bar is, matching the nav bar along the bottom. */
export const KITCHEN_BAR_HEIGHT = 64;

/** Online, offline (grey-blue) or signed out, always as a word. */
function connectionOf(state: SyncState | null) {
  if (!state || state.connection === 'unknown') {
    return { word: 'Connecting', dot: colors.faint, ink: colors.muted };
  }
  if (state.connection === 'signed-out') {
    return { word: 'Signed out', dot: colors.red, ink: colors.redInk };
  }
  if (state.connection === 'offline') {
    return {
      word: state.pending ? `Offline · ${state.pending} waiting` : 'Offline',
      dot: colors.offlineInk,
      ink: colors.offlineInk,
    };
  }
  if (state.pending) {
    return { word: `Uploading ${state.pending}`, dot: colors.online, ink: colors.goodInk };
  }
  return { word: 'Online', dot: colors.online, ink: colors.goodInk };
}

/**
 * The bar across the top of the counter: the kitchen at a glance, so a one-tablet counter never
 * leaves the till. What is cooking (timers turn amber, then red) and what is ready to hand over;
 * tapping an order shows it with its next step. The connection sits at the right.
 */
export function KitchenBar({
  cooking,
  ready,
  onOrder,
}: {
  cooking: QueueOrder[];
  ready: QueueOrder[];
  /** An order in the bar was tapped: show it, with its next step. */
  onOrder: (order: QueueOrder) => void;
}) {
  const { engine } = useTablet();
  const connection = connectionOf(useEngineState(engine));
  const now = useNow();

  return (
    <View style={styles.bar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.grow}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.label}>Cooking</Text>
        {cooking.length === 0 && <Text style={styles.none}>Nothing yet</Text>}
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
            <View style={styles.divider} />
            <Text style={styles.label}>Ready</Text>
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

      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: connection.dot }]} />
        <Text style={[styles.statusWord, { color: connection.ink }]}>{connection.word}</Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  bar: {
    height: KITCHEN_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  grow: { flex: 1 },
  content: { alignItems: 'center', gap: 8 },
  label: { fontFamily: font.medium, fontSize: 13, color: colors.muted, marginRight: 2 },
  none: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  divider: { width: 1, height: 24, backgroundColor: colors.line, marginHorizontal: 8 },
  orderChip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.track,
    justifyContent: 'center',
  },
  amberChip: { backgroundColor: colors.amberBg },
  redChip: { backgroundColor: colors.redTint },
  readyChip: { backgroundColor: colors.goodBg },
  pressedChip: { opacity: 0.7 },
  chipText: { fontFamily: font.monoMedium, fontSize: 14, color: colors.text2 },
  amberText: { color: colors.amberInk },
  redText: { color: colors.redInk },
  readyText: { color: colors.goodInk },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusWord: { fontFamily: font.medium, fontSize: text.small },
}));
