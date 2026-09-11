import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/controls';
import { cedis, colors, font, space, text } from '../ui/theme';
import { changeQuantity, priceTicket, type TicketLine } from './ticket';

/** The lines of the order being typed in: name, extras, price, and − n +. */
export function TicketLines({
  lines,
  onLines,
  canChange,
  onChange,
}: {
  lines: TicketLine[];
  onLines: (update: (lines: TicketLine[]) => TicketLine[]) => void;
  /** Whether a line's item has sizes or extras to change. */
  canChange: (line: TicketLine) => boolean;
  onChange: (line: TicketLine) => void;
}) {
  if (!lines.length) {
    return <Text style={styles.empty}>No items yet. Tap the menu.</Text>;
  }
  const priced = priceTicket(lines).lines;
  return (
    <View>
      {lines.map((line, index) => {
        const extras = line.modifiers
          .map((m) => (m.quantity > 1 ? `+ ${m.name} ×${m.quantity}` : `+ ${m.name}`))
          .join(', ');
        return (
          <View
            key={line.lineId}
            style={[styles.line, index === lines.length - 1 && styles.lastLine]}
          >
            <View style={styles.top}>
              <View style={styles.names}>
                <Text style={styles.name}>
                  {line.name}
                  {line.variantName ? ` (${line.variantName})` : ''}
                </Text>
                {extras ? <Text style={styles.extras}>{extras}</Text> : null}
              </View>
              <Text style={styles.price}>{cedis(priced[index]!.lineTotal)}</Text>
            </View>
            <View style={styles.controls}>
              <Stepper
                value={line.quantity}
                onChange={(quantity) =>
                  onLines((current) =>
                    changeQuantity(current, line.lineId, quantity - line.quantity),
                  )
                }
              />
              {canChange(line) && (
                <Button label="Change" kind="ghost" size="md" onPress={() => onChange(line)} />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontFamily: font.regular,
    fontSize: text.small,
    color: colors.faint,
    paddingVertical: space.xl,
    textAlign: 'center',
  },
  line: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 10,
  },
  lastLine: { borderBottomWidth: 0 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  names: { flex: 1, gap: 3 },
  name: { fontFamily: font.medium, fontSize: text.body, color: colors.ink },
  extras: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  price: { fontFamily: font.monoMedium, fontSize: 15, color: colors.ink },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
