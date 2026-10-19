import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/controls';
import { cedis, colors, font, radii, space, text, themedStyles } from '../ui/theme';
import { changeQuantity, priceTicket, removeLine, type TicketLine } from './ticket';

/**
 * The lines of the order being typed in. Each is one short row (how many, the name and its
 * extras, the price), so an 8" tablet shows a whole order at once. The line last touched (just
 * added, or tapped again on the menu) opens to − n +, Change and Remove; tapping any line opens it.
 */
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
  const [open, setOpen] = useState<string | null>(null);
  const [seen, setSeen] = useState(lines);
  // A line that is new, or whose quantity changed from the menu, opens, so its controls are
  // where the person's attention already is. Worked out while drawing, not in an effect, so the
  // line never shows closed for a frame first.
  if (seen !== lines) {
    const before = new Map(seen.map((line) => [line.lineId, line.quantity]));
    let touched: string | null = null;
    for (const line of lines) if (before.get(line.lineId) !== line.quantity) touched = line.lineId;
    setSeen(lines);
    if (touched) setOpen(touched);
  }

  if (!lines.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No items yet</Text>
        <Text style={styles.emptyHint}>Tap the menu to start an order.</Text>
      </View>
    );
  }
  const priced = priceTicket(lines).lines;
  return (
    <View>
      {lines.map((line, index) => {
        const isOpen = line.lineId === open;
        const name = line.variantName ? `${line.name} (${line.variantName})` : line.name;
        const extras = line.modifiers
          .map((m) => (m.quantity > 1 ? `+ ${m.name} ×${m.quantity}` : `+ ${m.name}`))
          .join(', ');
        const total = cedis(priced[index]!.lineTotal);
        return (
          <View
            key={line.lineId}
            style={[
              styles.line,
              (isOpen || lines[index + 1]?.lineId === open || index === lines.length - 1) &&
                styles.noRule,
              isOpen && styles.lineOpen,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${line.quantity} ${name}, ${total}`}
              accessibilityHint={isOpen ? undefined : 'Shows quantity, change and remove'}
              onPress={() => setOpen(isOpen ? null : line.lineId)}
              style={styles.top}
            >
              <Text style={[styles.qty, line.quantity > 1 && styles.qtyMany]}>
                {line.quantity}×
              </Text>
              <View style={styles.names}>
                <Text style={styles.name}>{name}</Text>
                {extras ? <Text style={styles.extras}>{extras}</Text> : null}
              </View>
              <Text style={styles.price}>{total}</Text>
            </Pressable>
            {isOpen && (
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
                {/* The whole line in one tap, however many there are. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.name}`}
                  onPress={() => onLines((current) => removeLine(current, line.lineId))}
                  style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
                >
                  <Text style={styles.removeLabel}>Remove</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: space.xl },
  emptyTitle: { fontFamily: font.medium, fontSize: text.body, color: colors.text2 },
  emptyHint: { fontFamily: font.regular, fontSize: text.small, color: colors.muted },
  line: {
    marginHorizontal: -12,
    paddingHorizontal: 12,
    borderRadius: radii.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  /** No rule under the last line, nor around the open one, which has its own ground. */
  noRule: { borderBottomColor: 'transparent' },
  lineOpen: { backgroundColor: colors.ground, paddingBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 },
  qty: {
    minWidth: 26,
    fontFamily: font.mono,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
  },
  qtyMany: { fontFamily: font.monoMedium, color: colors.ink },
  names: { flex: 1, gap: 2 },
  name: { fontFamily: font.medium, fontSize: text.body, lineHeight: 21, color: colors.ink },
  extras: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  price: { fontFamily: font.monoMedium, fontSize: 15, lineHeight: 21, color: colors.ink },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  remove: {
    marginLeft: 'auto',
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    justifyContent: 'center',
  },
  removePressed: { backgroundColor: colors.redTint },
  removeLabel: { fontFamily: font.medium, fontSize: 15, color: colors.redInk },
}));
