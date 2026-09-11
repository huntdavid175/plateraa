import type { Role } from '@plateraa/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import PlateraaCrypto from '../modules/plateraa-crypto/src/PlateraaCryptoModule';
import { checkPin, pinMessage } from '../src/tablet/pin-guard';
import { useLocalQuery, useTablet } from '../src/tablet/TabletProvider';
import { PinPad } from '../src/ui/PinPad';
import { SyncBanner } from '../src/ui/SyncBanner';
import { colors, radius, space, text } from '../src/ui/theme';

interface Person {
  id: string;
  display_name: string;
  role: Role;
  pin_verifier: string | null;
}

const ROLE_NAMES: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
  RIDER: 'Rider',
};

const verifyPin = (verifier: string, pin: string) => PlateraaCrypto.verifyPinAsync(verifier, pin);

/** The PIN switcher: tap your name, type your PIN. Checked on the tablet, so it works offline. */
export default function LockScreen() {
  const { db, device, unlock } = useTablet();
  const people = useLocalQuery<Person>(
    `SELECT id, display_name, role, pin_verifier FROM staff WHERE active = 1
      ORDER BY CASE role WHEN 'OWNER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END, display_name`,
  );
  const [chosen, setChosen] = useState<Person | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const choose = (person: Person) => {
    setChosen(person);
    setMessage(null);
    setAttempt((count) => count + 1);
  };

  const tryPin = async (pin: string) => {
    if (!db || !chosen) return;
    setChecking(true);
    try {
      const result = await checkPin(db, chosen.id, pin, verifyPin);
      if (result.ok) {
        unlock({ id: chosen.id, displayName: chosen.display_name, role: chosen.role });
        return;
      }
      setMessage(pinMessage(result));
    } catch (error) {
      console.warn('PIN check failed', error);
      setMessage("Couldn't check the PIN. Try again.");
    } finally {
      setChecking(false);
      setAttempt((count) => count + 1);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.people}>
        <Text style={styles.business}>{device?.businessName}</Text>
        <Text style={styles.title}>Who's at the counter?</Text>
        {people === null ? (
          <ActivityIndicator color={colors.ink} />
        ) : people.length === 0 ? (
          <Text style={styles.hint}>The staff list appears once the tablet has synced.</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.tiles}>
            {people.map((person) => {
              const selected = chosen?.id === person.id;
              const hasPin = Boolean(person.pin_verifier);
              return (
                <Pressable
                  key={person.id}
                  accessibilityRole="button"
                  onPress={() => choose(person)}
                  disabled={!hasPin}
                  style={({ pressed }) => [
                    styles.tile,
                    selected && styles.tileSelected,
                    (pressed || !hasPin) && styles.tileDimmed,
                  ]}
                >
                  <Text style={[styles.tileName, selected && styles.selectedText]}>
                    {person.display_name}
                  </Text>
                  <Text style={[styles.tileRole, selected && styles.selectedText]}>
                    {hasPin ? ROLE_NAMES[person.role] : 'No PIN yet'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <SyncBanner />
        <Link href="/diagnostics" style={styles.link}>
          Tablet check
        </Link>
      </View>

      <View style={styles.pinSide}>
        {chosen ? (
          <>
            <Text style={styles.pinTitle}>{chosen.display_name}, enter your PIN</Text>
            <PinPad onComplete={tryPin} disabled={checking} resetKey={attempt} />
            <View style={styles.messageRow}>
              {checking ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                message && <Text style={styles.message}>{message}</Text>
              )}
            </View>
          </>
        ) : (
          <Text style={styles.hint}>Tap your name to unlock the tablet.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    gap: space.xl,
    padding: space.xl,
    backgroundColor: colors.ground,
  },
  people: { flex: 1, gap: space.md },
  business: { fontSize: text.body, color: colors.muted, fontWeight: '600' },
  title: { fontSize: text.title, fontWeight: '700', color: colors.ink },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    width: '47%',
    minHeight: 80,
    justifyContent: 'center',
    borderRadius: radius,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.line,
    paddingHorizontal: space.md,
  },
  tileSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  tileDimmed: { opacity: 0.55 },
  tileName: { fontSize: text.heading, fontWeight: '700', color: colors.ink },
  tileRole: { fontSize: text.small, color: colors.muted },
  selectedText: { color: colors.onInk },
  link: { fontSize: text.small, color: colors.muted, textDecorationLine: 'underline' },
  pinSide: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  pinTitle: { fontSize: text.heading, fontWeight: '700', color: colors.ink },
  messageRow: { minHeight: 48, justifyContent: 'center' },
  message: {
    fontSize: text.body,
    color: colors.dangerInk,
    fontWeight: '600',
    textAlign: 'center',
  },
  hint: { fontSize: text.body, color: colors.muted },
});
