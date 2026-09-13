import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { METHOD_LABELS, TYPE_LABELS } from '../src/counter/words';
import {
  ApiProblem,
  NO_SALES_ACCESS,
  daySummaryAtCounter,
  fetchDaySummary,
  problemText,
  type DaySummary,
} from '../src/tablet/api';
import { useEngineState, useTablet } from '../src/tablet/TabletProvider';
import { Button } from '../src/ui/Button';
import { Field, Label, digitsOnly } from '../src/ui/Field';
import { Header } from '../src/ui/Header';
import { cedis, colors, font, plural, radii, space, text } from '../src/ui/theme';

interface Session {
  token: string;
  expiresAt: string;
}

/**
 * Today's sales at the counter (plan.md §2.4, §3.2): the day summary the dashboard shows, for
 * whoever the owner lets see sales. They type their PIN again, so someone else at an unlocked
 * tablet can't look. The figures come from the server and live only in this screen's memory:
 * never in the tablet's database, and gone when it locks, when the app goes to the background,
 * or when the 15-minute server session runs out.
 */
export default function Today() {
  const { staff, device, engine } = useTablet();
  const state = useEngineState(engine);
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const forget = useCallback(() => {
    setSession(null);
    setDay(null);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (app) => {
      if (app !== 'active') forget();
    });
    return () => subscription.remove();
  }, [forget]);

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(forget, Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [session, forget]);

  const show = async () => {
    if (!staff || !device) return;
    if (!/^\d{6}$/.test(pin)) {
      setProblem('Type your 6-digit PIN');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const result = await daySummaryAtCounter({
        deviceToken: device.token,
        staffId: staff.id,
        pin,
      });
      setSession(result.session);
      setDay(result.summary);
    } catch (error) {
      setProblem(problemText(error));
    } finally {
      setPin('');
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!session || !device) return;
    setBusy(true);
    setProblem(null);
    try {
      setDay(await fetchDaySummary(device.token, session.token));
    } catch (error) {
      if (error instanceof ApiProblem && (error.status === 401 || error.status === 403)) {
        forget();
        setProblem(error.status === 403 ? NO_SALES_ACCESS : 'Type your PIN again to carry on.');
      } else {
        setProblem(problemText(error));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Header title="Today's sales" />
      {state?.connection === 'offline' && (
        <Text style={styles.warning}>
          Today's figures come from the server, so they need the internet.
        </Text>
      )}

      {day ? (
        <Figures
          day={day}
          waiting={state?.pending ?? 0}
          busy={busy}
          onRefresh={refresh}
          onDone={() => {
            forget();
            router.back();
          }}
        />
      ) : (
        <View style={styles.card}>
          <Text style={styles.title}>Type your PIN to see today's figures</Text>
          <Text style={styles.meta}>
            Only people the owner lets see sales totals can. The figures show here while this screen
            is open, and aren't kept on the tablet.
          </Text>
          <Field
            label={`Your PIN, ${staff?.displayName ?? ''}`}
            value={pin}
            onChangeText={(value) => setPin(digitsOnly(value))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            mono
          />
          <Button label="Show today's figures" onPress={show} busy={busy} />
        </View>
      )}

      {problem && <Text style={styles.problem}>{problem}</Text>}
    </ScrollView>
  );
}

function Figures({
  day,
  waiting,
  busy,
  onRefresh,
  onDone,
}: {
  day: DaySummary;
  waiting: number;
  busy: boolean;
  onRefresh: () => void;
  onDone: () => void;
}) {
  return (
    <>
      <View style={styles.metrics}>
        <Metric
          label="Money in"
          value={cedis(day.moneyIn)}
          detail={plural(day.orders, 'order')}
          accent
        />
        <Metric
          label="Not yet collected"
          value={cedis(day.notYetCollected)}
          detail={
            day.platformOwed > 0
              ? `${cedis(day.platformOwed)} from Bolt and Chowdeck`
              : day.unpaid > 0
                ? 'Unpaid orders'
                : 'Nothing owed'
          }
        />
        <Metric
          label="Money out"
          value={cedis(day.moneyOut)}
          detail={`What's left: ${cedis(day.left)}`}
        />
        <Metric
          label="Profit today"
          value={cedis(day.profit)}
          detail={day.commissionEstimate > 0 ? 'After expenses and commission' : 'After expenses'}
        />
      </View>

      {waiting > 0 && (
        <Text style={styles.warning}>
          This tablet has {plural(waiting, 'change')} still to upload. They're not in these figures
          yet.
        </Text>
      )}

      <View style={styles.columns}>
        <View style={[styles.card, styles.column]}>
          <Label text="Dine-in, pickup and delivery" />
          {day.byType.length === 0 && <Text style={styles.none}>No orders yet today.</Text>}
          {day.byType.map((row) => (
            <Line
              key={row.type}
              label={`${TYPE_LABELS[row.type]} · ${plural(row.orders, 'order')}`}
              value={cedis(row.sales)}
            />
          ))}
        </View>
        <View style={[styles.card, styles.column]}>
          <Label text="How they paid" />
          {day.byMethod.length === 0 && <Text style={styles.none}>No payments yet today.</Text>}
          {day.byMethod.map((row) => (
            <Line key={row.method} label={METHOD_LABELS[row.method]} value={cedis(row.amount)} />
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Button label="Refresh" kind="secondary" size="md" grow busy={busy} onPress={onRefresh} />
        <Button label="Done" kind="secondary" size="md" grow onPress={onDone} />
      </View>
    </>
  );
}

function Metric({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.metric, accent && styles.metricAccent]}>
      <Label text={label} />
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
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
    backgroundColor: colors.canvas,
    borderRadius: radii.xl,
    padding: space.lg,
    gap: 12,
  },
  title: { fontFamily: font.semibold, fontSize: text.heading, color: colors.ink },
  meta: { fontFamily: font.regular, fontSize: text.body, lineHeight: 23, color: colors.text2 },
  metrics: { flexDirection: 'row', gap: space.md },
  metric: {
    flex: 1,
    gap: 6,
    backgroundColor: colors.canvas,
    borderRadius: radii.xl,
    padding: space.lg,
  },
  metricAccent: { backgroundColor: colors.brandTint },
  metricValue: { fontFamily: font.monoMedium, fontSize: 24, color: colors.ink },
  metricValueAccent: { color: colors.brandInk },
  detail: { fontFamily: font.regular, fontSize: text.small, color: colors.muted },
  columns: { flexDirection: 'row', gap: space.md },
  column: { flex: 1 },
  none: { fontFamily: font.regular, fontSize: text.body, color: colors.muted },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  lineLabel: { flex: 1, fontFamily: font.medium, fontSize: text.body, color: colors.ink },
  lineValue: { fontFamily: font.monoMedium, fontSize: text.body, color: colors.ink },
  actions: { flexDirection: 'row', gap: space.sm },
  problem: { fontFamily: font.medium, fontSize: text.body, color: colors.redInk },
});
