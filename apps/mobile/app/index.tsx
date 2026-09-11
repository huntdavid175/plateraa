import { amountDue, sub, type Pesewas } from '@plateraa/shared';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  OPEN_SHIFT_SQL,
  advance,
  markPaidOnPlatform,
  openDrawer,
  payCash,
  placeOrder,
  requestLink,
  setOnHold,
  updateItems,
} from '../src/counter/actions';
import { isPlatform, toDraft, type Checkout } from '../src/counter/checkout';
import { asksForDrawer } from '../src/counter/drawer';
import { DrawerScreen } from '../src/counter/DrawerScreen';
import { DrawerSheet } from '../src/counter/DrawerSheet';
import { today, useCounter, useMenu, usePayBeforePrep, useQueue } from '../src/counter/hooks';
import { KitchenScreen } from '../src/counter/KitchenScreen';
import { laneOf } from '../src/counter/lanes';
import { needsChoice, type MenuItem } from '../src/counter/menu';
import { MenuPane } from '../src/counter/MenuPane';
import { upcomingNumber } from '../src/counter/numbers';
import { OptionsSheet } from '../src/counter/OptionsSheet';
import { OrderPane } from '../src/counter/OrderPane';
import { OrdersScreen } from '../src/counter/OrdersScreen';
import { PaymentSheet } from '../src/counter/PaymentSheet';
import { ticketLinesOf, type QueueOrder } from '../src/counter/queue';
import { QuickOrderSheet } from '../src/counter/QuickOrderSheet';
import { RemoteOrderPanel } from '../src/counter/RemoteOrderPanel';
import { SaleDone, type Done } from '../src/counter/SaleDone';
import { StockScreen } from '../src/counter/StockScreen';
import { addToTicket, priceTicket, replaceLine, type TicketLine } from '../src/counter/ticket';
import { TopBar, type CounterTab } from '../src/counter/TopBar';
import { SOURCE_LABELS, phoneWords } from '../src/counter/words';
import { problemText } from '../src/tablet/api';
import { newId } from '../src/tablet/ids';
import { useLocalQuery, useTablet } from '../src/tablet/TabletProvider';
import { SyncBanner } from '../src/ui/SyncBanner';
import { cedis, colors, font, radii, space } from '../src/ui/theme';

/** "Not now" on the drawer prompt lasts the trading day, across lock and unlock. */
let drawerSkippedOn: string | null = null;

/**
 * The counter: tabs for taking orders, following them (Orders) and cooking them (Kitchen).
 * Taking an order is two panes: the menu, and the order being typed in.
 */
