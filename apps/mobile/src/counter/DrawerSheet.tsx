import { pesewas, type Pesewas } from '@plateraa/shared';
import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { problemText } from '../tablet/api';
import { Button } from '../ui/Button';
import { CloseButton, Overlay } from '../ui/Sheet';
import { cedis, colors, font, space } from '../ui/theme';
import { amountOf } from './amounts';
import { AmountDisplay, Keypad } from './Keypad';

/**
 * The start of the day: count the float into the drawer at unlock, not in the middle of the
 * first sale. "Not now" skips it; the first cash sale then asks instead.
 */
export function DrawerSheet({
  visible,
  onOpen,
  onSkip,
}: {
  visible: boolean;
  onOpen: (float: Pesewas) => Promise<void>;
  onSkip: () => void;
}) {
  const { width } = useWindowDimensions();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const float = amountOf(typed) ?? pesewas(0);

  const open = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onOpen(float);
      setTyped('');
    } catch (error) {
      setProblem(problemText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay visible={visible} onClose={onSkip} width={Math.min(640, width - 48)} height="auto">
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.title}>Open the cash drawer</Text>
          <CloseButton onPress={onSkip} />
        </View>
        <Text style={styles.body}>
          Count the cash in the drawer before the first sale. That's the float the day starts with.
        </Text>
        <View style={styles.row}>
          <View style={styles.side}>
            <AmountDisplay label="Cash in the drawer" typed={typed} />
          </View>
          <Keypad value={typed} onChange={setTyped} />
        </View>
        {problem && <Text style={styles.problem}>{problem}</Text>}
        <View style={styles.actions}>
          <Button label="Not now" kind="secondary" onPress={onSkip} disabled={busy} />
          <Button
            label={`Open the drawer with ${cedis(float)}`}
            onPress={() => void open()}
            busy={busy}
            grow
          />
        </View>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: 28, gap: 20 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: font.semibold, fontSize: 20, color: colors.ink },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.muted },
  row: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  side: { flex: 1 },
  problem: { fontFamily: font.medium, fontSize: 15, color: colors.redInk },
  actions: { flexDirection: 'row', gap: space.sm },
});
