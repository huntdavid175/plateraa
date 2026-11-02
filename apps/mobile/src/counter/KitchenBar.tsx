import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import type { SyncState } from '../offline/engine';
import { useEngineState, useTablet } from '../tablet/TabletProvider';
import { usePressScale } from '../ui/press';
import { colors, font, plural, radii, space, text, themed, themedStyles } from '../ui/theme';
import { useNow } from './hooks';
import { urgency } from './lanes';
import type { QueueOrder } from './queue';
import { kitchenSince, minutesSince } from './views';
import { kindLabel } from './words';

/** How tall the bar is: room for an order card with a little air around it. */
export const KITCHEN_BAR_HEIGHT = 92;

type Tone = 'normal' | 'amber' | 'red' | 'ready';

/** A card's tile and pill. Late orders keep their amber and red, always with a word. */
const TONES = themed(() => ({
  normal: {
    tile: colors.track,
    number: colors.ink,
    pill: colors.cookingBg,
    word: colors.cookingInk,
  },
  amber: {
    tile: colors.amberBg,
    number: colors.amberInk,
    pill: colors.amberBg,
    word: colors.amberInk,
  },
  red: { tile: colors.redTint, number: colors.redInk, pill: colors.redTint, word: colors.redInk },
  ready: {
    tile: colors.readyBg,
    number: colors.readyInk,
    pill: colors.readyBg,
    word: colors.readyInk,
  },
}));

/** Where a finished order goes next. */
const HANDOVER = { PICKUP: 'pickup', DINE_IN: 'table', DELIVERY: 'delivery' } as const;

const itemsOf = (order: QueueOrder) =>
  plural(
    order.lines.reduce((sum, line) => sum + line.quantity, 0),
    'item',
  );

/** One order in the bar: its number, who it's for, how far it's got. */
function OrderCard({
  order,
  tone,
  pill,
  route,
  label,
  onPress,
}: {
  order: QueueOrder;
  tone: Tone;
  pill: string;
  route: string;
  label: string;
  onPress: () => void;
}) {
  const press = usePressScale();
  const look = TONES[tone];
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.card}
      >
        <View style={[styles.tile, { backgroundColor: look.tile }]}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.number, { color: look.number }]}
          >
            {order.display_number}
          </Text>
        </View>
        <View style={styles.words}>
          <View style={styles.top}>
            <Text numberOfLines={1} style={styles.name}>
              {order.customer_name || kindLabel(order)}
            </Text>
            <View style={[styles.pill, { backgroundColor: look.pill }]}>
              <Text style={[styles.pillWord, { color: look.word }]}>{pill}</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={styles.route}>
            {route}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

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
 * leaves the till. A card for each order cooking (turning amber, then red) and each one ready to
 * hand over; tapping one shows it with its next step. The connection sits at the right.
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
        {cooking.length === 0 && ready.length === 0 && (
          <Text style={styles.none}>Nothing cooking yet</Text>
        )}
        {cooking.map((order) => {
          const since = kitchenSince(order);
          const late = urgency(since, order.prepMinutes, now);
          const minutes = minutesSince(since, now);
          const pill = late === 'red' ? 'Late' : late === 'amber' ? 'Getting late' : 'In process';
          return (
            <OrderCard
              key={order.id}
              order={order}
              tone={late}
              pill={pill}
              route={`${itemsOf(order)} → kitchen · ${minutes}m`}
              label={`Order ${order.display_number}, ${itemsOf(order)}, cooking for ${minutes} minutes${late === 'red' ? ', late' : late === 'amber' ? ', getting late' : ''}`}
              onPress={() => onOrder(order)}
            />
          );
        })}
        {ready.map((order) => {
          const onTheWay = order.status === 'OUT_FOR_DELIVERY';
          return (
            <OrderCard
              key={order.id}
              order={order}
              tone="ready"
              pill={onTheWay ? 'On the way' : 'Ready'}
              route={`${itemsOf(order)} → ${HANDOVER[order.type]}`}
              label={`Order ${order.display_number}, ${itemsOf(order)}, ${onTheWay ? 'out for delivery' : 'ready'}`}
              onPress={() => onOrder(order)}
            />
          );
        })}
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
  content: { alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  none: { fontFamily: font.regular, fontSize: text.small, color: colors.muted },
  card: {
    width: 268,
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  tile: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  number: { fontFamily: font.monoMedium, fontSize: 18 },
  words: { flex: 1, gap: 4 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontFamily: font.medium, fontSize: text.body, color: colors.ink },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill },
  pillWord: { fontFamily: font.semibold, fontSize: text.label },
  route: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusWord: { fontFamily: font.medium, fontSize: text.small },
}));
