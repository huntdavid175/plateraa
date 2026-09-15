import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEngineState, useTablet } from '../tablet/TabletProvider';
import { chime } from '../ui/chime';
import { colors, font, radii, space, themedStyles } from '../ui/theme';
import { listen, type Heard, type OrderAlert, type WatchedLink, type WatchedOrder } from './alerts';
import { PAY_BEFORE_PREP_SQL, payBeforePrepOf, today } from './hooks';

const OPEN_OR_TODAY = `o.business_date = ? OR o.status NOT IN ('COMPLETED', 'CANCELLED', 'REFUNDED')`;

const ORDERS_SQL = `SELECT o.id, o.display_number, o.source, o.type, o.device_id, o.status, o.on_hold,
       o.total, o.delivery_fee, o.delivery_fee_collected_by, o.amount_paid, o.pay_on_collection
  FROM orders o WHERE ${OPEN_OR_TODAY}`;

const LINKS_SQL = `SELECT l.id, l.order_id, l.status, l.phone, l.failure
  FROM payment_links l JOIN orders o ON o.id = l.order_id WHERE ${OPEN_OR_TODAY}`;

/** How long a note stays up, unless tapped away. */
const SHOWN_MS = 10_000;
/** The most notes shown at once, newest on top. */
const MOST_SHOWN = 3;

/**
 * Tells the counter what arrived by itself: a chime and a note for each new online order, and a
 * note as each payment link from this tablet is texted, paid (with the chime) or fails. It
 * watches on the lock screen too, since that's when an order is most easily missed.
 */
export function OrderAlerts() {
  const { db, engine, device, phase } = useTablet();
  const version = useEngineState(engine)?.dataVersion ?? 0;
  const insets = useSafeAreaInsets();
  const heard = useRef<Heard | null>(null);
  // One look at a time, so two quick syncs can't both announce the same order.
  const looking = useRef(Promise.resolve());
  const [shown, setShown] = useState<OrderAlert[]>([]);
  const watching = phase === 'locked' || phase === 'unlocked';
  const deviceId = device?.deviceId ?? null;

  useEffect(() => {
    if (!db || !deviceId || !watching) {
      heard.current = null;
      return;
    }
    looking.current = looking.current
      .then(async () => {
        const date = today();
        const setting = await db.get<{ on: number | null }>(PAY_BEFORE_PREP_SQL);
        const orders = await db.all<WatchedOrder>(ORDERS_SQL, [date]);
        const links = await db.all<WatchedLink>(LINKS_SQL, [date]);
        const result = listen(heard.current, orders, links, {
          deviceId,
          payBeforePrep: payBeforePrepOf(setting?.on),
        });
        heard.current = result.heard;
        if (!result.alerts.length) return;
        if (result.alerts.some((alert) => alert.chime)) chime();
        setShown((current) => [...[...result.alerts].reverse(), ...current].slice(0, MOST_SHOWN));
        for (const alert of result.alerts) {
          setTimeout(
            () => setShown((current) => current.filter((one) => one.id !== alert.id)),
            SHOWN_MS,
          );
        }
      })
      .catch((error: unknown) => console.warn('Looking for new orders failed', error));
  }, [db, deviceId, watching, version]);

  if (!shown.length) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.stack, { top: insets.top + 64 + space.sm, right: insets.right + space.lg }]}
    >
      {shown.map((alert) => {
        const problem = alert.tone === 'problem';
        return (
          <Pressable
            key={alert.id}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityHint="Tap to close"
            onPress={() => setShown((current) => current.filter((one) => one.id !== alert.id))}
            style={[styles.note, problem && styles.noteProblem]}
          >
            {!problem && (
              <View
                style={[styles.dot, alert.tone === 'order' ? styles.dotOrder : styles.dotGood]}
              />
            )}
            <View style={styles.words}>
              <Text style={[styles.title, problem && styles.onProblem]}>{alert.title}</Text>
              <Text style={[styles.detail, problem && styles.onProblem]}>{alert.detail}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  stack: { position: 'absolute', width: 420, maxWidth: '60%', gap: space.sm },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.inverse,
    borderRadius: radii.lg,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    elevation: 4,
  },
  noteProblem: { backgroundColor: colors.redSolid },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  dotOrder: { backgroundColor: colors.brand },
  dotGood: { backgroundColor: colors.online },
  words: { flex: 1 },
  title: { fontFamily: font.semibold, fontSize: 16, color: colors.onInverse },
  detail: { fontFamily: font.regular, fontSize: 15, color: colors.onInverse, marginTop: 2 },
  onProblem: { color: colors.onBrand },
}));
