import { pinProblem } from '@plateraa/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SyncEngine } from '../src/offline/engine';
import { resetLocalData } from '../src/offline/schema';
import { ownerApi, problemText, signIn, type Business } from '../src/tablet/api';
import type { DeviceCredentials } from '../src/tablet/credentials';
import { createEngine, localDatabase, useTablet } from '../src/tablet/TabletProvider';
import { Button } from '../src/ui/Button';
import { OptionTile } from '../src/ui/controls';
import { Field, digitsOnly } from '../src/ui/Field';
import { colors, font, radii, space, text } from '../src/ui/theme';

interface Registered {
  session: string;
  business: Business;
  device: DeviceCredentials;
  engine: SyncEngine;
}

type Step =
  | { name: 'sign-in' }
  | { name: 'business'; session: string; businesses: Business[] }
  | { name: 'tablet'; session: string; business: Business }
  | ({ name: 'download' } & Registered)
  | ({ name: 'pin' } & Registered);

/**
 * Setting the tablet up, once: an owner or manager signs in with their email, picks the
 * business, names the tablet, and the menu and staff list download. If they have no PIN yet,
 * they set one here, so they can unlock the tablet straight away.
 */
export default function RegisterScreen() {
  const { completeRegistration } = useTablet();
  const [step, setStep] = useState<Step>({ name: 'sign-in' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tabletName, setTabletName] = useState('Counter');
  const [pin, setPin] = useState('');
  const [pinAgain, setPinAgain] = useState('');

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await task();
    } catch (error) {
      setProblem(problemText(error));
    } finally {
      setBusy(false);
    }
  };

  const submitSignIn = () =>
    run(async () => {
      const session = await signIn(email, password);
      const businesses = await ownerApi(session).businesses();
      setPassword('');
      if (businesses.length === 0) {
        throw new Error(
          "This login doesn't run a business on Plateraa yet. Set the business up first, then register the tablet.",
        );
      }
      setStep(
        businesses.length === 1
          ? { name: 'tablet', session, business: businesses[0]! }
          : { name: 'business', session, businesses },
      );
    });

  const finish = async (current: Registered) => {
    void ownerApi(current.session).signOut();
    await completeRegistration(current.device, current.engine);
  };

  /** Downloads the menu and staff list, then asks for a PIN if the owner has none yet. */
  const download = async (current: Registered) => {
    await current.engine.syncNow();
    if (current.engine.getState().connection !== 'online') {
      setStep({ name: 'download', ...current });
      throw new Error(
        "Couldn't download the menu and staff list. Check the internet connection and try again.",
      );
    }
    const db = await localDatabase();
    const me = await db.get<{ pin_verifier: string | null }>(
      'SELECT pin_verifier FROM staff WHERE id = ?',
      [current.business.staffId],
    );
    if (!me?.pin_verifier) {
      setStep({ name: 'pin', ...current });
      return;
    }
    await finish(current);
  };

  const submitTablet = (session: string, business: Business) =>
    run(async () => {
      const registered = await ownerApi(session).registerDevice(
        business.tenantId,
        tabletName.trim() || 'Counter',
      );
      const device: DeviceCredentials = {
        token: registered.deviceToken,
        deviceId: registered.device.id,
        tenantId: registered.device.tenantId,
        locationId: registered.device.locationId,
        deviceName: registered.device.name,
        deviceCode: registered.device.code,
        businessName: business.name,
      };
      // Nothing from another business or an earlier registration stays on the tablet.
      const db = await localDatabase();
      await resetLocalData(db);
      const engine = createEngine(db, device);
      await engine.init();
      await download({ session, business, device, engine });
    });

  const submitPin = (current: Registered) =>
    run(async () => {
      const issue = pinProblem(pin) ?? (pin !== pinAgain ? "The two PINs don't match" : null);
      if (issue) throw new Error(issue);
      await ownerApi(current.session, current.business.tenantId).setPin(
        current.business.staffId,
        pin,
      );
      setPin('');
      setPinAgain('');
      await download(current);
    });

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text style={styles.title}>Set up this tablet</Text>
        <Text style={styles.body}>
          An owner or manager does this once. After that, staff unlock the tablet with their own
          6-digit PIN, and it keeps working without internet.
        </Text>
      </View>

      <View style={styles.card}>
        {step.name === 'sign-in' && (
          <>
            <Text style={styles.heading}>Sign in with your Plateraa email</Text>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              onSubmitEditing={submitSignIn}
            />
            <Button
              label="Sign in"
              onPress={submitSignIn}
              busy={busy}
              disabled={!email.trim() || !password}
            />
          </>
        )}

        {step.name === 'business' && (
          <>
            <Text style={styles.heading}>Which business is this tablet for?</Text>
            {step.businesses.map((business) => (
              <OptionTile
                key={business.tenantId}
                label={business.name}
                onPress={() => setStep({ name: 'tablet', session: step.session, business })}
              />
            ))}
          </>
        )}

        {step.name === 'tablet' && (
          <>
            <Text style={styles.heading}>Name this tablet for {step.business.name}</Text>
            <Field
              label="Tablet name"
              value={tabletName}
              onChangeText={setTabletName}
              maxLength={60}
            />
            <Button
              label="Register this tablet"
              onPress={() => submitTablet(step.session, step.business)}
              busy={busy}
            />
            {busy && <Text style={styles.hint}>Downloading the menu and staff list…</Text>}
          </>
        )}

        {step.name === 'download' && (
          <>
            <Text style={styles.heading}>The tablet is registered</Text>
            <Button
              label="Try the download again"
              onPress={() => run(() => download(step))}
              busy={busy}
            />
          </>
        )}

        {step.name === 'pin' && (
          <>
            <Text style={styles.heading}>Choose your 6-digit PIN</Text>
            <Text style={styles.hint}>
              You'll use it to unlock this tablet. Avoid easy ones like 123456 or your birth year.
            </Text>
            <Field
              label="PIN"
              value={pin}
              onChangeText={(value) => setPin(digitsOnly(value))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            <Field
              label="PIN again"
              value={pinAgain}
              onChangeText={(value) => setPinAgain(digitsOnly(value))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            <Button label="Save my PIN" onPress={() => submitPin(step)} busy={busy} />
          </>
        )}

        {problem && <Text style={styles.problem}>{problem}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    flexDirection: 'row',
    gap: space.xl,
    padding: space.lg,
    backgroundColor: colors.ground,
  },
  intro: { flex: 1, gap: space.md, paddingTop: space.lg },
  title: { fontFamily: font.semibold, fontSize: text.title, color: colors.ink },
  body: { fontFamily: font.regular, fontSize: text.body, lineHeight: 26, color: colors.muted },
  card: {
    flex: 1.2,
    gap: space.md,
    alignSelf: 'flex-start',
    padding: 28,
    borderRadius: radii.xl,
    backgroundColor: colors.canvas,
  },
  heading: { fontFamily: font.semibold, fontSize: text.heading, color: colors.ink },
  hint: { fontFamily: font.regular, fontSize: text.small, lineHeight: 20, color: colors.muted },
  problem: { fontFamily: font.medium, fontSize: text.body, color: colors.redInk },
});
