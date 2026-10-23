import type { Role } from '@brixx/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import logo from '../assets/logo.png';
import BrixxCrypto from '../modules/brixx-crypto/src/BrixxCryptoModule';
import { checkPin, pinMessage } from '../src/tablet/pin-guard';
import { useLocalQuery, useTablet } from '../src/tablet/TabletProvider';
import { initialOf, personColour } from '../src/ui/people';
import { PinPad } from '../src/ui/PinPad';
import { SyncBanner } from '../src/ui/SyncBanner';
import { colors, font, radii, space, text, themedStyles } from '../src/ui/theme';

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

const verifyPin = (verifier: string, pin: string) => BrixxCrypto.verifyPinAsync(verifier, pin);

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
        <View style={styles.brand}>
          <Image source={logo} style={styles.logo} />
          <Text style={styles.business}>{device?.businessName}</Text>
        </View>
        <Text style={styles.title}>Who's at the counter?</Text>
        {people === null ? (
          <ActivityIndicator color={colors.brand} />
        ) : people.length === 0 ? (
          <Text style={styles.hint}>The staff list appears once the tablet has synced.</Text>
        ) : (
          <ScrollView style={styles.grow} contentContainerStyle={styles.rows}>
            {people.map((person) => {
              const selected = chosen?.id === person.id;
              const hasPin = Boolean(person.pin_verifier);
              // Everyone has their own colour: the circle they're known by, and their whole row
              // once they're picked (the user's reference, 16 Sep).
              const colour = personColour(person.id);
              return (
                <Pressable
                  key={person.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: !hasPin }}
                  onPress={() => choose(person)}
                  disabled={!hasPin}
                  style={({ pressed }) => [
                    styles.row,
                    selected && { backgroundColor: colour.tint },
                    pressed && !selected && styles.rowPressed,
                    !hasPin && styles.rowNoPin,
                  ]}
                >
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: selected ? colors.canvas : colour.tint },
                    ]}
                  >
                    <Text style={[styles.initial, { color: colour.ink }]}>
                      {initialOf(person.display_name)}
                    </Text>
                  </View>
                  <View style={styles.rowWords}>
                    <Text
                      style={[styles.rowName, selected && { color: colour.ink }]}
                      numberOfLines={1}
                    >
                      {person.display_name}
                    </Text>
                    <Text style={[styles.rowRole, selected && { color: colour.ink }]}>
                      {hasPin ? ROLE_NAMES[person.role] : 'No PIN yet'}
                    </Text>
                  </View>
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

      <View style={styles.pinCard}>
        {chosen ? (
          <>
            <Text style={styles.pinTitle}>{chosen.display_name}, enter your PIN</Text>
            <PinPad onComplete={tryPin} disabled={checking} resetKey={attempt} />
            <View style={styles.messageRow}>
              {checking ? (
                <ActivityIndicator color={colors.brand} />
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

const styles = themedStyles(() => ({
  screen: {
    flex: 1,
    flexDirection: 'row',
    gap: space.lg,
    padding: space.lg,
    backgroundColor: colors.ground,
  },
  people: { flex: 1, gap: space.md, paddingTop: space.sm },
  grow: { flex: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: { width: 28, height: 28 },
  business: { fontFamily: font.medium, fontSize: text.small, color: colors.muted },
  title: { fontFamily: font.semibold, fontSize: text.title, color: colors.ink },
  rows: { gap: 10 },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.tile,
    paddingHorizontal: 14,
  },
  rowPressed: { backgroundColor: colors.tilePressed },
  rowNoPin: { opacity: 0.5 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: font.semibold, fontSize: 20 },
  rowWords: { flex: 1, gap: 2 },
  rowName: { fontFamily: font.semibold, fontSize: 18, color: colors.ink },
  rowRole: { fontFamily: font.regular, fontSize: text.small, color: colors.muted },
  link: {
    fontFamily: font.medium,
    fontSize: text.small,
    color: colors.muted,
    textDecorationLine: 'underline',
  },
  pinCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.canvas,
  },
  pinTitle: {
    fontFamily: font.semibold,
    fontSize: text.heading,
    color: colors.ink,
    textAlign: 'center',
  },
  messageRow: { minHeight: 48, justifyContent: 'center' },
  message: {
    fontFamily: font.medium,
    fontSize: text.body,
    color: colors.redInk,
    textAlign: 'center',
  },
  hint: { fontFamily: font.regular, fontSize: text.body, color: colors.muted },
}));