export default function CounterScreen() {
  const { device, staff } = useTablet();
  const counter = useCounter();
  const menu = useMenu();
  const orders = useQueue();
  const payBeforePrep = usePayBeforePrep();
  const stored = useLocalQuery<{ value: string }>(
    `SELECT value FROM meta WHERE key = 'order_number'`,
  );
  const openShift = useLocalQuery<{ id: string }>(OPEN_SHIFT_SQL, [device?.deviceId ?? '']);
  const [tab, setTab] = useState<CounterTab>('counter');
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [remote, setRemote] = useState(false);
  const [editing, setEditing] = useState<QueueOrder | null>(null);
  const [picking, setPicking] = useState<{ item: MenuItem; line?: TicketLine } | null>(null);
  const [charging, setCharging] = useState<Checkout | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; problem: boolean } | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [quickId, setQuickId] = useState<string | null>(null);
  const [stepping, setStepping] = useState(false);
  const [skippedOn, setSkippedOn] = useState(drawerSkippedOn);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const itemsById = useMemo(
    () => new Map((menu ?? []).flatMap((category) => category.items).map((i) => [i.id, i])),
    [menu],
  );
  const cooking = useMemo(
    () => (orders ?? []).filter((order) => laneOf(order, payBeforePrep) === 'kitchen'),
    [orders, payBeforePrep],
  );
  const ready = useMemo(
    () => (orders ?? []).filter((order) => laneOf(order, payBeforePrep) === 'ready'),
    [orders, payBeforePrep],
  );

  if (!counter || !device) return null;

  const number = upcomingNumber(stored?.[0]?.value, device.deviceCode, today());
  const quickOrder = quickId
    ? ((orders ?? []).find((order) => order.id === quickId) ?? null)
    : null;
  const drawerPrompt =
    tab === 'counter' &&
    !charging &&
    asksForDrawer({
      runsDrawer: staff?.capabilities.has('shift.operate') ?? false,
      drawerOpen: openShift === null ? null : openShift.length > 0,
      skippedOn,
      today: today(),
    });

  const say = (text: string) => setNotice({ text, problem: false });
  const fail = (error: unknown) => setNotice({ text: problemText(error), problem: true });
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  const clear = () => {
    setLines([]);
    setRemote(false);
    setCharging(null);
    setResetKey((key) => key + 1);
  };

  const canChange = (line: TicketLine) => {
    const item = itemsById.get(line.itemId);
    return Boolean(item && (item.variants.length || item.groups.length));
  };
  const changeLine = (line: TicketLine) => {
    const item = itemsById.get(line.itemId);
    if (item) setPicking({ item, line });
  };
  const pick = (item: MenuItem) => {
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

  const charge = (checkout: Checkout) => {
    try {
      toDraft(checkout, lines, false);
      setCharging(checkout);
    } catch (error) {
      fail(error);
    }
  };

  const hold = (checkout: Checkout) =>
    run(async () => {
      const placed = await placeOrder(counter, toDraft(checkout, lines, false));
      await setOnHold(counter, placed.orderId, true);
      clear();
      say(`${placed.displayNumber} is on hold. Find it under Orders, Held.`);
    });

  const paidCash = async (tendered: Pesewas, shiftId: string) => {
    const placed = await placeOrder(counter, toDraft(charging!, lines, false));
    await payCash(counter, { orderId: placed.orderId, shiftId, amount: placed.due, tendered });
    clear();
    setDone({
      number: placed.displayNumber,
      change: sub(tendered, placed.due),
      message: 'Paid in cash. It’s with the kitchen.',
    });
  };

  /** Saves the order and its payment link together; the link is texted once the tablet is online. */
  const withLink = async (checkout: Checkout) => {
    const draft = toDraft(checkout, lines, true);
    const placed = await placeOrder(counter, draft);
    const phone = draft.customer!.phone;
    if (placed.due > 0) await requestLink(counter, placed.orderId, phone);
    clear();
    setDone({
      number: placed.displayNumber,
      change: null,
      message: `Payment link for ${cedis(placed.due)} going to ${phoneWords(phone)}. The order goes to the kitchen once it’s paid.`,
    });
  };

  const sentLink = (phone: string) => withLink({ ...charging!, phone });

  const submitRemote = (checkout: Checkout) =>
    run(async () => {
      if (!isPlatform(checkout.source)) {
        await withLink(checkout);
        return;
      }
      const placed = await placeOrder(counter, toDraft(checkout, lines, false));
      await markPaidOnPlatform(counter, { orderId: placed.orderId, amount: placed.due });
      clear();
      setDone({
        number: placed.displayNumber,
        change: null,
        message: `Paid on ${SOURCE_LABELS[checkout.source]}. It’s with the kitchen.`,
      });
    });

  const stepQuick = async (order: QueueOrder) => {
    setStepping(true);
    try {
      await advance(counter, order);
    } catch (error) {
      fail(error);
    } finally {
      setStepping(false);
      setQuickId(null);
    }
  };

  const skipDrawer = () => {
    drawerSkippedOn = today();
    setSkippedOn(drawerSkippedOn);
  };

  const startEdit = (order: QueueOrder) => {
    setEditing(order);
    setRemote(false);
    setLines(ticketLinesOf(order));
    setTab('counter');
  };
  const stopEdit = () => {
    setEditing(null);
    clear();
  };
  const saveEdit = () =>
    run(async () => {
      if (!editing) return;
      if (!lines.length) {
        throw new Error('An order needs at least one item. To drop it, cancel the order.');
      }
      await updateItems(counter, editing.id, lines);
      say(`Saved the changes to ${editing.display_number}.`);
      setEditing(null);
      clear();
    });

  const charged = charging
    ? priceTicket(lines, charging.delivery && charging.fee ? charging.fee : undefined)
    : null;

  return (
    <View style={styles.screen}>
      <TopBar tab={tab} onTab={setTab} />
      <SyncBanner offline={false} refused={false} />

      {tab === 'counter' && (
        <View style={styles.body}>
          <MenuPane
            menu={menu}
            onPick={pick}
            cooking={cooking}
            ready={ready}
            onOrder={(order) => setQuickId(order.id)}
          />
          {remote && !editing ? (
            <RemoteOrderPanel
              number={number}
              lines={lines}
              onLines={setLines}
              canChange={canChange}
              onChangeLine={changeLine}
              onCancel={() => setRemote(false)}
              onSubmit={submitRemote}
              busy={busy}
            />
          ) : (
            <OrderPane
              number={number}
              lines={lines}
              onLines={setLines}
              canChange={canChange}
              onChangeLine={changeLine}
              editing={editing}
              onStopEditing={stopEdit}
              onSaveEdit={saveEdit}
              onRemote={() => setRemote(true)}
              onCharge={charge}
              onHold={hold}
              busy={busy}
              resetKey={resetKey}
            />
          )}
        </View>
      )}
      {tab === 'orders' && (
        <OrdersScreen
          orders={orders}
          counter={counter}
          payBeforePrep={payBeforePrep}
          onEdit={startEdit}
        />
      )}
      {tab === 'kitchen' && (
        <KitchenScreen orders={orders} counter={counter} payBeforePrep={payBeforePrep} />
      )}
      {tab === 'drawer' && <DrawerScreen counter={counter} />}
      {tab === 'stock' && <StockScreen counter={counter} />}

      <OptionsSheet
        item={picking?.item ?? null}
        line={picking?.line}
        onClose={() => setPicking(null)}
        onAdd={(line) => {
          setLines((current) =>
            picking?.line ? replaceLine(current, line) : addToTicket(current, line),
          );
          setPicking(null);
        }}
      />

      {charging && charged && (
        <PaymentSheet
          visible
          onClose={() => setCharging(null)}
          counter={counter}
          summary={{
            number,
            lines: lines.map((line, index) => ({
              key: line.lineId,
              name: line.variantName ? `${line.name} (${line.variantName})` : line.name,
              detail: line.modifiers.map((m) => `+ ${m.name}`).join(', ') || undefined,
              quantity: line.quantity,
              total: charged.lines[index]!.lineTotal,
            })),
            total: charged.total,
          }}
          due={amountDue({
            total: charged.total,
            deliveryFee: charged.deliveryFee,
            deliveryFeeCollectedBy: charging.riderKeepsFee ? 'RIDER' : null,
          })}
          allowLink
          phone={charging.phone}
          onCash={paidCash}
          onLink={sentLink}
        />
      )}

      <QuickOrderSheet
        order={quickOrder}
        busy={stepping}
        onStep={(order) => void stepQuick(order)}
        onOpenKitchen={() => {
          setQuickId(null);
          setTab('kitchen');
        }}
        onClose={() => setQuickId(null)}
      />

      <DrawerSheet
        visible={drawerPrompt}
        onOpen={async (float) => {
          await openDrawer(counter, float);
        }}
        onSkip={skipDrawer}
      />

      <SaleDone done={done} onDismiss={() => setDone(null)} />

      {notice && (
        <View style={[styles.toast, notice.problem && styles.toastProblem]} pointerEvents="none">
          <Text style={styles.toastText}>{notice.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  body: { flex: 1, flexDirection: 'row' },
  toast: {
    position: 'absolute',
    left: space.lg,
    bottom: 72,
    maxWidth: 560,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  toastProblem: { backgroundColor: colors.redInk },
  toastText: { fontFamily: font.medium, fontSize: 15, color: colors.onBrand },
});
