import { canEditItems, type OrderStatus, type OrderType } from '@plateraa/shared';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { problemText } from '../tablet/api';
import { Button } from '../ui/Button';
import { Badge, Chip } from '../ui/controls';
import { Field, Label } from '../ui/Field';
import { cedis, colors, font, radii, space, text } from '../ui/theme';
import {
  advance,
  cancelOrder,
  markPaidOnPlatform,
  payCash,
  requestLink,
  setOnHold,
  type Counter,
} from './actions';
import { useNow } from './hooks';
import { laneOf, urgency } from './lanes';
import { PaymentSheet } from './PaymentSheet';
import { extrasText, type QueueOrder } from './queue';
import {
  ORDER_FILTERS,
  byUrgency,
  filterOf,
  minutesSince,
  stillToPay,
  type OrderFilter,
} from './views';
import { CANCEL_REASONS, SOURCE_LABELS, STATUS_LABELS, linkWords, nextStepLabel } from './words';

/** A payment link's state is always a sentence; the colour only backs it up. */
const LINK_COLOURS = {
  info: colors.infoInk,
  good: colors.goodInk,
  amber: colors.amberInk,
  red: colors.redInk,
} as const;

const TYPE_LABELS: Record<OrderType, string> = {
  WALK_IN: 'Walk-in',
  PICKUP: 'Pickup',
  DELIVERY: 'Delivery',
};

type Tone = 'neutral' | 'good' | 'amber' | 'red' | 'info';

function statusTone(status: OrderStatus): Tone {
  if (status === 'READY' || status === 'OUT_FOR_DELIVERY') return 'good';
  if (status === 'PREPARING') return 'amber';
  if (status === 'CANCELLED') return 'red';
  if (status === 'NEW' || status === 'CONFIRMED') return 'info';
  return 'neutral';
}

const stepsOf = (type: OrderType): OrderStatus[] =>
  type === 'DELIVERY'
    ? ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']
    : ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'];

const refundOwedOf = (order: QueueOrder) =>
  order.status === 'CANCELLED' ? order.amount_paid - order.refunded : 0;

/**
 * Every order today, most urgent first: late and unpaid, then unpaid, then the rest. The list on
 * the left, the chosen order and what can be done with it on the right.
 */
export function OrdersScreen({
  orders,
  counter,
  payBeforePrep,
  onEdit,
}: {
  orders: QueueOrder[] | null;
  counter: Counter;
  payBeforePrep: boolean;
  onEdit: (order: QueueOrder) => void;
}) {
  const now = useNow();
  const [filter, setFilter] = useState<OrderFilter>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const totals: Record<OrderFilter, number> = { active: 0, held: 0, completed: 0, cancelled: 0 };
    for (const order of orders ?? []) totals[filterOf(order)] += 1;
    return totals;
  }, [orders]);
  const shown = useMemo(
    () =>
      byUrgency(
        (orders ?? []).filter((order) => filterOf(order) === filter),
        now,
      ),
    [orders, filter, now],
  );
  const selected =
    orders?.find((order) => order.id === selectedId && filterOf(order) === filter) ??
    shown[0] ??
    null;

  return (
    <View style={styles.screen}>
      <View style={styles.list}>
        <View style={styles.filters} accessibilityRole="tablist">
          {ORDER_FILTERS.map((option) => {
            const on = option.value === filter;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(option.value)}
                style={[styles.filter, on && styles.filterOn]}
              >
                <Text style={[styles.filterLabel, on && styles.filterLabelOn]}>{option.label}</Text>
                <View style={[styles.count, on && styles.countOn]}>
                  <Text style={[styles.countLabel, on && styles.countLabelOn]}>
                    {counts[option.value]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <ScrollView contentContainerStyle={styles.rows}>
          {shown.length === 0 ? (
            <Text style={styles.empty}>No orders here.</Text>
          ) : (
            shown.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                now={now}
                selected={order.id === selected?.id}
                onPress={() => setSelectedId(order.id)}
              />
            ))
          )}
        </ScrollView>
      </View>

      {selected ? (
        <OrderDetail
          key={selected.id}
          order={selected}
          counter={counter}
          payBeforePrep={payBeforePrep}
          now={now}
          onEdit={onEdit}
        />
      ) : (
        <View style={styles.detailEmpty}>
          <Text style={styles.empty}>Tap an order to see it.</Text>
        </View>
      )}
    </View>
  );
}

