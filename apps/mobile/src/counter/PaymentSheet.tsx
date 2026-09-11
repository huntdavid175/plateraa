import { formatCedis, parseCedis, pesewas, sub, type Pesewas } from '@plateraa/shared';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { problemText } from '../tablet/api';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/controls';
import { Label, PhoneField } from '../ui/Field';
import { CloseButton, Overlay } from '../ui/Sheet';
import { cedis, colors, font, radii, space, text } from '../ui/theme';
import { openShiftOf, type Counter } from './actions';
import { LINKS_NOT_ON } from './words';

export interface PaymentSummary {
  number: string;
  lines: { key: string; name: string; detail?: string; quantity: number; total: Pesewas }[];
  total: Pesewas;
}

type Mode = 'cash' | 'link' | 'drawer';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;
const NOTES = [2000, 5000, 10000, 20000].map(pesewas);

/** "105.00" for a keypad display, without floating-point maths. */
const plainAmount = (amount: Pesewas) => formatCedis(amount).replace(/[^\d.]/g, '');

const amountOf = (typed: string) => {
  const trimmed = typed.endsWith('.') ? typed.slice(0, -1) : typed;
  return trimmed ? parseCedis(trimmed) : null;
};

function pressKey(typed: string, key: (typeof KEYS)[number]): string {
  if (key === 'back') return typed.slice(0, -1);
  if (key === '.') return typed.includes('.') ? typed : `${typed || '0'}.`;
  if (typed.includes('.') && typed.split('.')[1]!.length >= 2) return typed;
  if (typed.replace('.', '').length >= 8) return typed;
  if (typed === '0') return key;
  return typed + key;
}

/**
 * Taking the money: the order on the left; on the right, cash (what they handed over, and the
 * change to give) or a payment link. The first cash sale of the day opens the drawer first.
 */
