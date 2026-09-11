import type { Station } from '@plateraa/shared';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { problemText } from '../tablet/api';
import { Button } from '../ui/Button';
import { Chip, Segmented } from '../ui/controls';
import { colors, font, radii, space } from '../ui/theme';
import { advance, type Counter } from './actions';
import { useNow } from './hooks';
import { laneOf, urgency } from './lanes';
import { extrasText, type QueueOrder } from './queue';
import { kitchenSince, minutesSince } from './views';
import { SOURCE_LABELS, nextStepLabel } from './words';

type View_ = 'cooking' | 'ready';

const LATE_WORDS = { normal: null, amber: 'getting late', red: 'late' } as const;

/**
 * The kitchen's view, readable from two metres: big order numbers and lines, a running time
 * that turns amber then red (with a word), and one tap to move each order on.
 */
export function KitchenScreen({
  orders,
  counter,
  payBeforePrep,
}: {
  orders: QueueOrder[] | null;
  counter: Counter;
  payBeforePrep: boolean;
}) {
  const now = useNow();
  const [view, setView] = useState<View_>('cooking');
  const [station, setStation] = useState<Station | 'ALL'>('ALL');
  const [width, setWidth] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cooking = (orders ?? []).filter((order) => laneOf(order, payBeforePrep) === 'kitchen');
  const ready = (orders ?? []).filter((order) => laneOf(order, payBeforePrep) === 'ready');
  const shown = (view === 'cooking' ? cooking : ready).filter(
    (order) =>
      view !== 'cooking' ||
      station === 'ALL' ||
      order.lines.some((line) => line.station === station),
  );
  const columns = width >= 1100 ? 3 : 2;
  const cardWidth =
    width > 0 ? Math.floor((width - space.lg * 2 - space.md * (columns - 1)) / columns) : undefined;

  const step = async (order: QueueOrder) => {
    setBusyId(order.id);
    try {
      await advance(counter, order);
    } catch (error) {
      Alert.alert(`Order ${order.display_number}`, problemText(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={styles.bar}>
        <Segmented
          options={[
            { value: 'cooking', label: `Cooking ${cooking.length}` },
            { value: 'ready', label: `Ready ${ready.length}` },
          ]}
          value={view}
          onChange={setView}
        />
        {view === 'cooking' && (
          <View style={styles.stations}>
            <Chip label="All" selected={station === 'ALL'} onPress={() => setStation('ALL')} />
            <Chip
              label="Kitchen"
              selected={station === 'KITCHEN'}
              onPress={() => setStation('KITCHEN')}
            />
            <Chip
              label="Drinks"
              selected={station === 'DRINKS'}
              onPress={() => setStation('DRINKS')}
            />
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {shown.length === 0 ? (
          <Text style={styles.empty}>
            {view === 'cooking' ? 'Nothing to cook right now.' : 'Nothing waiting to go out.'}
          </Text>
        ) : (
          shown.map((order) => {
            const since = view === 'cooking' ? kitchenSince(order) : order.created_at_device;
            const late = urgency(since, order.prepMinutes, now);
            const lines =
              view === 'cooking' && station !== 'ALL'
                ? order.lines.filter((line) => line.station === station)
                : order.lines;
            const next = nextStepLabel(order.status, order.type);
            return (
              <View
                key={order.id}
                style={[
                  styles.card,
                  cardWidth ? { width: cardWidth } : styles.cardFallback,
                  late === 'amber' && styles.cardAmber,
                  late === 'red' && styles.cardRed,
                ]}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.number}>{order.display_number}</Text>
                  <Text style={styles.source} numberOfLines={1}>
                    {SOURCE_LABELS[order.source]}
                    {order.type === 'DELIVERY'
                      ? ' · Delivery'
                      : order.type === 'PICKUP'
                        ? ' · Pickup'
                        : ''}
                  </Text>
                  <View style={styles.time}>
                    <Text
                      style={[
                        styles.minutes,
                        late === 'amber' && styles.amberText,
                        late === 'red' && styles.redText,
                      ]}
                    >
                      {minutesSince(since, now)} min
                    </Text>
                    {LATE_WORDS[late] && (
                      <Text
                        style={[
                          styles.lateWord,
                          late === 'amber' && styles.amberText,
                          late === 'red' && styles.redText,
                        ]}
                      >
                        {LATE_WORDS[late]}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.lines}>
                  {lines.map((line) => {
                    const extras = extrasText(line);
                    return (
                      <View key={line.id}>
                        <Text style={styles.line}>
                          {line.quantity} × {line.name}
                          {line.variant_name ? ` (${line.variant_name})` : ''}
                        </Text>
                        {extras ? <Text style={styles.extras}>{extras}</Text> : null}
                        {line.note ? <Text style={styles.lineNote}>“{line.note}”</Text> : null}
                      </View>
                    );
                  })}
                  {order.note ? <Text style={styles.lineNote}>{order.note}</Text> : null}
                </View>
                {next && (
                  <Button
                    label={next}
                    onPress={() => void step(order)}
                    busy={busyId === order.id}
                  />
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  stations: { flexDirection: 'row', gap: space.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  empty: { fontFamily: font.regular, fontSize: 18, color: colors.muted, paddingTop: space.lg },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.canvas,
    padding: space.md,
    gap: 12,
  },
  cardFallback: { width: '48%' },
  cardAmber: { borderColor: '#F59E0B' },
  cardRed: { borderColor: colors.red },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  number: { fontFamily: font.monoMedium, fontSize: 32, color: colors.ink },
  source: { flex: 1, fontFamily: font.medium, fontSize: 14, color: colors.muted },
  time: { alignItems: 'flex-end' },
  minutes: { fontFamily: font.monoMedium, fontSize: 20, color: colors.muted },
  lateWord: { fontFamily: font.semibold, fontSize: 13 },
  amberText: { color: colors.amberInk },
  redText: { color: colors.redInk },
  lines: { gap: 8 },
  line: { fontFamily: font.medium, fontSize: 20, lineHeight: 26, color: colors.ink },
  extras: { fontFamily: font.regular, fontSize: 16, color: colors.muted },
  lineNote: {
    alignSelf: 'flex-start',
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.amberInk,
    backgroundColor: colors.amberBg,
    borderRadius: radii.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    marginTop: 4,
  },
});
