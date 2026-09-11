import { formatCedis, normalizeGhanaPhone, parseCedis, sub, type Pesewas } from '@plateraa/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { problemText } from '../tablet/api';
import { newId } from '../tablet/ids';
import { useLocalQuery } from '../tablet/TabletProvider';
import { Button } from '../ui/Button';
import { Choice } from '../ui/Choice';
import { Field } from '../ui/Field';
import { Sheet } from '../ui/Sheet';
import { colors, radius, space, text } from '../ui/theme';
import {
  markPaidOnPlatform,
  openDrawer,
  openShiftOf,
  payCash,
  placeOrder,
  updateItems,
  type Counter,
  type OrderDraft,
} from './actions';
import { CashPanel, DrawerPanel } from './CashPanel';
import { useMenu } from './hooks';
import { ItemSheet } from './ItemSheet';
import { needsChoice, type MenuItem } from './menu';
import { MenuTiles } from './MenuTiles';
import { extrasText, ticketLinesOf, type QueueOrder } from './queue';
import { addToTicket, changeQuantity, priceTicket, replaceLine, type TicketLine } from './ticket';
import { LINKS_NOT_ON } from './words';

type Kind = 'POS' | 'PHONE' | 'BOLT_FOOD' | 'CHOWDECK';

const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'POS', label: 'Walk-in' },
  { kind: 'PHONE', label: 'Phone' },
  { kind: 'BOLT_FOOD', label: 'Bolt' },
  { kind: 'CHOWDECK', label: 'Chowdeck' },
];

const PLATFORM_NAMES: Partial<Record<Kind, string>> = { BOLT_FOOD: 'Bolt', CHOWDECK: 'Chowdeck' };

/**
 * Taking an order: tap tiles, then pay. A walk-in pays cash or by payment link; a phone order
 * needs the caller's number and is paid by link only; Bolt and Chowdeck took the money already.
 */
