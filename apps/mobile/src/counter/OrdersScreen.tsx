import { canEditItems, refundOwed, type OrderStatus, type OrderType } from '@brixx/shared';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { problemText } from '../tablet/api';
import { useEngineState } from '../tablet/TabletProvider';
import { Button } from '../ui/Button';
import { Badge, Chip } from '../ui/controls';
import { Field, Label } from '../ui/Field';
import { cedis, colors, font, radii, space, text, themed, themedStyles, timeOf } from '../ui/theme';
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
  isOpenFilter,
  minutesSince,
  stillToPay,
  type OrderFilter,
} from './views';
import { CANCEL_REASONS, STATUS_LABELS, kindLabel, linkWords, nextStepLabel } from './words';

/** A payment link's state is always a sentence; the colour only backs it up. */
const LINK_COLOURS = themed(() => ({
  info: colors.infoInk,
  good: colors.goodInk,
  amber: colors.amberInk,
  red: colors.redInk,
}));

type Tone = 'neutral' | 'good' | 'amber' | 'red' | 'info';

/** A status said as a coloured word, not a pill: the pills are kept for what must not be missed. */
const TONE_INK = themed(() => ({
  neutral: colors.muted,
  good: colors.goodInk,
  amber: colors.amberInk,
  red: colors.redInk,
  info: colors.infoInk,
}));

/** What an empty tab says, so it's clear which list is empty. */
const EMPTY: Record<OrderFilter, string> = {
  unpaid: 'Nothing waiting to be paid.',
  active: 'Nothing on the go.',
  held: 'Nothing on hold.',
  completed: 'Nothing finished yet today.',
  cancelled: 'Nothing cancelled today.',
};

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

/** Paid on a cancelled order, or paid over what's due, less refunds already recorded. */
const refundOwedOf = (order: QueueOrder) =>
  Math.max(
    0,
    refundOwed({
      status: order.status,
      total: order.total,
      deliveryFee: order.delivery_fee,
      deliveryFeeCollectedBy: order.delivery_fee_collected_by,
      amountPaid: order.amount_paid,
    }) - order.refunded,
  );

