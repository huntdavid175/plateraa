import { ZERO, amountDue, formatCedis, sub, type Pesewas, type Station } from '@plateraa/shared';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { problemText } from '../tablet/api';
import { Button } from '../ui/Button';
import { Choice } from '../ui/Choice';
import { colors, radius, space, text } from '../ui/theme';
import { advance, setOnHold, type Counter } from './actions';
import { useNow } from './hooks';
import { LANES, laneOf, urgency, waitingFor, type Lane, type Urgency } from './lanes';
import { extrasText, type QueueOrder } from './queue';
import { LANE_LABELS, SOURCE_LABELS, STATUS_LABELS, nextStepLabel } from './words';

/** What's still to be paid on an order. */
export const remainingOf = (order: QueueOrder): Pesewas =>
  sub(
    amountDue({
      total: order.total,
      deliveryFee: order.delivery_fee,
      deliveryFeeCollectedBy: order.delivery_fee_collected_by,
    }),
    order.amount_paid,
  );

/** Money taken on a cancelled order that a manager still has to give back. */
export const refundOwedOf = (order: QueueOrder): Pesewas =>
  order.status === 'CANCELLED' ? sub(order.amount_paid, order.refunded) : ZERO;

/** Kitchen time runs from when the order was paid for; everything else from when it came in. */
const sinceOf = (order: QueueOrder, lane: Lane) =>
  lane === 'kitchen' && order.paid_at && order.paid_at > order.created_at_device
    ? order.paid_at
    : order.created_at_device;

/**
 * Every open order, sorted into lanes, oldest first so the most urgent is on top. Kitchen and
 * ready orders move on with one tap; tapping the card opens the rest.
 */
