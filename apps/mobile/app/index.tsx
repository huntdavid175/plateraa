import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useEngineState, useLocalQuery, useTablet } from '../src/tablet/TabletProvider';
import { Button } from '../src/ui/Button';
import { SyncBanner } from '../src/ui/SyncBanner';
import { colors, plural, radius, space, text } from '../src/ui/theme';

/**
 * The main counter screen. Order entry (left) and the kitchen queue (right) arrive with
 * plan.md §2.3; for now it shows who's unlocked and what the tablet has downloaded.
 */
export default function Home() {
  const { staff, device, engine, lock } = useTablet();
  const state = useEngineState(engine);
  const router = useRouter();
  const counts = useLocalQuery<{ items: number; people: number }>(
    `SELECT (SELECT count(*) FROM items WHERE active = 1) AS items,
            (SELECT count(*) FROM staff WHERE active = 1) AS people`,
  );
  const downloaded = counts?.[0];
  const canAddStaff = staff?.capabilities.has('staff.manage') ?? false;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.business}>{device?.businessName}</Text>
          <Text style={styles.meta}>
            {device?.deviceName} · tablet {device?.deviceCode}
          </Text>
        </View>
        <View style={styles.who}>
          <Text style={styles.staffName}>{staff?.displayName}</Text>
          <Button label="Lock" kind="secondary" onPress={lock} />
        </View>
      </View>

      <SyncBanner />

      <View style={styles.panes}>
        <View style={styles.pane}>
          <Text style={styles.paneTitle}>Orders</Text>
          <Text style={styles.hint}>Taking orders is being built next.</Text>
          {downloaded && (
            <Text style={styles.hint}>
              On this tablet: {plural(downloaded.items, 'menu item')} and{' '}
              {plural(downloaded.people, 'person', 'people')} on the staff list.
            </Text>
          )}
        </View>
        <View style={styles.pane}>
          <Text style={styles.paneTitle}>Kitchen queue</Text>
          <Text style={styles.hint}>Orders being prepared will show here.</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {canAddStaff && (
          <Button label="Add staff" kind="secondary" onPress={() => router.push('/add-staff')} />
        )}
        <Button
          label={
            state?.needsAttention ? `Needs attention (${state.needsAttention})` : 'Needs attention'
          }
          kind="secondary"
          onPress={() => router.push('/attention')}
        />
        <Button label="Tablet check" kind="secondary" onPress={() => router.push('/diagnostics')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.md, padding: space.lg, backgroundColor: colors.ground },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  business: { fontSize: text.heading, fontWeight: '700', color: colors.ink },
  meta: { fontSize: text.small, color: colors.muted },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  staffName: { fontSize: text.body, fontWeight: '600', color: colors.ink },
  panes: { flex: 1, flexDirection: 'row', gap: space.lg },
  pane: {
    flex: 1,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius,
    padding: space.lg,
  },
  paneTitle: { fontSize: text.heading, fontWeight: '700', color: colors.ink },
  hint: { fontSize: text.body, color: colors.muted },
  actions: { flexDirection: 'row', gap: space.md },
});