export function OrderEntry({
  counter,
  editing,
  onEditDone,
}: {
  counter: Counter;
  /** An order being changed before the kitchen starts on it. */
  editing: QueueOrder | null;
  onEditDone: () => void;
}) {
  const menu = useMenu();
  const zones = useLocalQuery<{ id: string; name: string; fee: Pesewas }>(
    'SELECT id, name, fee FROM delivery_zones WHERE active = 1 ORDER BY position, name',
  );
  const [kind, setKind] = useState<Kind>('POS');
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [phone, setPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [delivery, setDelivery] = useState(false);
  const [address, setAddress] = useState('');
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [feeText, setFeeText] = useState('');
  const [reference, setReference] = useState('');
  const [picking, setPicking] = useState<{ item: MenuItem; line?: TicketLine } | null>(null);
  const [payStep, setPayStep] = useState<'drawer' | 'cash' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const knownNumber = normalizeGhanaPhone(phone) ?? '';
  const known = useLocalQuery<{ name: string | null }>(
    'SELECT name FROM customers WHERE phone = ? AND name IS NOT NULL LIMIT 1',
    [knownNumber],
  );
  const knownName = knownNumber ? known?.[0]?.name : null;

  // Changing an order: its lines come onto the ticket.
  const editingId = editing?.id;
  useEffect(() => {
    if (!editing) return;
    setLines(ticketLinesOf(editing));
    setProblem(null);
    setNotice(null);
    // Only when a different order is picked, not every time the list refreshes.
  }, [editingId]);

  const fee = kind === 'PHONE' && delivery ? parseCedis(feeText.trim() || '0') : null;
  const priced = lines.length ? priceTicket(lines, fee ?? undefined) : null;
  const itemOf = (itemId: string) =>
    menu?.flatMap((category) => category.items).find((item) => item.id === itemId);

  const pick = (item: MenuItem) => {
    setNotice(null);
    setProblem(null);
    if (needsChoice(item)) {
      setPicking({ item });
      return;
    }
    setLines((current) =>
      addToTicket(current, {
        lineId: newId(),
        itemId: item.id,
        name: item.name,
        unitPrice: item.price,
        modifiers: [],
        quantity: 1,
      }),
    );
  };

  const clear = () => {
    setLines([]);
    setPhone('');
    setCustomerName('');
    setDelivery(false);
    setAddress('');
    setZoneId(null);
    setFeeText('');
    setReference('');
    setPayStep(null);
  };

  /** The order as typed so far, checked for what its kind needs. */
  const draft = (paidByLink: boolean): OrderDraft => {
    if (!lines.length) throw new Error('Add something to the order first');
    const number = phone.trim() ? normalizeGhanaPhone(phone) : null;
    if (phone.trim() && !number) throw new Error("That isn't a Ghanaian phone number");
    if ((kind === 'PHONE' || paidByLink) && !number) {
      throw new Error(
        kind === 'PHONE'
          ? "Add the caller's number: the payment link goes there"
          : "Add the customer's number: the payment link goes there",
      );
    }
    const name = customerName.trim();
    const customer = number ? { phone: number, ...(name ? { name } : {}) } : undefined;

    if (kind === 'PHONE' && delivery) {
      if (!address.trim()) throw new Error('Add the delivery address');
      if (fee === null) throw new Error("The delivery fee isn't an amount");
      return {
        source: 'PHONE',
        type: 'DELIVERY',
        lines,
        customer,
        delivery: {
          address: address.trim(),
          ...(zoneId ? { zoneId } : {}),
          fee,
          feeCollectedBy: 'VENDOR',
        },
      };
    }
    if (kind === 'PHONE') return { source: 'PHONE', type: 'PICKUP', lines, customer };
    if (kind === 'POS') return { source: 'POS', type: 'WALK_IN', lines, customer };
    return {
      source: kind,
      type: 'PICKUP',
      lines,
      ...(reference.trim() ? { externalReference: reference.trim() } : {}),
    };
  };

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await task();
    } catch (error) {
      setProblem(problemText(error));
    } finally {
      setBusy(false);
    }
  };

  const startCash = () =>
    run(async () => {
      draft(false);
      const shiftId = await openShiftOf(counter.engine.db, counter.deviceId);
      setPayStep(shiftId ? 'cash' : 'drawer');
    });

  const drawerOpened = (float: Pesewas) =>
    run(async () => {
      await openDrawer(counter, float);
      setPayStep('cash');
    });

  const cashReceived = (tendered: Pesewas) =>
    run(async () => {
      const shiftId = await openShiftOf(counter.engine.db, counter.deviceId);
      if (!shiftId) {
        setPayStep('drawer');
        return;
      }
      const placed = await placeOrder(counter, draft(false));
      await payCash(counter, { orderId: placed.orderId, shiftId, amount: placed.due, tendered });
      clear();
      setNotice(
        `${placed.displayNumber} is with the kitchen. Change: ${formatCedis(sub(tendered, placed.due))}.`,
      );
    });

  const sendLink = () =>
    run(async () => {
      const placed = await placeOrder(counter, draft(true));
      clear();
      setNotice(
        `${placed.displayNumber} is waiting for ${formatCedis(placed.due)}. ${LINKS_NOT_ON}`,
      );
    });

  const paidOnPlatform = () =>
    run(async () => {
      const placed = await placeOrder(counter, draft(false));
      await markPaidOnPlatform(counter, { orderId: placed.orderId, amount: placed.due });
      clear();
      setNotice(`${placed.displayNumber} is with the kitchen.`);
    });

  const saveEdit = () =>
    run(async () => {
      if (!editing) return;
      if (!lines.length) {
        throw new Error('An order needs at least one item. To drop it, cancel the order.');
      }
      await updateItems(counter, editing.id, lines);
      const number = editing.display_number;
      clear();
      onEditDone();
      setNotice(`Saved the changes to ${number}.`);
    });

  const stopEditing = () => {
    clear();
    onEditDone();
  };

  return (
    <View style={styles.entry}>
      <View style={styles.menu}>
        {menu === null ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <MenuTiles menu={menu} onPick={pick} />
        )}
      </View>

      <View style={styles.ticket}>
        <ScrollView contentContainerStyle={styles.ticketBody} keyboardShouldPersistTaps="handled">
          {editing ? (
            <View style={styles.editing}>
              <Text style={styles.editingText}>Changing order {editing.display_number}</Text>
              <Button label="Stop" kind="secondary" onPress={stopEditing} />
            </View>
          ) : (
            <View style={styles.wrapRow}>
              {KINDS.map((option) => (
                <Choice
                  key={option.kind}
                  label={option.label}
                  selected={kind === option.kind}
                  onPress={() => {
                    setKind(option.kind);
                    setProblem(null);
                  }}
                />
              ))}
            </View>
          )}

          {lines.length === 0 ? (
            <Text style={styles.hint}>Tap the menu to add items.</Text>
          ) : (
            lines.map((line) => {
              const extras = extrasText({ modifiers: JSON.stringify(line.modifiers) });
              const item = itemOf(line.itemId);
              const changeable = item && (item.variants.length > 0 || item.groups.length > 0);
              return (
                <View key={line.lineId} style={styles.line}>
                  <View style={styles.lineText}>
                    <Text style={styles.lineName}>
                      {line.name}
                      {line.variantName ? ` (${line.variantName})` : ''}
                    </Text>
                    {extras ? <Text style={styles.lineExtras}>{extras}</Text> : null}
                    {changeable && (
                      <Text style={styles.link} onPress={() => setPicking({ item, line })}>
                        Change
                      </Text>
                    )}
                  </View>
                  <View style={styles.quantity}>
                    <Button
                      label="−"
                      kind="secondary"
                      onPress={() =>
                        setLines((current) => changeQuantity(current, line.lineId, -1))
                      }
                    />
                    <Text style={styles.quantityText}>{line.quantity}</Text>
                    <Button
                      label="+"
                      kind="secondary"
                      onPress={() => setLines((current) => changeQuantity(current, line.lineId, 1))}
                    />
                  </View>
                </View>
              );
            })
          )}

          {!editing && kind === 'POS' && (
            <Field
              label="Customer's number (for a payment link)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          )}

          {!editing && kind === 'PHONE' && (
            <>
              <Field
                label="Caller's number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              {knownName && !customerName.trim() && (
                <Text style={styles.hint}>Known customer: {knownName}</Text>
              )}
              <Field
                label="Their name (optional)"
                value={customerName}
                onChangeText={setCustomerName}
              />
              <View style={styles.wrapRow}>
                <Choice label="Pickup" selected={!delivery} onPress={() => setDelivery(false)} />
                <Choice label="Delivery" selected={delivery} onPress={() => setDelivery(true)} />
              </View>
              {delivery && (
                <>
                  {zones && zones.length > 0 && (
                    <View style={styles.wrapRow}>
                      {zones.map((zone) => (
                        <Choice
                          key={zone.id}
                          label={zone.name}
                          detail={formatCedis(zone.fee)}
                          selected={zoneId === zone.id}
                          onPress={() => {
                            setZoneId(zone.id);
                            setFeeText(formatCedis(zone.fee));
                          }}
                        />
                      ))}
                    </View>
                  )}
                  <Field label="Delivery address" value={address} onChangeText={setAddress} />
                  <Field
                    label="Delivery fee (GH₵)"
                    value={feeText}
                    onChangeText={setFeeText}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </>
              )}
            </>
          )}

          {!editing && (kind === 'BOLT_FOOD' || kind === 'CHOWDECK') && (
            <Field
              label={`${PLATFORM_NAMES[kind]} order code (optional)`}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="characters"
            />
          )}

          {priced && (
            <View style={styles.totals}>
              {priced.deliveryFee > 0 && (
                <Text style={styles.subTotal}>Delivery {formatCedis(priced.deliveryFee)}</Text>
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.total}>{formatCedis(priced.total)}</Text>
              </View>
            </View>
          )}

          {editing ? (
            <Button label="Save changes" onPress={saveEdit} busy={busy} disabled={!lines.length} />
          ) : kind === 'POS' ? (
            <View style={styles.payRow}>
              <View style={styles.grow}>
                <Button label="Cash" onPress={startCash} busy={busy} disabled={!lines.length} />
              </View>
              <View style={styles.grow}>
                <Button
                  label="Payment link"
                  kind="secondary"
                  onPress={sendLink}
                  disabled={!lines.length || busy}
                />
              </View>
            </View>
          ) : kind === 'PHONE' ? (
            <Button
              label="Send payment link"
              onPress={sendLink}
              busy={busy}
              disabled={!lines.length}
            />
          ) : (
            <Button
              label={`Paid on ${PLATFORM_NAMES[kind]}`}
              onPress={paidOnPlatform}
              busy={busy}
              disabled={!lines.length}
            />
          )}
          {!editing && lines.length > 0 && (
            <Text style={styles.link} onPress={clear}>
              Clear this order
            </Text>
          )}
          {problem && !payStep && <Text style={styles.problem}>{problem}</Text>}
          {notice && <Text style={styles.notice}>{notice}</Text>}
        </ScrollView>
      </View>

      <ItemSheet
        item={picking?.item ?? null}
        line={picking?.line}
        onClose={() => setPicking(null)}
        onDone={(line) => {
          setLines((current) =>
            picking?.line ? replaceLine(current, line) : addToTicket(current, line),
          );
          setPicking(null);
        }}
      />

      <Sheet
        visible={payStep !== null}
        title={payStep === 'drawer' ? 'Open the cash drawer' : 'Cash'}
        onClose={() => setPayStep(null)}
      >
        {payStep === 'drawer' ? (
          <DrawerPanel busy={busy} onOpen={drawerOpened} />
        ) : priced ? (
          <CashPanel due={priced.total} busy={busy} onPaid={cashReceived} />
        ) : null}
        {problem && <Text style={styles.problem}>{problem}</Text>}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { flex: 1.7, flexDirection: 'row', gap: space.md },
  menu: { flex: 1 },
  ticket: {
    width: 340,
    backgroundColor: colors.surface,
    borderRadius: radius,
  },
  ticketBody: { padding: space.md, gap: space.md },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  editing: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  editingText: { flex: 1, fontSize: text.body, fontWeight: '700', color: colors.infoInk },
  hint: { fontSize: text.body, color: colors.muted },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: space.sm,
  },
  lineText: { flex: 1, gap: 2 },
  lineName: { fontSize: text.body, fontWeight: '700', color: colors.ink },
  lineExtras: { fontSize: text.small, color: colors.muted },
  link: { fontSize: text.small, color: colors.infoInk, fontWeight: '600' },
  quantity: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  quantityText: {
    fontSize: text.heading,
    fontWeight: '700',
    color: colors.ink,
    minWidth: 28,
    textAlign: 'center',
  },
  totals: { gap: space.xs },
  subTotal: { fontSize: text.small, color: colors.muted, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { fontSize: text.heading, fontWeight: '700', color: colors.ink },
  total: { fontSize: text.title, fontWeight: '700', color: colors.ink },
  payRow: { flexDirection: 'row', gap: space.sm },
  grow: { flex: 1 },
  problem: { fontSize: text.body, fontWeight: '600', color: colors.dangerInk },
  notice: {
    fontSize: text.body,
    fontWeight: '600',
    color: colors.infoInk,
    backgroundColor: colors.infoBg,
    borderRadius: radius,
    padding: space.sm,
  },
});
