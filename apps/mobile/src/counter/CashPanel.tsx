import { formatCedis, parseCedis, pesewas, sub, type Pesewas } from '@plateraa/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { Choice } from '../ui/Choice';
import { Field } from '../ui/Field';
import { colors, space, text } from '../ui/theme';

const NOTES = [500, 1000, 2000, 5000, 10000, 20000].map(pesewas);

/** Cash handed over, and the change to give. "Exact" or a note, then "Cash received". */
export function CashPanel({
  due,
  busy,
  onPaid,
}: {
  due: Pesewas;
  busy: boolean;
  onPaid: (tendered: Pesewas) => void;
}) {
  const [typed, setTyped] = useState('');
  const [tendered, setTendered] = useState<Pesewas | null>(null);
  const notes = NOTES.filter((note) => note > due).slice(0, 3);
  const amount = tendered ?? (typed.trim() ? parseCedis(typed) : null);
  const short = amount !== null && amount < due;

  const pick = (value: Pesewas) => {
    setTendered(value);
    setTyped('');
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.due}>To pay: {formatCedis(due)}</Text>
      <View style={styles.row}>
        <Choice label="Exact" selected={tendered === due} onPress={() => pick(due)} />
        {notes.map((note) => (
          <Choice
            key={note}
            label={formatCedis(note)}
            selected={tendered === note}
            onPress={() => pick(note)}
          />
        ))}
      </View>
      <Field
        label="Or type what they handed over (GH₵)"
        value={typed}
        onChangeText={(value) => {
          setTyped(value);
          setTendered(null);
        }}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      {amount !== null && !short && (
        <Text style={styles.change}>Change: {formatCedis(sub(amount, due))}</Text>
      )}
      {short && <Text style={styles.short}>That's less than {formatCedis(due)}.</Text>}
      {typed.trim() && amount === null && <Text style={styles.short}>That isn't an amount.</Text>}
      <Button
        label="Cash received"
        onPress={() => {
          if (amount !== null && !short) onPaid(amount);
        }}
        disabled={amount === null || short}
        busy={busy}
      />
    </View>
  );
}

/** Opening the drawer: the float counted into it before the first cash sale. */
export function DrawerPanel({ busy, onOpen }: { busy: boolean; onOpen: (float: Pesewas) => void }) {
  const [typed, setTyped] = useState('');
  const amount = parseCedis(typed.trim() || '0');
  return (
    <View style={styles.panel}>
      <Text style={styles.body}>
        Count the cash in the drawer before the first cash sale. That's the float it starts with.
      </Text>
      <Field
        label="Cash in the drawer now (GH₵)"
        value={typed}
        onChangeText={setTyped}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      {amount === null && <Text style={styles.short}>That isn't an amount.</Text>}
      <Button
        label="Open the drawer"
        onPress={() => {
          if (amount !== null) onOpen(amount);
        }}
        disabled={amount === null}
        busy={busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md },
  due: { fontSize: text.title, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  change: { fontSize: text.title, fontWeight: '700', color: colors.infoInk },
  short: { fontSize: text.body, fontWeight: '600', color: colors.dangerInk },
  body: { fontSize: text.body, color: colors.muted },
});
