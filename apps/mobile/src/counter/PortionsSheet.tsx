import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { problemText } from '../tablet/api';
import { Button } from '../ui/Button';
import { Label } from '../ui/Field';
import { CloseButton, Overlay } from '../ui/Sheet';
import { colors, font, plural, radii, space } from '../ui/theme';
import { Keypad } from './Keypad';

/** The most a count can add at once (the sync command's limit). */
const MAX_PORTIONS = 9_999;

/** "Made 20 more": portions added to today's count for one item. */
export function PortionsSheet({
  item,
  onAdd,
  onClose,
}: {
  item: { name: string; left: number | null } | null;
  onAdd: (quantity: number) => Promise<void>;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setTyped('');
    setProblem(null);
  }, [item]);

  if (!item) return null;
  const quantity = typed ? Number.parseInt(typed, 10) : 0;
  const valid = quantity >= 1 && quantity <= MAX_PORTIONS;

  const add = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onAdd(quantity);
    } catch (error) {
      setProblem(problemText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay visible onClose={onClose} width={Math.min(640, width - 48)} height="auto">
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.title}>Add portions: {item.name}</Text>
          <CloseButton onPress={onClose} />
        </View>
        <Text style={styles.body}>
          {item.left === null
            ? 'Nothing is counted today yet. Enter how many portions were made.'
            : `${item.left} left today. Enter how many more were made; they're added on.`}{' '}
          Each sale counts down, and the item sells out by itself at 0.
        </Text>
        <View style={styles.row}>
          <View style={styles.side}>
            <Label text="Portions made" />
            <Text style={[styles.display, typed ? styles.displayOn : null]}>{typed || '0'}</Text>
            {quantity > MAX_PORTIONS && (
              <Text style={styles.problem}>That's more than 9,999 at once.</Text>
            )}
          </View>
          <Keypad value={typed} onChange={setTyped} whole />
        </View>
        {problem && <Text style={styles.problem}>{problem}</Text>}
        <View style={styles.actions}>
          <Button label="Cancel" kind="secondary" onPress={onClose} disabled={busy} />
          <Button
            label={valid ? `Add ${plural(quantity, 'portion')}` : 'Add portions'}
            onPress={() => void add()}
            busy={busy}
            disabled={!valid}
            grow
          />
        </View>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: 28, gap: 20 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontFamily: font.semibold, fontSize: 20, color: colors.ink },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.muted },
  row: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  side: { flex: 1, gap: 8 },
  display: {
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.field,
    paddingHorizontal: space.md,
    fontFamily: font.monoMedium,
    fontSize: 22,
    lineHeight: 52,
    color: colors.disabled,
  },
  displayOn: { borderColor: colors.brand, color: colors.ink },
  problem: { fontFamily: font.medium, fontSize: 15, color: colors.redInk },
  actions: { flexDirection: 'row', gap: space.sm },
});