/**
 * Every order today under its own tab — Unpaid, Active, Held, Completed, Cancelled — most
 * urgent first within each. The list on the left, the chosen order and what can be done with it
 * on the right.
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
    const totals = Object.fromEntries(ORDER_FILTERS.map((option) => [option.value, 0])) as Record<
      OrderFilter,
      number
    >;
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBar}
          contentContainerStyle={styles.filters}
          accessibilityRole="tablist"
        >
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
        </ScrollView>
        <ScrollView contentContainerStyle={styles.rows}>
          {shown.length === 0 ? (
            <Text style={styles.empty}>{EMPTY[filter]}</Text>
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

/**
 * One order in the list, in two lines: who (or what) and the flags that must not be missed, then
 * how it came in and what's in it; the total, and where it stands, on the right. The chosen
 * order is raised off the list, the way a chosen segment is.
 */
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
  const open = isOpenFilter(filterOf(order));
  const unpaid = open && stillToPay(order) > 0;
  const refundOwed = refundOwedOf(order) > 0;
  const late = urgency(order.created_at_device, order.prepMinutes, now);
  const who = order.customer_name ?? order.customer_phone;
  const summary = order.lines
    .map((line) => `${line.quantity > 1 ? `${line.quantity}× ` : ''}${line.name}`)
    .join(', ');
  const held = order.on_hold && open;
  const status = held ? 'On hold' : STATUS_LABELS[order.status];
  const tone = held ? 'amber' : statusTone(order.status);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowOn, pressed && styles.rowPressed]}
    >
      <View
        style={[
          styles.edge,
          (unpaid || refundOwed) && styles.edgeRed,
          selected && !unpaid && !refundOwed && styles.edgeBrand,
        ]}
      />
      <Text style={styles.rowNumber}>{order.display_number}</Text>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.who} numberOfLines={1}>
            {who ?? summary}
          </Text>
          {unpaid && <Badge label="Unpaid" tone="red" strong />}
          {refundOwed && <Badge label="Refund owed" tone="amber" strong />}
          {order.provisional ? <Badge label="Not synced yet" tone="offline" /> : null}
        </View>
        <Text style={styles.summary} numberOfLines={1}>
          {kindLabel(order)}
          {who ? ` · ${summary}` : ''}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.rowTotal}>{cedis(order.total)}</Text>
        <Text style={styles.rowStatus} numberOfLines={1}>
          <Text style={{ color: TONE_INK[tone] }}>{status}</Text>
          {' · '}
          {open ? (
            <Text style={[late === 'amber' && styles.amberText, late === 'red' && styles.redText]}>
              {minutesSince(order.created_at_device, now)}m
            </Text>
          ) : (
            timeOf(order.created_at_device)
          )}
        </Text>
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
  const online = useEngineState(counter.engine)?.connection === 'online';
  const link = order.link ? linkWords(order.link, online) : null;

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
          <Text style={styles.detailKind}>{kindLabel(order)}</Text>
          <View style={styles.grow} />
          <Text style={styles.age}>
            {open
              ? `${minutesSince(order.created_at_device, now)} min ago`
              : timeOf(order.created_at_device)}
          </Text>
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
        {/* Where it stands is on the steps below; up here only what they don't show. */}
        <View style={styles.payRow}>
          {order.status === 'CANCELLED' && <Badge label="Cancelled" tone="red" />}
          {order.on_hold && open && <Badge label="On hold" tone="amber" />}
          {open && toPay > 0 && <Badge label="Unpaid" tone="red" strong />}
          {open && toPay <= 0 && order.amount_paid > 0 && <Badge label="Paid" tone="good" />}
          {refundOwed > 0 && <Badge label="Refund owed" tone="amber" strong />}
          {order.provisional ? <Badge label="Not synced yet" tone="offline" /> : null}
        </View>
      </View>

      <ScrollView style={styles.grow} contentContainerStyle={styles.detailBody}>
        {order.status !== 'CANCELLED' && (
          <View style={styles.steps}>
            {steps.map((status, index) => (
              <View key={status} style={styles.step}>
                {index > 0 && (
                  <View
                    style={[
                      styles.stepTrack,
                      styles.stepTrackBefore,
                      index <= reached && styles.stepTrackOn,
                    ]}
                  />
                )}
                {index < steps.length - 1 && (
                  <View
                    style={[
                      styles.stepTrack,
                      styles.stepTrackAfter,
                      index < reached && styles.stepTrackOn,
                    ]}
                  />
                )}
                <View
                  style={[
                    styles.stepDot,
                    index <= reached && styles.stepDotOn,
                    index === reached && styles.stepDotNow,
                  ]}
                />
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
          {order.provisional ? (
            <Text style={styles.provisional}>
              Worked out on this tablet. The server checks it once it's uploaded.
            </Text>
          ) : null}
          {open && toPay > 0 && order.amount_paid > 0 && (
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Still to pay</Text>
              <Text style={styles.sumValue}>{cedis(toPay)}</Text>
            </View>
          )}
          {refundOwed > 0 && (
            <Text style={styles.warn}>
              {order.status === 'CANCELLED'
                ? `${cedis(refundOwed)} was paid.`
                : `${cedis(refundOwed)} more than the order came to was paid.`}{' '}
              A manager gives it back and records it on the dashboard.
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
            {open && toPay > 0 && order.source === 'POS' && linkOpen && (
              <Text style={styles.note}>
                A payment link is still open. If they pay it as well, the extra shows as a refund
                owed.
              </Text>
            )}
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

const styles = themedStyles(() => ({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: colors.ground },
  linkLine: { fontFamily: font.medium, fontSize: text.body, lineHeight: 22 },
  rowTotalBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  provisional: {
    fontFamily: font.regular,
    fontSize: text.small,
    color: colors.offlineInk,
    marginTop: 4,
  },
  grow: { flex: 1 },
  list: { flex: 58, borderRightWidth: 1, borderRightColor: colors.line },
  /** The tabs scroll sideways, so five of them still fit on an 8" tablet. */
  filterBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.line },
  filters: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.md, paddingTop: 14 },
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
    backgroundColor: colors.countBg,
    alignItems: 'center',
  },
  countOn: { backgroundColor: colors.brand },
  countLabel: { fontFamily: font.monoMedium, fontSize: 12, lineHeight: 18, color: colors.muted },
  countLabelOn: { color: colors.onBrand },
  rows: { paddingHorizontal: space.sm, paddingVertical: space.sm, gap: 2 },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.muted, padding: space.md },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: space.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  rowOn: { backgroundColor: colors.raised },
  rowPressed: { backgroundColor: colors.tile },
  /** Red for money owed either way; the brand colour for the chosen order. */
  edge: { alignSelf: 'stretch', width: 4 },
  edgeRed: { backgroundColor: colors.red },
  edgeBrand: { backgroundColor: colors.brand },
  rowNumber: { minWidth: 48, fontFamily: font.monoMedium, fontSize: 17, color: colors.ink },
  rowBody: { flex: 1, gap: 3, paddingVertical: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  who: { flexShrink: 1, fontFamily: font.medium, fontSize: 15, color: colors.ink },
  summary: { fontFamily: font.regular, fontSize: 13, color: colors.muted },
  rowEnd: { alignItems: 'flex-end', gap: 3, maxWidth: '38%' },
  rowTotal: { fontFamily: font.monoMedium, fontSize: 15, color: colors.ink },
  rowStatus: { fontFamily: font.medium, fontSize: 13, color: colors.muted },
  age: { fontFamily: font.monoMedium, fontSize: 13, color: colors.muted },
  amberText: { color: colors.amberInk },
  redText: { color: colors.redInk },
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
  detailNumber: { fontFamily: font.monoMedium, fontSize: text.total, color: colors.ink },
  detailKind: { fontFamily: font.medium, fontSize: text.small, color: colors.muted },
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
  /** Where the order is now: a halo, so it reads apart from the steps already done. */
  stepDotNow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 5,
    borderColor: colors.brandTint,
    marginTop: -3,
    marginBottom: -3,
  },
  /**
   * The line joining one step to the next. Each step draws its own half, from its edge to the
   * middle, so the halves of neighbouring steps meet; the dot is opaque and covers the ends.
   * A half is lit once the journey has passed through it.
   */
  stepTrack: { position: 'absolute', top: 7, height: 2, backgroundColor: colors.line },
  stepTrackBefore: { left: 0, right: '50%' },
  stepTrackAfter: { left: '50%', right: 0 },
  stepTrackOn: { backgroundColor: colors.brand },
  stepLabel: { fontFamily: font.regular, fontSize: 12, color: colors.muted, textAlign: 'center' },
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
}));
