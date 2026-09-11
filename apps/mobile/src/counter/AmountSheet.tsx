import { pesewas, type Pesewas } from '@plateraa/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { problemText } from '../tablet/api';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { CloseButton, Overlay } from '../ui/Sheet';
import { colors, font, space } from '../ui/theme';
import { amountOf } from './amounts';
import { AmountDisplay, Keypad } from './Keypad';

/** A cash amount typed on the keypad: the float, cash taken out or put in, or the count at close. */
export function AmountSheet({
  visible,
  title,
  body,
  amountLabel,
  action,
  cancelLabel = 'Cancel',
  allowZero = false,
  notePlaceholder,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  amountLabel: string;
  /** The main button's words for the amount typed. */
  action: (amount: Pesewas) => string;
  cancelLabel?: string;
  /** Nothing is a valid answer (an empty drawer), as long as 0 is typed on purpose. */
  allowZero?: boolean;
  /** Shows an optional reason field, with this example in it. */
  notePlaceholder?: string;
  onSubmit: (amount: Pesewas, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTyped('');
    setNote('');
    setProblem(null);
  }, [visible]);

  const amount = amountOf(typed) ?? pesewas(0);
  const ready = amount > 0 || (allowZero && typed !== '');

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onSubmit(amount, note.trim());
    } catch (error) {
      setProblem(problemText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay visible={visible} onClose={onClose} width={Math.min(640, width - 48)} height="auto">
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          <CloseButton onPress={onClose} />
        </View>
        <Text style={styles.body}>{body}</Text>
        <View style={styles.row}>
          <View style={styles.side}>
            <AmountDisplay label={amountLabel} typed={typed} />
            {notePlaceholder !== undefined && (
              <Field
                label="Reason"
                optional
                value={note}
                onChangeText={setNote}
                placeholder={notePlaceholder}
                maxLength={200}
              />
            )}
          </View>
          <Keypad value={typed} onChange={setTyped} />
        </View>
        {problem && <Text style={styles.problem}>{problem}</Text>}
        <View style={styles.actions}>
          <Button label={cancelLabel} kind="secondary" onPress={onClose} disabled={busy} />
          <Button
            label={action(amount)}
            onPress={() => void submit()}
            busy={busy}
            disabled={!ready}
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
  side: { flex: 1, gap: space.md },
  problem: { fontFamily: font.medium, fontSize: 15, color: colors.redInk },
  actions: { flexDirection: 'row', gap: space.sm },
});
