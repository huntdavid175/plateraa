import { amountDue, type Pesewas } from '@plateraa/shared';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  markPaidOnPlatform,
  payCash,
  placeOrder,
  setOnHold,
  updateItems,
} from '../src/counter/actions';
import { isPlatform, toDraft, type Checkout } from '../src/counter/checkout';
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
import { RemoteOrderPanel } from '../src/counter/RemoteOrderPanel';
import { addToTicket, priceTicket, replaceLine, type TicketLine } from '../src/counter/ticket';
import { TopBar, type CounterTab } from '../src/counter/TopBar';
import { LINKS_NOT_ON } from '../src/counter/words';
import { problemText } from '../src/tablet/api';
import { newId } from '../src/tablet/ids';
import { useLocalQuery, useTablet } from '../src/tablet/TabletProvider';
import { SyncBanner } from '../src/ui/SyncBanner';
import { cedis, colors, font, radii, space } from '../src/ui/theme';

/**
 * The counter: tabs for taking orders, following them (Orders) and cooking them (Kitchen).
 * Taking an order is two panes: the menu, and the order being typed in.
 */
export default function CounterScreen() {
  const { device } = useTablet();
  const counter = useCounter();
  const menu = useMenu();
  const orders = useQueue();
  const payBeforePrep = usePayBeforePrep();
  const stored = useLocalQuery<{ value: string }>(
    `SELECT value FROM meta WHERE key = 'order_number'`,
  );
  const [tab, setTab] = useState<CounterTab>('counter');
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [remote, setRemote] = useState(false);
  const [editing, setEditing] = useState<QueueOrder | null>(null);
  const [picking, setPicking] = useState<{ item: MenuItem; line?: TicketLine } | null>(null);
  const [charging, setCharging] = useState<Checkout | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; problem: boolean } | null>(null);
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

  if (!counter || !device) return null;

  const number = upcomingNumber(stored?.[0]?.value, device.deviceCode, today());

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
    say(`${placed.displayNumber} is with the kitchen. Change: ${cedis(tendered - placed.due)}`);
  };

  const sentLink = async (phone: string) => {
    const placed = await placeOrder(counter, toDraft({ ...charging!, phone }, lines, true));
    clear();
    say(`${placed.displayNumber} is waiting for ${cedis(placed.due)}. ${LINKS_NOT_ON}`);
  };

  const submitRemote = (checkout: Checkout) =>
    run(async () => {
      const platform = isPlatform(checkout.source);
      const placed = await placeOrder(counter, toDraft(checkout, lines, !platform));
      if (platform) {
        await markPaidOnPlatform(counter, { orderId: placed.orderId, amount: placed.due });
        say(`${placed.displayNumber} is with the kitchen.`);
      } else {
        say(`${placed.displayNumber} is waiting for its payment link. ${LINKS_NOT_ON}`);
      }
      clear();
    });

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
            onOpenKitchen={() => setTab('kitchen')}
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
