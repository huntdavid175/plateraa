import { parseCedis, pesewas, type Pesewas } from '@plateraa/shared';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalQuery } from '../tablet/TabletProvider';
import { Button } from '../ui/Button';
import { Chip, OptionTile, Segmented } from '../ui/controls';
import { Field, Label, PhoneField } from '../ui/Field';
import { cedis, colors, font, space, text } from '../ui/theme';
import { PLATFORM_NAMES, isPlatform, type Checkout, type CheckoutSource } from './checkout';
import { priceTicket, type TicketLine } from './ticket';
import { TicketLines } from './TicketLines';
import { LINKS_NOT_ON } from './words';

const SOURCES: readonly { value: Exclude<CheckoutSource, 'POS'>; label: string }[] = [
  { value: 'PHONE', label: 'Phone' },
  { value: 'BOLT_FOOD', label: 'Bolt Food' },
  { value: 'CHOWDECK', label: 'Chowdeck' },
];

/**
 * An order that came in by phone call, Bolt Food or Chowdeck, typed in by staff. A phone order
 * needs the caller's number and is paid by a link sent to it; Bolt and Chowdeck took the money.
 */
export function RemoteOrderPanel({
  number,
  lines,
  onLines,
  canChange,
  onChangeLine,
  onCancel,
  onSubmit,
  busy,
}: {
  number: string;
  lines: TicketLine[];
  onLines: (update: (lines: TicketLine[]) => TicketLine[]) => void;
  canChange: (line: TicketLine) => boolean;
  onChangeLine: (line: TicketLine) => void;
  onCancel: () => void;
  onSubmit: (checkout: Checkout) => void;
  busy: boolean;
}) {
  const zones = useLocalQuery<{ id: string; name: string; fee: Pesewas }>(
    'SELECT id, name, fee FROM delivery_zones WHERE active = 1 ORDER BY position, name',
  );
  const [source, setSource] = useState<Exclude<CheckoutSource, 'POS'> | null>(null);
  const [delivery, setDelivery] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [feeText, setFeeText] = useState('');
  const [riderKeeps, setRiderKeeps] = useState(false);
  const [reference, setReference] = useState('');

  const platform = source !== null && isPlatform(source);
  // Bolt and Chowdeck riders collect at the counter.
  useEffect(() => {
    if (platform) setDelivery(false);
  }, [platform]);

  const ownDelivery = delivery && !platform;
  const fee = ownDelivery ? parseCedis(feeText.trim() || '0') : pesewas(0);
  const priced = lines.length ? priceTicket(lines, ownDelivery && fee ? fee : undefined) : null;
  const total = priced?.total ?? 0;
  const action = !source
    ? 'Choose where the order came from'
    : platform
      ? `Paid on ${PLATFORM_NAMES[source]} · ${cedis(total)}`
      : `Send payment link · ${cedis(total)}`;

  const submit = () => {
    if (!source) return;
    onSubmit({
      source,
      delivery: ownDelivery,
      phone,
      name,
      address,
      zoneId,
      fee,
      riderKeepsFee: riderKeeps,
      reference,
    });
  };

  return (
    <View style={styles.pane}>
      <View style={styles.head}>
        <View>
          <Text style={styles.title}>Remote order</Text>
          <Text style={styles.subtitle}>Order {number}</Text>
        </View>
        <Button label="Cancel" kind="secondary" size="md" onPress={onCancel} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.block}>
          <Label text="Source" required />
          <View style={styles.sources}>
            {SOURCES.map((option) => (
              <View key={option.value} style={styles.source}>
                <OptionTile
                  label={option.label}
                  selected={source === option.value}
                  onPress={() => setSource(option.value)}
                />
              </View>
            ))}
          </View>
        </View>

        {source === 'PHONE' && (
          <View style={styles.block}>
            <Label text="Type" />
            <Segmented
              options={[
                { value: 'pickup', label: 'Pickup' },
                { value: 'delivery', label: 'Delivery' },
              ]}
              value={delivery ? 'delivery' : 'pickup'}
              onChange={(type) => setDelivery(type === 'delivery')}
            />
          </View>
        )}

        <PhoneField
          label="Customer phone"
          value={phone}
          onChangeText={setPhone}
          required={source === 'PHONE'}
          optional={platform}
        />
        <Field label="Customer name" optional value={name} onChangeText={setName} />

        {ownDelivery && (
          <>
            <Field
              label="Delivery address"
              required
              value={address}
              onChangeText={setAddress}
              placeholder="House no., street, landmark"
            />
            {zones && zones.length > 0 && (
              <View style={styles.block}>
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
            <View style={styles.block}>
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

        {platform && (
          <Field
            label={`${PLATFORM_NAMES[source!]} order code`}
            optional
            value={reference}
            onChangeText={setReference}
            autoCapitalize="characters"
            placeholder="e.g. BF-2039481"
            mono
          />
        )}

        <View style={styles.block}>
          <Label text="Items" />
          <TicketLines
            lines={lines}
            onLines={onLines}
            canChange={canChange}
            onChange={onChangeLine}
          />
        </View>
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
          <Text style={styles.total}>{cedis(total)}</Text>
        </View>
        {source === 'PHONE' && <Text style={styles.note}>{LINKS_NOT_ON}</Text>}
        <Button label={action} onPress={submit} busy={busy} disabled={!source || !lines.length} />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { fontFamily: font.semibold, fontSize: 18, color: colors.ink },
  subtitle: { fontFamily: font.mono, fontSize: 13, color: colors.muted, marginTop: 2 },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: 18,
  },
  block: { gap: 6 },
  sources: { flexDirection: 'row', gap: space.sm },
  source: { flex: 1 },
  zones: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  foot: {
    paddingHorizontal: space.lg,
    paddingTop: 14,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: 10,
  },
  subRow: { flexDirection: 'row', justifyContent: 'space-between' },
  subLabel: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  subValue: { fontFamily: font.mono, fontSize: 13, color: colors.muted },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { fontFamily: font.medium, fontSize: 15, color: colors.muted },
  total: { fontFamily: font.monoMedium, fontSize: text.total, color: colors.ink },
  note: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
});
