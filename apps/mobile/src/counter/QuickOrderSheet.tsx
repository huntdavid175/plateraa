import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Button } from '../ui/Button';
import { CloseButton, Overlay } from '../ui/Sheet';
import { colors, font, space } from '../ui/theme';
import { useNow } from './hooks';
import { extrasText, type QueueOrder } from './queue';
import { kitchenSince, minutesSince } from './views';
import { SOURCE_LABELS, nextStepLabel } from './words';

/**
 * An order from the kitchen strip under the menu: what's in it, and one button to move it on,
 * so a one-tablet counter never has to leave the till to mark an order ready.
 */
export function QuickOrderSheet({
  order,
  busy,
  onStep,
  onOpenKitchen,
  onClose,
}: {
  order: QueueOrder | null;
  busy: boolean;
  onStep: (order: QueueOrder) => void;
  onOpenKitchen: () => void;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const now = useNow();
  if (!order) return null;

  const cooking = order.status === 'CONFIRMED' || order.status === 'PREPARING';
  const next = nextStepLabel(order.status, order.type);

  return (
    <Overlay visible onClose={onClose} width={Math.min(480, width - 48)} height="auto">
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.number}>{order.display_number}</Text>
          <View style={styles.meta}>
            <Text style={styles.source}>
              {SOURCE_LABELS[order.source]}
              {order.type === 'DELIVERY'
                ? ' · Delivery'
                : order.type === 'PICKUP'
                  ? ' · Pickup'
                  : ''}
            </Text>
            <Text style={styles.minutes}>
              {cooking
                ? `Cooking for ${minutesSince(kitchenSince(order), now)} min`
                : order.status === 'OUT_FOR_DELIVERY'
                  ? 'Out for delivery'
                  : 'Ready'}
            </Text>
          </View>
          <CloseButton onPress={onClose} />
        </View>
        <View style={styles.lines}>
          {order.lines.map((line) => {
            const extras = extrasText(line);
            return (
              <View key={line.id}>
                <Text style={styles.line}>
                  {line.quantity} × {line.name}
                  {line.variant_name ? ` (${line.variant_name})` : ''}
                </Text>
                {extras ? <Text style={styles.extras}>{extras}</Text> : null}
                {line.note ? <Text style={styles.note}>“{line.note}”</Text> : null}
              </View>
            );
          })}
          {order.note ? <Text style={styles.note}>{order.note}</Text> : null}
        </View>
        {next && <Button label={next} onPress={() => onStep(order)} busy={busy} />}
        <Button label="Open the kitchen view" kind="secondary" size="md" onPress={onOpenKitchen} />
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  number: { fontFamily: font.monoMedium, fontSize: 36, color: colors.ink },
  meta: { flex: 1, gap: 2 },
  source: { fontFamily: font.medium, fontSize: 14, color: colors.muted },
  minutes: { fontFamily: font.mono, fontSize: 14, color: colors.muted },
  lines: { gap: 8, paddingVertical: space.xs },
  line: { fontFamily: font.medium, fontSize: 19, color: colors.ink },
  extras: { fontFamily: font.regular, fontSize: 15, color: colors.muted },
  note: { fontFamily: font.medium, fontSize: 15, color: colors.amberInk },
});
