import { parseCedis, pesewas, type OrderType, type Pesewas } from '@plateraa/shared';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalQuery } from '../tablet/TabletProvider';
import { Button } from '../ui/Button';
import { Chip, Segmented } from '../ui/controls';
import { Field, Label, PhoneField } from '../ui/Field';
import { cedis, colors, font, space, text, themedStyles } from '../ui/theme';
import { ghanaPhone, type Checkout } from './checkout';
import { useOffersDineIn } from './hooks';
import type { QueueOrder } from './queue';
import { priceTicket, type TicketLine } from './ticket';
import { TicketLines } from './TicketLines';
import { TYPE_LABELS } from './words';

/**
 * The order being typed in at the counter: dine-in (where the owner offers it), pickup or
 * delivery, the lines and the total, with Charge and Hold pinned at the bottom. A phone call is
 * typed in here too. The customer's number is asked for at the payment sheet, where a payment
 * link needs it; a delivery asks here, since the rider needs it with the address.
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
  onCharge: (checkout: Checkout) => void;
  onHold: (checkout: Checkout) => void;
  busy: boolean;
  /** Changes after a sale, emptying the form. */
  resetKey: number;
}) {
  const zones = useLocalQuery<{ id: string; name: string; fee: Pesewas }>(
    'SELECT id, name, fee FROM delivery_zones WHERE active = 1 ORDER BY position, name',
  );
  const types: OrderType[] = useOffersDineIn()
    ? ['DINE_IN', 'PICKUP', 'DELIVERY']
    : ['PICKUP', 'DELIVERY'];
  const [picked, setPicked] = useState<OrderType | null>(null);
  // Until someone picks, the first choice: Dine-in where it's offered, otherwise Pickup.
  const type = picked && types.includes(picked) ? picked : types[0]!;
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [feeText, setFeeText] = useState('');
  const [riderKeeps, setRiderKeeps] = useState(false);
  const body = useRef<ScrollView>(null);
  const lineCount = useRef(lines.length);
  const showNewest = useRef(false);

  /**
   * A new line goes on the end, where a full ticket hides it. Scrolling down to it is what tells
   * the person at the counter the tap landed. Only a line that wasn't there before: tapping + on
   * a line already on the ticket, or the same item twice, raises a quantity in place, and the
   * ticket would jump away from what they were looking at for nothing. The scroll waits on the
   * content size, since the new line has no height yet while the effect runs.
   */
  useEffect(() => {
    if (lines.length > lineCount.current) showNewest.current = true;
    lineCount.current = lines.length;
  }, [lines.length]);

  useEffect(() => {
    setPicked(null);
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

  const delivery = type === 'DELIVERY';
  const fee = delivery ? parseCedis(feeText.trim() || '0') : pesewas(0);
  const priced = lines.length ? priceTicket(lines, delivery && fee ? fee : undefined) : null;
  const checkout = (): Checkout => ({
    type,
    phone,
    name: type === 'DINE_IN' ? '' : name,
    address,
    zoneId,
    fee,
    riderKeepsFee: riderKeeps,
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
            <Text style={styles.title}>Order {number}</Text>
            <Segmented
              options={types.map((value) => ({ value, label: TYPE_LABELS[value] }))}
              value={type}
              onChange={setPicked}
            />
          </>
        )}
      </View>

      <ScrollView
        ref={body}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (!showNewest.current) return;
          showNewest.current = false;
          body.current?.scrollToEnd({ animated: true });
        }}
      >
        {!editing && delivery && (
          <View style={styles.fields}>
            <PhoneField label="Customer phone" value={phone} onChangeText={setPhone} required />
            {knownName && <Text style={styles.known}>Known customer: {knownName}</Text>}
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

const styles = themedStyles(() => ({
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
}));
