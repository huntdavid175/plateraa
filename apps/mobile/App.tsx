import { open } from '@op-engineering/op-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import EscPosBluetooth, { type PairedPrinter } from './modules/escpos-bt/src/EscPosBluetoothModule';
import PlateraaCrypto from './modules/plateraa-crypto/src/PlateraaCryptoModule';
import { Receipt } from './src/printing/escpos';

/**
 * Day-1 test (plan.md §1.2): does the local database, the offline PIN check and Bluetooth
 * printing work on a real budget tablet? Replaced by the real app in Phase 2.
 */

/** Made with the server's createPinVerifier() algorithm, for PIN 482913. */
const PIN_VERIFIER =
  'pbkdf2-sha256$50000$cGxhdGVyYWEtc3Bpa2Utc2FsdC0wMQ$RcBljlPKWiO6ISgi4lFVgJQDq5xHoMMRryPISGj5it4';

type Log = (line: string) => void;

async function testDatabase(log: Log) {
  const db = open({ name: 'spike.sqlite' });
  await db.execute('DROP TABLE IF EXISTS spike_orders');
  await db.execute('CREATE TABLE spike_orders (id TEXT PRIMARY KEY, total INTEGER NOT NULL)');
  const started = Date.now();
  await db.transaction(async (tx) => {
    for (let i = 0; i < 2000; i++) {
      await tx.execute('INSERT INTO spike_orders (id, total) VALUES (?, ?)', [`order-${i}`, 4500]);
    }
  });
  const took = Date.now() - started;
  const { rows } = await db.execute('SELECT count(*) AS n, sum(total) AS total FROM spike_orders');
  log(`Wrote 2,000 orders in ${took} ms; read back ${rows[0]?.n} rows totalling ${rows[0]?.total}`);
  db.close();
}

async function testPin(log: Log) {
  let started = Date.now();
  const right = await PlateraaCrypto.verifyPinAsync(PIN_VERIFIER, '482913');
  const rightMs = Date.now() - started;
  started = Date.now();
  const wrong = await PlateraaCrypto.verifyPinAsync(PIN_VERIFIER, '111111');
  log(
    `Right PIN ${right ? 'accepted' : 'REFUSED (mismatch with server!)'} in ${rightMs} ms; ` +
      `wrong PIN ${wrong ? 'ACCEPTED (bug!)' : 'refused'} in ${Date.now() - started} ms`,
  );
}

async function allowBluetooth(): Promise<boolean> {
  if (Platform.OS !== 'android' || typeof Platform.Version !== 'number' || Platform.Version < 31) {
    return true;
  }
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function testReceipt(): string {
  return new Receipt()
    .align('center')
    .bold(true)
    .text('PLATERAA')
    .bold(false)
    .text('Day-1 printer test')
    .align('left')
    .divider()
    .row('Jollof rice x2', 'GHS 90.00')
    .row('Sobolo x1', 'GHS 10.00')
    .divider()
    .bold(true)
    .row('TOTAL', 'GHS 100.00')
    .bold(false)
    .text()
    .align('center')
    .text('Thank you!')
    .finish()
    .toBase64();
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const [log, setLog] = useState<string[]>([]);
  const [printers, setPrinters] = useState<PairedPrinter[]>([]);
  const [busy, setBusy] = useState(false);

  const append: Log = (line) =>
    setLog((lines) => [`${new Date().toLocaleTimeString()}  ${line}`, ...lines]);

  const run = (label: string, task: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      append(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const findPrinters = run('Find printers', async () => {
    if (!(await allowBluetooth())) throw new Error('Bluetooth permission was refused');
    const found = await EscPosBluetooth.listBondedAsync();
    setPrinters(found);
    append(
      found.length
        ? `Paired devices: ${found.map((p) => p.name).join(', ')}`
        : 'No paired devices. Pair the printer in Android Bluetooth settings first.',
    );
  });

  const printOn = (printer: PairedPrinter) =>
    run(`Print on ${printer.name}`, async () => {
      await EscPosBluetooth.connectAsync(printer.address);
      await EscPosBluetooth.writeAsync(testReceipt());
      await EscPosBluetooth.disconnectAsync();
      append(`Printed a test receipt on ${printer.name}`);
    });

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.actions}>
        <Text style={styles.title}>Plateraa day-1 test</Text>
        <Text style={styles.meta}>
          Android {String(Platform.Version)} · {Math.round(width)} × {Math.round(height)} dp
        </Text>
        <Action
          label="1. Local database"
          disabled={busy}
          onPress={run('Local database', () => testDatabase(append))}
        />
        <Action
          label="2. PIN check"
          disabled={busy}
          onPress={run('PIN check', () => testPin(append))}
        />
        <Action label="3. Find printers" disabled={busy} onPress={findPrinters} />
        {printers.map((printer) => (
          <Action
            key={printer.address}
            label={`Print test on ${printer.name}`}
            disabled={busy}
            onPress={printOn(printer)}
          />
        ))}
      </View>
      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {log.length === 0 ? (
          <Text style={styles.hint}>Run the three tests on the left. Results appear here.</Text>
        ) : (
          log.map((line, index) => (
            <Text key={index} style={styles.logLine}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Action({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.action, (pressed || disabled) && styles.actionDimmed]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: '#f5f3ee', padding: 24, gap: 24 },
  actions: { width: '38%', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#1d1b16' },
  meta: { fontSize: 14, color: '#6b665c', marginBottom: 8 },
  action: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: '#1d1b16',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  actionDimmed: { opacity: 0.5 },
  actionLabel: { fontSize: 18, fontWeight: '600', color: '#ffffff' },
  log: { flex: 1, backgroundColor: '#ffffff', borderRadius: 12 },
  logContent: { padding: 16, gap: 8 },
  hint: { fontSize: 16, color: '#6b665c' },
  logLine: { fontSize: 15, color: '#1d1b16', fontFamily: 'monospace' },
});