export function PaymentSheet({
  visible,
  onClose,
  counter,
  summary,
  due,
  allowLink,
  phone,
  onCash,
  onLink,
}: {
  visible: boolean;
  onClose: () => void;
  counter: Counter;
  summary: PaymentSummary;
  due: Pesewas;
  allowLink: boolean;
  /** The customer's number from the order column, for a link. */
  phone: string;
  onCash: (tendered: Pesewas, shiftId: string) => Promise<void>;
  onLink: (phone: string) => Promise<void>;
}) {
  const { width, height } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('cash');
  const [typed, setTyped] = useState('');
  const [floatTyped, setFloatTyped] = useState('');
  const [linkPhone, setLinkPhone] = useState(phone);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTyped('');
    setFloatTyped('');
    setLinkPhone(phone);
    setProblem(null);
    void openShiftOf(counter.engine.db, counter.deviceId).then((open) => {
      setShiftId(open);
      setMode(open ? 'cash' : 'drawer');
    });
  }, [visible, phone, counter]);

  const given = amountOf(typed);
  const enough = given !== null && given >= due;
  const floatAmount = amountOf(floatTyped) ?? pesewas(0);

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

  const openDrawer = () =>
    run(async () => {
      const id = counter.engine.newId();
      await counter.engine.record(
        'shift.open',
        { shiftId: id, float: floatAmount },
        counter.staffId,
      );
      setShiftId(id);
      setMode('cash');
    });

  const keypad = (value: string, onChange: (value: string) => void) => (
    <View style={styles.keypad}>
      {KEYS.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={key === 'back' ? 'Delete' : key}
          onPress={() => onChange(pressKey(value, key))}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
        >
          <Text style={styles.keyLabel}>{key === 'back' ? '⌫' : key}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Overlay
      visible={visible}
      onClose={onClose}
      width={Math.min(900, width - 48)}
      height={Math.min(680, height - 48)}
    >
      <View style={styles.sheet}>
        <View style={styles.summary}>
          <View style={styles.summaryHead}>
            <Label text="Order" />
            <Text style={styles.number}>{summary.number}</Text>
          </View>
          <ScrollView style={styles.grow} contentContainerStyle={styles.summaryLines}>
            {summary.lines.map((line) => (
              <View key={line.key} style={styles.summaryLine}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryName}>
                    {line.quantity > 1 && <Text style={styles.qty}>{line.quantity}× </Text>}
                    {line.name}
                  </Text>
                  <Text style={styles.summaryPrice}>{cedis(line.total)}</Text>
                </View>
                {line.detail ? <Text style={styles.summaryDetail}>{line.detail}</Text> : null}
              </View>
            ))}
          </ScrollView>
          <View style={styles.summaryTotal}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>{cedis(summary.total)}</Text>
          </View>
        </View>

        <View style={styles.pay}>
          <View style={styles.payHead}>
            {mode === 'drawer' ? (
              <Text style={styles.payTitle}>Open the cash drawer</Text>
            ) : allowLink ? (
              <Segmented
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'link', label: 'Payment link' },
                ]}
                value={mode}
                onChange={setMode}
              />
            ) : (
              <Text style={styles.payTitle}>Cash</Text>
            )}
            <CloseButton onPress={onClose} />
          </View>

          <ScrollView style={styles.grow} contentContainerStyle={styles.payBody}>
            {mode === 'drawer' && (
              <>
                <Text style={styles.body}>
                  Count the cash in the drawer before the first cash sale. That's the float it
                  starts with.
                </Text>
                <View style={styles.cashRow}>
                  <View style={styles.cashSide}>
                    <Label text="Cash in the drawer now" />
                    <Text style={[styles.display, floatTyped ? styles.displayOn : null]}>
                      GH₵ {floatTyped || '0.00'}
                    </Text>
                  </View>
                  {keypad(floatTyped, setFloatTyped)}
                </View>
              </>
            )}

            {mode === 'cash' && (
              <>
                <View>
                  <Label text="To pay" />
                  <Text style={styles.toPay}>{cedis(due)}</Text>
                </View>
                <View style={styles.quick}>
                  <View style={styles.grow}>
                    <Button
                      label="Exact"
                      kind="secondary"
                      size="md"
                      onPress={() => setTyped(plainAmount(due))}
                    />
                  </View>
                  {NOTES.filter((note) => note > due)
                    .slice(0, 2)
                    .map((note) => (
                      <View key={note} style={styles.grow}>
                        <Button
                          label={cedis(note)}
                          kind="secondary"
                          size="md"
                          onPress={() => setTyped(plainAmount(note))}
                        />
                      </View>
                    ))}
                </View>
                <View style={styles.cashRow}>
                  <View style={styles.cashSide}>
                    <Label text="Cash given" />
                    <Text style={[styles.display, typed ? styles.displayOn : null]}>
                      GH₵ {typed || '0.00'}
                    </Text>
                    <Label text="Change to give" />
                    <Text style={[styles.change, enough && given! > due && styles.changeOn]}>
                      {enough ? cedis(sub(given!, due)) : '—'}
                    </Text>
                    {given !== null && !enough && (
                      <Text style={styles.short}>That's less than {cedis(due)}.</Text>
                    )}
                  </View>
                  {keypad(typed, setTyped)}
                </View>
              </>
            )}

            {mode === 'link' && (
              <>
                <Text style={styles.body}>
                  The customer gets a link on their phone and pays by MoMo. The order waits under
                  "Awaiting payment" and goes to the kitchen as soon as the payment arrives.
                </Text>
                <PhoneField
                  label="Customer phone"
                  required
                  value={linkPhone}
                  onChangeText={setLinkPhone}
                />
                <Text style={styles.note}>{LINKS_NOT_ON}</Text>
              </>
            )}
            {problem && <Text style={styles.problem}>{problem}</Text>}
          </ScrollView>

          <View style={styles.payFoot}>
            {mode === 'drawer' && (
              <Button
                label={`Open the drawer with ${cedis(floatAmount)}`}
                onPress={openDrawer}
                busy={busy}
              />
            )}
            {mode === 'cash' && (
              <Button
                label="Done"
                onPress={() => run(() => onCash(given!, shiftId!))}
                busy={busy}
                disabled={!enough || !shiftId}
              />
            )}
            {mode === 'link' && (
              <Button
                label="Send payment link"
                onPress={() => run(() => onLink(linkPhone))}
                busy={busy}
              />
            )}
          </View>
        </View>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, flexDirection: 'row' },
  grow: { flex: 1 },
  summary: {
    width: 300,
    backgroundColor: colors.ground,
    borderRightWidth: 1,
    borderRightColor: colors.tile,
  },
  summaryHead: {
    paddingHorizontal: space.lg,
    paddingTop: 28,
    paddingBottom: 20,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.tile,
  },
  number: { fontFamily: font.monoMedium, fontSize: text.heading, color: colors.ink },
  summaryLines: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  summaryLine: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.tile },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  summaryName: { flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.ink },
  qty: { fontFamily: font.mono, color: colors.muted },
  summaryPrice: { fontFamily: font.monoMedium, fontSize: 14, color: colors.ink },
  summaryDetail: { fontFamily: font.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
  summaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: space.lg,
    paddingTop: 20,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: colors.tile,
  },
  summaryTotalLabel: { fontFamily: font.medium, fontSize: 15, color: colors.muted },
  summaryTotalValue: { fontFamily: font.monoMedium, fontSize: 22, color: colors.ink },
  pay: { flex: 1 },
  payHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 20,
  },
  payTitle: { fontFamily: font.semibold, fontSize: 18, color: colors.ink },
  payBody: { paddingHorizontal: 28, paddingTop: 20, paddingBottom: space.md, gap: 20 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.muted },
  note: { fontFamily: font.medium, fontSize: 14, color: colors.brandInk },
  toPay: { fontFamily: font.monoMedium, fontSize: text.huge, color: colors.ink, marginTop: 6 },
  quick: { flexDirection: 'row', gap: 10 },
  cashRow: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  cashSide: { flex: 1, gap: 8 },
  display: {
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.field,
    paddingHorizontal: space.md,
    textAlignVertical: 'center',
    fontFamily: font.monoMedium,
    fontSize: 22,
    lineHeight: 52,
    color: colors.disabled,
    marginBottom: space.sm,
  },
  displayOn: { borderColor: colors.brand, color: colors.ink },
  change: { fontFamily: font.monoMedium, fontSize: 36, color: colors.disabled },
  changeOn: { color: colors.good },
  short: { fontFamily: font.medium, fontSize: 14, color: colors.redInk },
  keypad: { width: 216, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  key: {
    width: 66,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.field,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyPressed: { backgroundColor: colors.tile },
  keyLabel: { fontFamily: font.monoMedium, fontSize: 20, color: colors.ink },
  problem: { fontFamily: font.medium, fontSize: 15, color: colors.redInk },
  payFoot: {
    paddingHorizontal: 28,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
