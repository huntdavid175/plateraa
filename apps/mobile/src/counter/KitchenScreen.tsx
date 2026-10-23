import type { Station } from '@brixx/shared';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { problemText } from '../tablet/api';
import { Button } from '../ui/Button';
import { Chip, Segmented } from '../ui/controls';
import { colors, font, radii, space, themedStyles } from '../ui/theme';
import { advance, type Counter } from './actions';
import { useNow } from './hooks';
import { laneOf, urgency } from './lanes';
import { extrasText, type QueueOrder } from './queue';
import { kitchenSince, minutesSince } from './views';
import { kindLabel, nextStepLabel } from './words';

type View_ = 'cooking' | 'ready';

const LATE_WORDS = { normal: null, amber: 'getting late', red: 'late' } as const;

/**
 * The kitchen's view, readable from two metres: big order numbers and lines, a running time
 * whose band across the top of the card turns amber then red (with a word), and one tap to move
 * each order on. Cards in a row are the same height, so their buttons line up along the bottom.
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
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {view === 'cooking' ? 'Nothing to cook right now' : 'Nothing waiting to go out'}
            </Text>
            <Text style={styles.emptyHint}>
              {view === 'cooking'
                ? 'Orders show up here as soon as they can be cooked.'
                : 'Orders marked ready wait here until they’re handed over.'}
            </Text>
          </View>
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
                style={[styles.card, cardWidth ? { width: cardWidth } : styles.cardFallback]}
              >
                <View
                  style={[
                    styles.cardHead,
                    late === 'amber' && styles.headAmber,
                    late === 'red' && styles.headRed,
                  ]}
                >
                  <Text style={styles.number}>{order.display_number}</Text>
                  <Text style={styles.source} numberOfLines={1}>
                    {kindLabel(order)}
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
                      <View key={line.id} style={styles.lineRow}>
                        <Text style={styles.qty}>{line.quantity}×</Text>
                        <View style={styles.grow}>
                          <Text style={styles.line}>
                            {line.name}
                            {line.variant_name ? ` (${line.variant_name})` : ''}
                          </Text>
                          {extras ? <Text style={styles.extras}>{extras}</Text> : null}
                          {line.note ? <Text style={styles.lineNote}>“{line.note}”</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                  {order.note ? <Text style={styles.lineNote}>{order.note}</Text> : null}
                </View>
                {next && (
                  <View style={styles.cardFoot}>
                    <Button
                      label={next}
                      onPress={() => void step(order)}
                      busy={busyId === order.id}
                    />
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => ({
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
  grow: { flex: 1 },
  empty: { width: '100%', alignItems: 'center', gap: 6, paddingTop: 96 },
  emptyTitle: { fontFamily: font.medium, fontSize: 20, color: colors.text2 },
  emptyHint: { fontFamily: font.regular, fontSize: 15, color: colors.muted },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardFallback: { width: '48%' },
  /** The band says how long it's been: grey, then amber, then red, always with a word. */
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    backgroundColor: colors.track,
  },
  headAmber: { backgroundColor: colors.amberBg },
  headRed: { backgroundColor: colors.redTint },
  number: { fontFamily: font.monoMedium, fontSize: 36, lineHeight: 44, color: colors.ink },
  source: { flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.text2 },
  time: { alignItems: 'flex-end' },
  minutes: { fontFamily: font.monoMedium, fontSize: 22, color: colors.text2 },
  lateWord: { fontFamily: font.semibold, fontSize: 14 },
  amberText: { color: colors.amberInk },
  redText: { color: colors.redInk },
  lines: { gap: 10, paddingHorizontal: space.md, paddingTop: 14, paddingBottom: space.md },
  lineRow: { flexDirection: 'row', gap: 10 },
  qty: {
    minWidth: 34,
    fontFamily: font.monoMedium,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
  line: { fontFamily: font.medium, fontSize: 20, lineHeight: 26, color: colors.ink },
  /** Pushed to the bottom, so the buttons of a row of cards line up. */
  cardFoot: { marginTop: 'auto', paddingHorizontal: space.md, paddingBottom: space.md },
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
}));