function OrderRow({
  order,
  now,
  selected,
  onPress,
}: {
  order: QueueOrder;
  now: Date;
  selected: boolean;
  onPress: () => void;
}) {
  const open = filterOf(order) === 'active' || filterOf(order) === 'held';
  const unpaid = open && stillToPay(order) > 0;
  const refundOwed = refundOwedOf(order) > 0;
  const late = urgency(order.created_at_device, order.prepMinutes, now);
  const who =
    order.customer_name ??
    order.customer_phone ??
    (order.source === 'POS' ? 'Walk-in' : SOURCE_LABELS[order.source]);
  const summary = order.lines
    .map((line) => `${line.quantity > 1 ? `${line.quantity}× ` : ''}${line.name}`)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.row, selected && styles.rowOn]}
    >
      <View
        style={[
          styles.edge,
          (unpaid || refundOwed) && styles.edgeRed,
          selected && !unpaid && !refundOwed && styles.edgeBrand,
        ]}
      />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowNumber}>{order.display_number}</Text>
          <Badge
            label={SOURCE_LABELS[order.source]}
            tone={order.source === 'POS' ? 'neutral' : 'info'}
          />
          {order.type !== 'WALK_IN' && <Badge label={TYPE_LABELS[order.type]} />}
          {unpaid && <Badge label="Unpaid" tone="red" strong />}
          {refundOwed && <Badge label="Refund owed" tone="amber" strong />}
          <View style={styles.grow} />
          {open && (
            <Text
              style={[
                styles.age,
                late === 'amber' && styles.amberText,
                late === 'red' && styles.redText,
              ]}
            >
              {minutesSince(order.created_at_device, now)}m
            </Text>
          )}
        </View>
        <View style={styles.rowMid}>
          <Text style={styles.who} numberOfLines={1}>
            {who}
          </Text>
          <Text style={styles.summary} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <View style={styles.rowBottom}>
          <Badge
            label={order.on_hold && open ? 'On hold' : STATUS_LABELS[order.status]}
            tone={order.on_hold && open ? 'amber' : statusTone(order.status)}
          />
          <Text style={styles.rowTotal}>{cedis(order.total)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function OrderDetail({
  order,
  counter,
  payBeforePrep,
  now,
  onEdit,
}: {
  order: QueueOrder;
  counter: Counter;
  payBeforePrep: boolean;
  now: Date;
  onEdit: (order: QueueOrder) => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState('');

  const lane = laneOf(order, payBeforePrep);
  const open = lane !== 'done';
  const toPay = stillToPay(order);
  const refundOwed = refundOwedOf(order);
  const step =
    (lane === 'kitchen' || lane === 'ready') && !order.on_hold
      ? nextStepLabel(order.status, order.type)
      : null;
  const platform =
    order.source === 'BOLT_FOOD' ? 'Bolt' : order.source === 'CHOWDECK' ? 'Chowdeck' : null;
  const steps = stepsOf(order.type);
  const reached = steps.indexOf(order.status === 'NEW' ? 'CONFIRMED' : order.status);
  // One open link at a time: a new one once the last has failed or expired.
  const linkOpen = order.link?.status === 'QUEUED' || order.link?.status === 'SENT';
  const canSendLink = open && toPay > 0 && !platform && !!order.customer_phone && !linkOpen;
  const link = order.link ? linkWords(order.link) : null;

  const run = async (task: () => Promise<unknown>) => {
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

  const cancel = () =>
    run(async () => {
      const why = reason === 'Other' ? otherReason.trim() : reason;
      if (!why) throw new Error('Say why the order is being cancelled');
      await cancelOrder(counter, order.id, why);
      setCancelling(false);
    });

  return (
    <View style={styles.detail}>
      <View style={styles.detailHead}>
        <View style={styles.detailTitle}>
          <Text style={styles.detailNumber}>{order.display_number}</Text>
          <Badge
            label={SOURCE_LABELS[order.source]}
            tone={order.source === 'POS' ? 'neutral' : 'info'}
          />
          {order.type !== 'WALK_IN' && <Badge label={TYPE_LABELS[order.type]} />}
          <View style={styles.grow} />
          <Badge
            label={order.on_hold && open ? 'On hold' : STATUS_LABELS[order.status]}
            tone={order.on_hold && open ? 'amber' : statusTone(order.status)}
          />
        </View>
        {(order.customer_name || order.customer_phone) && (
          <Text style={styles.detailLine}>
            {order.customer_name ? `${order.customer_name}  ` : ''}
            <Text style={styles.mono}>{order.customer_phone ?? ''}</Text>
          </Text>
        )}
        {order.delivery_address && (
          <Text style={styles.detailLine}>Deliver to {order.delivery_address}</Text>
        )}
        {order.external_reference && (
          <Text style={[styles.detailLine, styles.mono]}>Ref {order.external_reference}</Text>
        )}
        {order.note && <Badge label={order.note} tone="amber" />}
        <View style={styles.payRow}>
          {open && toPay > 0 && <Badge label="Unpaid" tone="red" strong />}
          {open && toPay <= 0 && order.amount_paid > 0 && <Badge label="Paid" tone="good" />}
          {refundOwed > 0 && <Badge label="Refund owed" tone="amber" strong />}
          {order.provisional ? <Badge label="Not synced yet" tone="offline" /> : null}
          <Text style={styles.age}>{minutesSince(order.created_at_device, now)} min ago</Text>
        </View>
      </View>

      <ScrollView style={styles.grow} contentContainerStyle={styles.detailBody}>
        {order.status !== 'CANCELLED' && (
          <View style={styles.steps}>
            {steps.map((status, index) => (
              <View key={status} style={styles.step}>
                <View style={[styles.stepDot, index <= reached && styles.stepDotOn]} />
                <Text style={[styles.stepLabel, index <= reached && styles.stepLabelOn]}>
                  {STATUS_LABELS[status]}
                </Text>
              </View>
            ))}
          </View>
        )}

        {link && (
          <Text style={[styles.linkLine, { color: LINK_COLOURS[link.tone] }]}>{link.text}</Text>
        )}

        <View style={styles.section}>
          <Label text="Items" />
          {order.lines.map((line) => {
            const extras = extrasText(line);
            return (
              <View key={line.id} style={styles.itemRow}>
                <Text style={styles.itemQty}>{line.quantity}×</Text>
                <View style={styles.grow}>
                  <Text style={styles.itemName}>
                    {line.name}
                    {line.variant_name ? ` (${line.variant_name})` : ''}
                  </Text>
                  {extras ? <Text style={styles.itemExtras}>{extras}</Text> : null}
                </View>
                <Text style={styles.itemPrice}>{cedis(line.line_total)}</Text>
              </View>
            );
          })}
          {order.discount > 0 && (
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Discount from a manager</Text>
              <Text style={styles.sumValue}>−{cedis(order.discount)}</Text>
            </View>
          )}
          {order.delivery_fee > 0 && (
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Delivery</Text>
              <Text style={styles.sumValue}>{cedis(order.delivery_fee)}</Text>
            </View>
          )}
          <View style={[styles.sumRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>{cedis(order.total)}</Text>
          </View>
          {open && toPay > 0 && order.amount_paid > 0 && (
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Still to pay</Text>
              <Text style={styles.sumValue}>{cedis(toPay)}</Text>
            </View>
          )}
          {refundOwed > 0 && (
            <Text style={styles.warn}>
              {cedis(refundOwed)} was paid. A manager gives it back and records it on the dashboard.
            </Text>
          )}
          {order.cancel_reason && (
            <Text style={styles.detailLine}>Cancelled: {order.cancel_reason}</Text>
          )}
        </View>

        {cancelling && (
          <View style={styles.section}>
            {order.amount_paid > 0 && (
              <Text style={styles.warn}>
                {cedis(order.amount_paid)} has been paid. Cancelling leaves it as a refund owed.
              </Text>
            )}
            <Label text="Why is it being cancelled?" />
            <View style={styles.reasons}>
              {[...CANCEL_REASONS, 'Other'].map((option) => (
                <Chip
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
          </View>
        )}
        {problem && <Text style={styles.problem}>{problem}</Text>}
      </ScrollView>

      <View style={styles.actions}>
        {cancelling ? (
          <View style={styles.actionRow}>
            <Button
              label="Back"
              kind="secondary"
              size="md"
              onPress={() => setCancelling(false)}
              grow
            />
            <Button
              label="Cancel the order"
              kind="danger"
              size="md"
              onPress={cancel}
              busy={busy}
              grow
            />
          </View>
        ) : (
          <>
            {open && toPay > 0 && order.source === 'POS' && (
              <Button label={`Take ${cedis(toPay)} cash`} onPress={() => setPaying(true)} />
            )}
            {open && toPay > 0 && platform && (
              <Button
                label={`Paid on ${platform}`}
                onPress={() =>
                  run(() => markPaidOnPlatform(counter, { orderId: order.id, amount: toPay }))
                }
                busy={busy}
              />
            )}
            {canSendLink && (
              <Button
                label={
                  order.link ? 'Send a new payment link' : `Send a payment link for ${cedis(toPay)}`
                }
                kind={order.source === 'PHONE' ? 'primary' : 'secondary'}
                size={order.source === 'PHONE' ? 'lg' : 'md'}
                onPress={() => run(() => requestLink(counter, order.id, order.customer_phone!))}
                busy={busy}
              />
            )}
            {step && (
              <Button label={step} onPress={() => run(() => advance(counter, order))} busy={busy} />
            )}
            {open && (
              <View style={styles.actionRow}>
                <Button
                  label={order.on_hold ? 'Resume' : 'Hold'}
                  kind="secondary"
                  size="md"
                  onPress={() => run(() => setOnHold(counter, order.id, !order.on_hold))}
                  disabled={busy}
                  grow
                />
                <Button
                  label="Edit items"
                  kind="secondary"
                  size="md"
                  onPress={() => onEdit(order)}
                  disabled={busy || !canEditItems(order.status)}
                  grow
                />
                <Button
                  label="Cancel"
                  kind="danger"
                  size="md"
                  onPress={() => setCancelling(true)}
                  disabled={busy}
                  grow
                />
              </View>
            )}
          </>
        )}
      </View>

      {paying && (
        <PaymentSheet
          visible
          onClose={() => setPaying(false)}
          counter={counter}
          summary={{
            number: order.display_number,
            lines: order.lines.map((line) => ({
              key: line.id,
              name: line.variant_name ? `${line.name} (${line.variant_name})` : line.name,
              detail: extrasText(line) || undefined,
              quantity: line.quantity,
              total: line.line_total,
            })),
            total: order.total,
          }}
          due={toPay}
          allowLink={false}
          phone={order.customer_phone ?? ''}
          onCash={async (tendered, shiftId) => {
            await payCash(counter, { orderId: order.id, shiftId, amount: toPay, tendered });
            setPaying(false);
          }}
          onLink={async () => undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: colors.ground },
  linkLine: { fontFamily: font.medium, fontSize: text.body, lineHeight: 22 },
  grow: { flex: 1 },
  list: { flex: 58, borderRightWidth: 1, borderRightColor: colors.line },
  filters: {
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingTop: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  filter: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterOn: { borderBottomColor: colors.brand },
  filterLabel: { fontFamily: font.medium, fontSize: 15, color: colors.muted },
  filterLabelOn: { fontFamily: font.semibold, color: colors.brand },
  count: {
    minWidth: 22,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#DEDAD6',
    alignItems: 'center',
  },
  countOn: { backgroundColor: colors.brand },
  countLabel: { fontFamily: font.monoMedium, fontSize: 12, lineHeight: 18, color: colors.muted },
  countLabelOn: { color: colors.onBrand },
  rows: { padding: space.md, gap: 6 },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.muted, padding: space.md },
  row: {
    flexDirection: 'row',
    borderRadius: radii.lg,
    backgroundColor: '#EDECEA',
    borderWidth: 1.5,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  rowOn: { backgroundColor: colors.canvas, borderColor: colors.line },
  edge: { width: 4 },
  edgeRed: { backgroundColor: colors.red },
  edgeBrand: { backgroundColor: colors.brand },
  rowBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowNumber: { fontFamily: font.monoMedium, fontSize: 15, color: colors.ink },
  age: { fontFamily: font.monoMedium, fontSize: 13, color: colors.muted },
  amberText: { color: colors.amberInk },
  redText: { color: colors.redInk },
  rowMid: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  who: { fontFamily: font.medium, fontSize: 14, color: colors.ink, maxWidth: '45%' },
  summary: { flex: 1, fontFamily: font.regular, fontSize: 13, color: colors.muted },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTotal: { fontFamily: font.monoMedium, fontSize: 15, color: colors.ink },
  detail: { flex: 42, backgroundColor: colors.canvas },
  detailEmpty: {
    flex: 42,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailHead: {
    paddingHorizontal: space.lg,
    paddingTop: 20,
    paddingBottom: space.md,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  detailTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  detailNumber: { fontFamily: font.monoMedium, fontSize: text.heading, color: colors.ink },
  detailLine: { fontFamily: font.regular, fontSize: 14, color: colors.muted },
  mono: { fontFamily: font.mono },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  detailBody: { paddingHorizontal: space.lg, paddingBottom: space.md },
  steps: {
    flexDirection: 'row',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.disabled,
    backgroundColor: colors.track,
  },
  stepDotOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  stepLabel: { fontFamily: font.regular, fontSize: 12, color: colors.faint, textAlign: 'center' },
  stepLabelOn: { fontFamily: font.semibold, color: colors.ink },
  section: { paddingVertical: space.md, gap: 10 },
  itemRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  itemQty: { fontFamily: font.mono, fontSize: 14, color: colors.muted, minWidth: 26 },
  itemName: { fontFamily: font.medium, fontSize: 15, color: colors.ink },
  itemExtras: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  itemPrice: { fontFamily: font.mono, fontSize: 14, color: colors.text2 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sumLabel: { fontFamily: font.regular, fontSize: 14, color: colors.muted },
  sumValue: { fontFamily: font.mono, fontSize: 14, color: colors.text2 },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.tile, paddingTop: 10 },
  totalLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.ink },
  total: { fontFamily: font.monoMedium, fontSize: 18, color: colors.ink },
  warn: { fontFamily: font.medium, fontSize: 14, color: colors.amberInk },
  note: { fontFamily: font.regular, fontSize: 14, color: colors.muted },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  problem: { fontFamily: font.medium, fontSize: 14, color: colors.redInk },
  actions: {
    paddingHorizontal: space.lg,
    paddingTop: 14,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: space.sm,
  },
  actionRow: { flexDirection: 'row', gap: space.sm },
});
