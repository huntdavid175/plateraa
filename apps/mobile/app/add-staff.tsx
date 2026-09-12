import { pinProblem } from '@plateraa/shared';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addStaffAtCounter, problemText } from '../src/tablet/api';
import { useEngineState, useTablet } from '../src/tablet/TabletProvider';
import { Button } from '../src/ui/Button';
import { Field, Label, digitsOnly } from '../src/ui/Field';
import { Header } from '../src/ui/Header';
import { colors, font, radii, space, text } from '../src/ui/theme';

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
      <View style={styles.card}>
        <View style={styles.column}>
          <Field label="Their name" value={name} onChangeText={setName} maxLength={60} />
          <Label text="What they do" />
          {choices.map((choice) => {
            const on = role === choice.role;
            return (
              <Pressable
                key={choice.role}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setRole(choice.role)}
                style={[styles.choice, on && styles.choiceOn]}
              >
                <Text style={[styles.choiceLabel, on && styles.choiceLabelOn]}>{choice.label}</Text>
                <Text style={styles.choiceHint}>{choice.hint}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.column}>
          <Field
            label="Their new PIN (6 digits)"
            value={pin}
            onChangeText={(value) => setPin(digitsOnly(value))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            mono
          />
          <Field
            label="Their PIN again"
            value={pinAgain}
            onChangeText={(value) => setPinAgain(digitsOnly(value))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            mono
          />
          <Field
            label={`Your PIN, ${staff?.displayName ?? ''}, to confirm`}
            value={myPin}
            onChangeText={(value) => setMyPin(digitsOnly(value))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            mono
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
    fontFamily: font.medium,
    fontSize: text.body,
    color: colors.amberInk,
    backgroundColor: colors.amberBg,
    borderRadius: radii.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  card: {
    flexDirection: 'row',
    gap: space.xl,
    padding: 28,
    borderRadius: radii.xl,
    backgroundColor: colors.canvas,
  },
  column: { flex: 1, gap: space.md },
  choice: {
    minHeight: 64,
    justifyContent: 'center',
    gap: 2,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.field,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  choiceOn: { borderWidth: 2, borderColor: colors.brand, backgroundColor: colors.brandTint },
  choiceLabel: { fontFamily: font.semibold, fontSize: text.body, color: colors.ink },
  choiceLabelOn: { color: colors.brandInk },
  choiceHint: { fontFamily: font.regular, fontSize: text.small, color: colors.muted },
  problem: { fontFamily: font.medium, fontSize: text.body, color: colors.redInk },
  done: { fontFamily: font.medium, fontSize: text.body, color: colors.goodInk },
});
