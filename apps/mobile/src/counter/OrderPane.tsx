import { parseCedis, pesewas, type Pesewas } from '@plateraa/shared';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalQuery } from '../tablet/TabletProvider';
import { Button } from '../ui/Button';
import { Chip, Segmented } from '../ui/controls';
import { Field, Label, PhoneField } from '../ui/Field';
import { cedis, colors, font, space, text } from '../ui/theme';
import { ghanaPhone, type Checkout } from './checkout';
import type { QueueOrder } from './queue';
import { priceTicket, type TicketLine } from './ticket';
import { TicketLines } from './TicketLines';

type Kind = 'walk-in' | 'delivery';

/**
 * The order being typed in at the counter: walk-in or delivery, the customer's number, the lines
 * and the total, with Charge and Hold pinned at the bottom.
 */
export function OrderPane({
  number,
  lines,
  onLines,
  canChange,
  onChangeLine,
  editing,
  onStopEditing,
  onSaveEdit,
  onRemote,
  onCharge,
  onHold,
  busy,
  resetKey,
}: {
  number: string;
  lines: TicketLine[];
  onLines: (update: (lines: TicketLine[]) => TicketLine[]) => void;
  canChange: (line: TicketLine) => boolean;
  onChangeLine: (line: TicketLine) => void;
  editing: QueueOrder | null;
  onStopEditing: () => void;
  onSaveEdit: () => void;
  onRemote: () => void;
  onCharge: (checkout: Checkout) => void;
  onHold: (checkout: Checkout) => void;
  busy: boolean;
  /** Changes after a sale, emptying the form. */
  resetKey: number;
}) {
  const zones = useLocalQuery<{ id: string; name: string; fee: Pesewas }>(
    'SELECT id, name, fee FROM delivery_zones WHERE active = 1 ORDER BY position, name',
  );
  const [kind, setKind] = useState<Kind>('walk-in');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [feeText, setFeeText] = useState('');
  const [riderKeeps, setRiderKeeps] = useState(false);

  useEffect(() => {
    setKind('walk-in');
    setPhone('');
    setName('');
    setAddress('');
    setZoneId(null);
    setFeeText('');
    setRiderKeeps(false);
  }, [resetKey]);

  const knownPhone = ghanaPhone(phone) ?? '';
  const known = useLocalQuery<{ name: string | null }>(
    'SELECT name FROM customers WHERE phone = ? AND name IS NOT NULL LIMIT 1',
    [knownPhone],
  );
  const knownName = knownPhone ? known?.[0]?.name : null;

  const delivery = kind === 'delivery';
  const fee = delivery ? parseCedis(feeText.trim() || '0') : pesewas(0);
  const priced = lines.length ? priceTicket(lines, delivery && fee ? fee : undefined) : null;
  const checkout = (): Checkout => ({
    source: 'POS',
    delivery,
    phone,
    name,
    address,
    zoneId,
    fee,
    riderKeepsFee: riderKeeps,
    reference: '',
  });

  return (
    <View style={styles.pane}>
      <View style={styles.head}>
        {editing ? (
          <View style={styles.titleRow}>
            <Text style={styles.title}>Changing order {editing.display_number}</Text>
            <Button label="Stop" kind="secondary" size="md" onPress={onStopEditing} />
          </View>
        ) : (
          <>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Order {number}</Text>
              <Button label="+ Remote order" kind="ghost" size="md" onPress={onRemote} />
            </View>
            <Segmented
              options={[
                { value: 'walk-in', label: 'Walk-in' },
                { value: 'delivery', label: 'Delivery' },
              ]}
              value={kind}
              onChange={setKind}
            />
          </>
        )}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {!editing && (
          <View style={styles.fields}>
            <PhoneField
              label="Customer phone"
              value={phone}
              onChangeText={setPhone}
              required={delivery}
            />
            {knownName && <Text style={styles.known}>Known customer: {knownName}</Text>}
            {delivery && (
              <>
                <Field label="Name" optional value={name} onChangeText={setName} />
                <Field
                  label="Delivery address"
                  required
                  value={address}
                  onChangeText={setAddress}
                  placeholder="House no., street, landmark"
                />
                {zones && zones.length > 0 && (
                  <View style={styles.zoneBlock}>
                    <Label text="Delivery zone" />
                    <View style={styles.zones}>
                      {zones.map((zone) => (
                        <Chip
                          key={zone.id}
                          label={`${zone.name} · ${cedis(zone.fee)}`}
                          selected={zoneId === zone.id}
                          onPress={() => {
                            setZoneId(zone.id);
                            setFeeText(cedis(zone.fee));
                          }}
                        />
                      ))}
                    </View>
                  </View>
                )}
                <Field
                  label="Delivery fee (GH₵)"
                  value={feeText}
                  onChangeText={setFeeText}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  mono
                />
                <View style={styles.zoneBlock}>
                  <Label text="Delivery fee goes to" />
                  <Segmented
                    options={[
                      { value: 'us', label: 'Us' },
                      { value: 'rider', label: 'Rider' },
                    ]}
                    value={riderKeeps ? 'rider' : 'us'}
                    onChange={(who) => setRiderKeeps(who === 'rider')}
                  />
                </View>
              </>
            )}
          </View>
        )}
        <TicketLines
          lines={lines}
          onLines={onLines}
          canChange={canChange}
          onChange={onChangeLine}
        />
      </ScrollView>

      <View style={styles.foot}>
        {priced && priced.deliveryFee > 0 && (
          <View style={styles.subRow}>
            <Text style={styles.subLabel}>Delivery{riderKeeps ? ' (rider keeps)' : ''}</Text>
            <Text style={styles.subValue}>{cedis(priced.deliveryFee)}</Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.total}>{cedis(priced?.total ?? 0)}</Text>
        </View>
        {editing ? (
          <Button label="Save changes" onPress={onSaveEdit} busy={busy} disabled={!lines.length} />
        ) : (
          <View style={styles.actions}>
            <Button
              label={`Charge ${cedis(priced?.total ?? 0)}`}
              onPress={() => onCharge(checkout())}
              busy={busy}
              disabled={!lines.length}
              grow
            />
            <Button
              label="Hold"
              kind="secondary"
              onPress={() => onHold(checkout())}
              disabled={!lines.length || busy}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    flex: 38,
    backgroundColor: colors.canvas,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
  },
  head: {
    paddingHorizontal: space.lg,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  title: { fontFamily: font.semibold, fontSize: 18, color: colors.ink },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: space.lg, paddingTop: 12, paddingBottom: space.md },
  fields: { gap: 12, paddingBottom: 4 },
  known: { fontFamily: font.medium, fontSize: 13, color: colors.goodInk },
  zoneBlock: { gap: 6 },
  zones: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  foot: {
    paddingHorizontal: space.lg,
    paddingTop: 14,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: 12,
  },
  subRow: { flexDirection: 'row', justifyContent: 'space-between' },
  subLabel: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  subValue: { fontFamily: font.mono, fontSize: 13, color: colors.muted },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  totalLabel: { fontFamily: font.medium, fontSize: 15, color: colors.muted },
  total: { fontFamily: font.monoMedium, fontSize: text.total, color: colors.ink },
  actions: { flexDirection: 'row', gap: 10 },
});
