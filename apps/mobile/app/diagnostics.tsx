import { open } from '@op-engineering/op-sqlite';
import { useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import EscPosBluetooth, {
  type PairedPrinter,
} from '../modules/escpos-bt/src/EscPosBluetoothModule';
import PlateraaCrypto from '../modules/plateraa-crypto/src/PlateraaCryptoModule';
import { Receipt } from '../src/printing/escpos';
import { Button } from '../src/ui/Button';
import { Header } from '../src/ui/Header';
import { colors, font, radii, space, text } from '../src/ui/theme';

/**
 * Tablet check: the day-1 test (plan.md §1.2), kept for trying a new tablet or printer. Does
 * the local database, the offline PIN check and Bluetooth printing work on this device?
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
  await db.execute('DROP TABLE spike_orders');
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
    .text('Printer test')
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

export default function TabletCheck() {
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
      <View style={styles.actions}>
        <Header title="Tablet check" />
        <Text style={styles.meta}>
          Android {String(Platform.Version)} · {Math.round(width)} × {Math.round(height)} dp
        </Text>
        <Button
          label="1. Local database"
          disabled={busy}
          onPress={run('Local database', () => testDatabase(append))}
        />
        <Button
          label="2. PIN check"
          disabled={busy}
          onPress={run('PIN check', () => testPin(append))}
        />
        <Button label="3. Find printers" disabled={busy} onPress={findPrinters} />
        {printers.map((printer) => (
          <Button
            key={printer.address}
            label={`Print a test on ${printer.name}`}
            kind="secondary"
            disabled={busy}
            onPress={printOn(printer)}
          />
        ))}
      </View>
      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {log.length === 0 ? (
          <Text style={styles.hint}>Run the checks on the left. Results appear here.</Text>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.ground,
    padding: space.lg,
    gap: space.lg,
  },
  actions: { width: '38%', gap: space.md },
  meta: { fontFamily: font.regular, fontSize: text.small, color: colors.muted },
  log: { flex: 1, backgroundColor: colors.canvas, borderRadius: radii.xl },
  logContent: { padding: space.lg, gap: space.sm },
  hint: { fontFamily: font.regular, fontSize: text.body, color: colors.muted },
  logLine: { fontFamily: font.mono, fontSize: text.small, color: colors.ink },
});
