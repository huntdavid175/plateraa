import { pinProblem } from '@plateraa/shared';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addStaffAtCounter, problemText } from '../src/tablet/api';
import { useEngineState, useTablet } from '../src/tablet/TabletProvider';
import { Button } from '../src/ui/Button';
import { Field, digitsOnly } from '../src/ui/Field';
import { Header } from '../src/ui/Header';
import { colors, radius, space, text } from '../src/ui/theme';

type NewRole = 'STAFF' | 'RIDER' | 'MANAGER';

const ROLES: { role: NewRole; label: string; hint: string }[] = [
  { role: 'STAFF', label: 'Staff', hint: 'Takes orders and payments, runs the drawer' },
  { role: 'RIDER', label: 'Rider', hint: 'Delivers orders' },
  { role: 'MANAGER', label: 'Manager', hint: 'Can also add staff, and use the dashboard' },
];

/**
 * An owner or manager adds someone at the counter (aim: under a minute). Online only, because
 * the server keeps the PIN; they appear on the lock screen as soon as the tablet syncs.
 */
export default function AddStaff() {
  const { staff, device, engine } = useTablet();
  const state = useEngineState(engine);
  const [name, setName] = useState('');
  const [role, setRole] = useState<NewRole>('STAFF');
  const [pin, setPin] = useState('');
  const [pinAgain, setPinAgain] = useState('');
  const [myPin, setMyPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  // Only the owner can add managers.
  const choices = ROLES.filter((choice) => choice.role !== 'MANAGER' || staff?.role === 'OWNER');

  const submit = async () => {
    if (!staff || !device) return;
    const displayName = name.trim();
    const issue = !displayName
      ? 'Type their name'
      : (pinProblem(pin) ??
        (pin !== pinAgain
          ? "The two PINs don't match"
          : !/^\d{6}$/.test(myPin)
            ? 'Enter your own PIN to confirm'
            : null));
    if (issue) {
      setProblem(issue);
      return;
    }

    setBusy(true);
    setProblem(null);
    setAdded(null);
    try {
      await addStaffAtCounter({
        deviceToken: device.token,
        managerId: staff.id,
        managerPin: myPin,
        person: { displayName, role, pin },
      });
      await engine?.syncNow();
      setAdded(displayName);
      setName('');
      setRole('STAFF');
      setPin('');
      setPinAgain('');
      setMyPin('');
    } catch (error) {
      setProblem(problemText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Header title="Add staff" />
      {state?.connection === 'offline' && (
        <Text style={styles.warning}>
          Adding staff needs the internet. Try again when it's back.
        </Text>
      )}
      <View style={styles.columns}>
        <View style={styles.column}>
          <Field label="Their name" value={name} onChangeText={setName} maxLength={60} />
          <Text style={styles.label}>What they do</Text>
          {choices.map((choice) => (
            <Pressable
              key={choice.role}
              accessibilityRole="radio"
              accessibilityState={{ selected: role === choice.role }}
              onPress={() => setRole(choice.role)}
              style={[styles.choice, role === choice.role && styles.choiceSelected]}
            >
              <Text style={[styles.choiceLabel, role === choice.role && styles.selectedText]}>
                {choice.label}
              </Text>
              <Text style={[styles.choiceHint, role === choice.role && styles.selectedText]}>
                {choice.hint}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.column}>
          <Field
            label="Their new PIN (6 digits)"
            value={pin}
            onChangeText={(value) => setPin(digitsOnly(value))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
          />
          <Field
            label="Their PIN again"
            value={pinAgain}
            onChangeText={(value) => setPinAgain(digitsOnly(value))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
          />
          <Field
            label={`Your PIN, ${staff?.displayName ?? ''}, to confirm`}
            value={myPin}
            onChangeText={(value) => setMyPin(digitsOnly(value))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
          />
          <Button label="Add them" onPress={submit} busy={busy} />
          {problem && <Text style={styles.problem}>{problem}</Text>}
          {added && (
            <Text style={styles.done}>{added} can now unlock the tablet with their PIN.</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, gap: space.md, padding: space.lg, backgroundColor: colors.ground },
  warning: {
    fontSize: text.body,
    color: colors.warningInk,
    backgroundColor: colors.warningBg,
    borderRadius: radius,
    padding: space.md,
  },
  columns: { flexDirection: 'row', gap: space.xl },
  column: { flex: 1, gap: space.md },
  label: { fontSize: text.small, fontWeight: '600', color: colors.muted },
  choice: {
    borderRadius: radius,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: space.md,
  },
  choiceSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  choiceLabel: { fontSize: text.body, fontWeight: '700', color: colors.ink },
  choiceHint: { fontSize: text.small, color: colors.muted },
  selectedText: { color: colors.onInk },
  problem: { fontSize: text.body, color: colors.dangerInk, fontWeight: '600' },
  done: { fontSize: text.body, color: colors.ink, fontWeight: '600' },
});
