import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCounter, usePayBeforePrep, useQueue } from '../src/counter/hooks';
import { OrderEntry } from '../src/counter/OrderEntry';
import { OrderSheet } from '../src/counter/OrderSheet';
import { OrdersPanel } from '../src/counter/OrdersPanel';
import type { QueueOrder } from '../src/counter/queue';
import { useEngineState, useTablet } from '../src/tablet/TabletProvider';
import { Button } from '../src/ui/Button';
import { SyncBanner } from '../src/ui/SyncBanner';
import { colors, space, text } from '../src/ui/theme';

/** The counter: take orders on the left, follow them through the kitchen on the right. */
export default function CounterScreen() {
  const { staff, device, engine, lock } = useTablet();
  const state = useEngineState(engine);
  const counter = useCounter();
  const orders = useQueue();
  const payBeforePrep = usePayBeforePrep();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<QueueOrder | null>(null);

  if (!counter) return null;
  const opened = orders?.find((order) => order.id === openId) ?? null;
  const canAddStaff = staff?.capabilities.has('staff.manage') ?? false;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Text style={styles.business} numberOfLines={1}>
          {device?.businessName} <Text style={styles.meta}>· tablet {device?.deviceCode}</Text>
        </Text>
        {state && state.needsAttention > 0 && (
          <Button
            label={`Needs attention (${state.needsAttention})`}
            kind="danger"
            onPress={() => router.push('/attention')}
          />
        )}
        {canAddStaff && (
          <Button label="Add staff" kind="secondary" onPress={() => router.push('/add-staff')} />
        )}
        <Button label="Check" kind="secondary" onPress={() => router.push('/diagnostics')} />
        <Text style={styles.staff}>{staff?.displayName}</Text>
        <Button label="Lock" kind="secondary" onPress={lock} />
      </View>

      <SyncBanner />

      <View style={styles.body}>
        <OrderEntry counter={counter} editing={editing} onEditDone={() => setEditing(null)} />
        <OrdersPanel
          orders={orders}
          payBeforePrep={payBeforePrep}
          counter={counter}
          onOpen={(order) => setOpenId(order.id)}
        />
      </View>

      <OrderSheet
        order={opened}
        counter={counter}
        payBeforePrep={payBeforePrep}
        onClose={() => setOpenId(null)}
        onEdit={setEditing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.sm, padding: space.md, backgroundColor: colors.ground },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  business: { flex: 1, fontSize: text.heading, fontWeight: '700', color: colors.ink },
  meta: { fontSize: text.small, fontWeight: '400', color: colors.muted },
  staff: { fontSize: text.body, fontWeight: '600', color: colors.ink },
  body: { flex: 1, flexDirection: 'row', gap: space.md },
});
