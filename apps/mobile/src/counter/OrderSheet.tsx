import { canEditItems, formatCedis, type Pesewas } from '@plateraa/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { problemText } from '../tablet/api';
import { Button } from '../ui/Button';
import { Choice } from '../ui/Choice';
import { Field } from '../ui/Field';
import { Sheet } from '../ui/Sheet';
import { colors, space, text } from '../ui/theme';
import {
  advance,
  cancelOrder,
  markPaidOnPlatform,
  openDrawer,
  openShiftOf,
  payCash,
  setOnHold,
  type Counter,
} from './actions';
import { CashPanel, DrawerPanel } from './CashPanel';
import { laneOf } from './lanes';
import { refundOwedOf, remainingOf } from './OrdersPanel';
import { extrasText, type QueueOrder } from './queue';
import { CANCEL_REASONS, LINKS_NOT_ON, SOURCE_LABELS, STATUS_LABELS, nextStepLabel } from './words';

type Mode = 'details' | 'drawer' | 'cash' | 'cancel';

/** One order in full, with what can be done to it from the counter. */
export function OrderSheet({
  order,
  counter,
  payBeforePrep,
  onClose,
  onEdit,
}: {
  order: QueueOrder | null;
  counter: Counter;
  payBeforePrep: boolean;
  onClose: () => void;
  onEdit: (order: QueueOrder) => void;
}) {
  const [mode, setMode] = useState<Mode>('details');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState('');

  const orderId = order?.id;
  useEffect(() => {
    setMode('details');
    setProblem(null);
    setReason(null);
    setOtherReason('');
  }, [orderId]);

  if (!order) return null;

  const lane = laneOf(order, payBeforePrep);
  const active = lane !== 'done';
  const remaining = remainingOf(order);
  const refundOwed = refundOwedOf(order);
  const step =
    lane === 'kitchen' || lane === 'ready' ? nextStepLabel(order.status, order.type) : null;
  const platform =
    order.source === 'BOLT_FOOD' ? 'Bolt' : order.source === 'CHOWDECK' ? 'Chowdeck' : null;

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

  const takeCash = () =>
    run(async () => {
      const shiftId = await openShiftOf(counter.engine.db, counter.deviceId);
      setMode(shiftId ? 'cash' : 'drawer');
    });

  const drawerOpened = (float: Pesewas) =>
    run(async () => {
      await openDrawer(counter, float);
      setMode('cash');
    });

  const cashReceived = (tendered: Pesewas) =>
    run(async () => {
      const shiftId = await openShiftOf(counter.engine.db, counter.deviceId);
      if (!shiftId) {
        setMode('drawer');
        return;
      }
      await payCash(counter, { orderId: order.id, shiftId, amount: remaining, tendered });
      setMode('details');
    });

  const cancel = () =>
    run(async () => {
      const why = reason === 'Other' ? otherReason.trim() : reason;
      if (!why) throw new Error('Say why the order is being cancelled');
      await cancelOrder(counter, order.id, why);
      onClose();
    });

  const title = `Order ${order.display_number} · ${SOURCE_LABELS[order.source]}`;

  return (
    <Sheet visible title={title} onClose={onClose} width={620}>
      {mode === 'details' && (
        <>
          <Text style={styles.status}>
            {STATUS_LABELS[order.status]}
            {order.on_hold ? ' · on hold' : ''}
            {order.provisional ? ' · provisional until the server confirms' : ''}
          </Text>
          {(order.customer_phone || order.external_reference || order.delivery_address) && (
            <View style={styles.block}>
              {order.customer_phone && (
                <Text style={styles.body}>
                  {order.customer_name ? `${order.customer_name} · ` : ''}
                  {order.customer_phone}
                </Text>
              )}
              {order.delivery_address && (
                <Text style={styles.body}>Deliver to: {order.delivery_address}</Text>
              )}
              {order.external_reference && (
                <Text style={styles.body}>
                  {platform ?? 'Reference'} code: {order.external_reference}
                </Text>
              )}
            </View>
          )}

          <View style={styles.block}>
            {order.lines.map((line) => {
              const extras = extrasText(line);
              return (
                <View key={line.id} style={styles.lineRow}>
                  <Text style={styles.lineName}>
                    {line.quantity}× {line.name}
                    {line.variant_name ? ` (${line.variant_name})` : ''}
                    {extras ? ` · ${extras}` : ''}
                  </Text>
                  <Text style={styles.body}>{formatCedis(line.line_total)}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.block}>
            {order.discount > 0 && (
              <Text style={styles.body}>
                Discount from a manager: −{formatCedis(order.discount)}
              </Text>
            )}
            {order.delivery_fee > 0 && (
              <Text style={styles.body}>Delivery: {formatCedis(order.delivery_fee)}</Text>
            )}
            <Text style={styles.total}>Total {formatCedis(order.total)}</Text>
            {order.amount_paid > 0 && (
              <Text style={styles.body}>Paid: {formatCedis(order.amount_paid)}</Text>
            )}
            {active && remaining > 0 && (
              <Text style={styles.owing}>Still to pay: {formatCedis(remaining)}</Text>
            )}
            {refundOwed > 0 && (
              <Text style={styles.owing}>
                Refund owed: {formatCedis(refundOwed)}. A manager gives it back and records it on
                the dashboard.
              </Text>
            )}
            {order.cancel_reason && (
              <Text style={styles.body}>Cancelled: {order.cancel_reason}</Text>
            )}
          </View>

          {lane === 'awaiting-payment' && remaining > 0 && order.source === 'PHONE' && (
            <Text style={styles.body}>Waiting for the caller to pay by link. {LINKS_NOT_ON}</Text>
          )}

          <View style={styles.actions}>
            {lane === 'awaiting-payment' && remaining > 0 && order.source === 'POS' && (
              <Button
                label={`Take ${formatCedis(remaining)} cash`}
                onPress={takeCash}
                busy={busy}
              />
            )}
            {active && remaining > 0 && platform && (
              <Button
                label={`Paid on ${platform}`}
                onPress={() =>
                  run(async () => {
                    await markPaidOnPlatform(counter, { orderId: order.id, amount: remaining });
                  })
                }
                busy={busy}
              />
            )}
            {step && !order.on_hold && (
              <Button
                label={step}
                onPress={() =>
                  run(async () => {
                    await advance(counter, order);
                  })
                }
                busy={busy}
              />
            )}
            {active && (
              <Button
                label={order.on_hold ? 'Resume' : 'Put on hold'}
                kind="secondary"
                onPress={() =>
                  run(async () => {
                    await setOnHold(counter, order.id, !order.on_hold);
                  })
                }
                disabled={busy}
              />
            )}
            {active && canEditItems(order.status) && (
              <Button
                label="Change items"
                kind="secondary"
                onPress={() => {
                  onEdit(order);
                  onClose();
                }}
                disabled={busy}
              />
            )}
            {active && (
              <Button
                label="Cancel order"
                kind="danger"
                onPress={() => setMode('cancel')}
                disabled={busy}
              />
            )}
          </View>
        </>
      )}

      {mode === 'drawer' && <DrawerPanel busy={busy} onOpen={drawerOpened} />}
      {mode === 'cash' && <CashPanel due={remaining} busy={busy} onPaid={cashReceived} />}

      {mode === 'cancel' && (
        <>
          {order.amount_paid > 0 && (
            <Text style={styles.owing}>
              {formatCedis(order.amount_paid)} has been paid. Cancelling leaves it as a refund owed:
              a manager gives the money back and records it on the dashboard.
            </Text>
          )}
          <Text style={styles.body}>Why is it being cancelled?</Text>
          <View style={styles.actions}>
            {[...CANCEL_REASONS, 'Other'].map((option) => (
              <Choice
                key={option}
                label={option}
                selected={reason === option}
                onPress={() => setReason(option)}
              />
            ))}
          </View>
          {reason === 'Other' && (
            <Field
              label="Reason"
              value={otherReason}
              onChangeText={setOtherReason}
              maxLength={200}
            />
          )}
          <View style={styles.actions}>
            <Button label="Back" kind="secondary" onPress={() => setMode('details')} />
            <Button label="Cancel the order" kind="danger" onPress={cancel} busy={busy} />
          </View>
        </>
      )}

      {mode !== 'details' && mode !== 'cancel' && (
        <Button label="Back" kind="secondary" onPress={() => setMode('details')} />
      )}
      {problem && <Text style={styles.problem}>{problem}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: text.body, fontWeight: '700', color: colors.infoInk },
  block: { gap: space.xs },
  body: { fontSize: text.body, color: colors.ink },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  lineName: { flex: 1, fontSize: text.body, fontWeight: '600', color: colors.ink },
  total: { fontSize: text.heading, fontWeight: '700', color: colors.ink },
  owing: { fontSize: text.body, fontWeight: '700', color: colors.dangerInk },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  problem: { fontSize: text.body, fontWeight: '600', color: colors.dangerInk },
});