export function OrdersPanel({
  orders,
  payBeforePrep,
  counter,
  onOpen,
}: {
  orders: QueueOrder[] | null;
  payBeforePrep: boolean;
  counter: Counter;
  onOpen: (order: QueueOrder) => void;
}) {
  const now = useNow();
  const [lane, setLane] = useState<Lane>('kitchen');
  const [station, setStation] = useState<Station | 'ALL'>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);

  const byLane = useMemo(() => {
    const lanes: Record<Lane, QueueOrder[]> = {
      'awaiting-payment': [],
      kitchen: [],
      ready: [],
      'on-hold': [],
      done: [],
    };
    for (const order of orders ?? []) lanes[laneOf(order, payBeforePrep)].push(order);
    lanes.done.reverse();
    return lanes;
  }, [orders, payBeforePrep]);

  const shown = byLane[lane].filter(
    (order) =>
      lane !== 'kitchen' ||
      station === 'ALL' ||
      order.lines.some((line) => line.station === station),
  );

  const act = async (order: QueueOrder, task: () => Promise<unknown>) => {
    setBusyId(order.id);
    try {
      await task();
    } catch (error) {
      Alert.alert(`Order ${order.display_number}`, problemText(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.panel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabRow}
        contentContainerStyle={styles.tabs}
      >
        {LANES.map((option) => {
          const active = option === lane;
          return (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setLane(option)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {LANE_LABELS[option]} {byLane[option].length}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {lane === 'kitchen' && (
        <View style={styles.stations}>
          <Choice label="All" selected={station === 'ALL'} onPress={() => setStation('ALL')} />
          <Choice
            label="Kitchen"
            selected={station === 'KITCHEN'}
            onPress={() => setStation('KITCHEN')}
          />
          <Choice
            label="Drinks"
            selected={station === 'DRINKS'}
            onPress={() => setStation('DRINKS')}
          />
        </View>
      )}

      <FlatList
        data={shown}
        keyExtractor={(order) => order.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nothing here.</Text>}
        renderItem={({ item: order }) => (
          <OrderCard
            order={order}
            lane={lane}
            station={station}
            now={now}
            busy={busyId === order.id}
            onOpen={() => onOpen(order)}
            onStep={() => act(order, () => advance(counter, order))}
            onResume={() => act(order, () => setOnHold(counter, order.id, false))}
          />
        )}
      />
    </View>
  );
}

function OrderCard({
  order,
  lane,
  station,
  now,
  busy,
  onOpen,
  onStep,
  onResume,
}: {
  order: QueueOrder;
  lane: Lane;
  station: Station | 'ALL';
  now: Date;
  busy: boolean;
  onOpen: () => void;
  onStep: () => void;
  onResume: () => void;
}) {
  const since = sinceOf(order, lane);
  const late: Urgency =
    lane === 'done' || lane === 'on-hold'
      ? 'normal'
      : urgency(since, lane === 'awaiting-payment' ? 10 : order.prepMinutes, now);
  const step =
    lane === 'kitchen' || lane === 'ready' ? nextStepLabel(order.status, order.type) : null;
  const lines =
    lane === 'kitchen' && station !== 'ALL'
      ? order.lines.filter((line) => line.station === station)
      : order.lines;
  const refundOwed = refundOwedOf(order);

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        late === 'amber' && styles.amber,
        late === 'red' && styles.red,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.cardHead}>
        <Text style={styles.number}>{order.display_number}</Text>
        <Text style={styles.badge}>
          {SOURCE_LABELS[order.source]}
          {order.type === 'DELIVERY' ? ' · Delivery' : ''}
        </Text>
        {lane !== 'done' && (
          <Text
            style={[
              styles.wait,
              late === 'amber' && styles.amberText,
              late === 'red' && styles.redText,
            ]}
          >
            {waitingFor(since, now)}
          </Text>
        )}
      </View>
      {lines.map((line) => {
        const extras = extrasText(line);
        return (
          <Text key={line.id} style={styles.line}>
            {line.quantity}× {line.name}
            {line.variant_name ? ` (${line.variant_name})` : ''}
            {extras ? ` · ${extras}` : ''}
            {line.note ? ` · “${line.note}”` : ''}
          </Text>
        );
      })}
      {lane === 'awaiting-payment' && (
        <Text style={styles.meta}>
          {formatCedis(remainingOf(order))} to pay
          {order.customer_phone ? ` · ${order.customer_phone}` : ''}
          {order.provisional ? ' · provisional' : ''}
        </Text>
      )}
      {lane === 'done' && (
        <Text style={styles.meta}>
          {STATUS_LABELS[order.status]}
          {refundOwed > 0 ? ` · refund owed ${formatCedis(refundOwed)}` : ''}
        </Text>
      )}
      {step && <Button label={step} onPress={onStep} busy={busy} />}
      {lane === 'on-hold' && (
        <Button label="Resume" kind="secondary" onPress={onResume} busy={busy} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, gap: space.sm },
  tabRow: { flexGrow: 0 },
  tabs: { gap: space.xs },
  tab: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radius,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabLabel: { fontSize: text.small, fontWeight: '700', color: colors.ink },
  tabLabelActive: { color: colors.onInk },
  stations: { flexDirection: 'row', gap: space.sm },
  list: { gap: space.sm, paddingBottom: space.md },
  empty: { fontSize: text.body, color: colors.muted, padding: space.md },
  card: {
    gap: space.xs,
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 3,
    borderColor: colors.line,
    padding: space.md,
  },
  amber: { borderColor: '#d98e04' },
  red: { borderColor: colors.dangerInk },
  pressed: { opacity: 0.8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  number: { fontSize: 32, fontWeight: '800', color: colors.ink },
  badge: { flex: 1, fontSize: text.small, fontWeight: '600', color: colors.muted },
  wait: { fontSize: text.body, fontWeight: '700', color: colors.muted },
  amberText: { color: '#a86b00' },
  redText: { color: colors.dangerInk },
  line: { fontSize: 20, fontWeight: '600', color: colors.ink },
  meta: { fontSize: text.small, color: colors.muted, fontWeight: '600' },
});
