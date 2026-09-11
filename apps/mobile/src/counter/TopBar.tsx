import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SyncState } from '../offline/engine';
import { useEngineState, useTablet } from '../tablet/TabletProvider';
import { Badge } from '../ui/controls';
import { colors, font, plural, radii, space, text } from '../ui/theme';

export type CounterTab = 'counter' | 'orders' | 'kitchen' | 'drawer';

const TABS: readonly { value: CounterTab; label: string }[] = [
  { value: 'counter', label: 'Counter' },
  { value: 'orders', label: 'Orders' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'drawer', label: 'Drawer' },
];

/** Online, offline (grey-blue) or signed out, always as a word. */
function connectionOf(state: SyncState | null) {
  if (!state || state.connection === 'unknown') {
    return { word: 'Connecting', dot: colors.faint, ink: colors.muted };
  }
  if (state.connection === 'signed-out') {
    return { word: 'Signed out', dot: colors.red, ink: colors.redInk };
  }
  if (state.connection === 'offline') {
    return {
      word: state.pending ? `Offline · ${state.pending} waiting` : 'Offline',
      dot: colors.offlineInk,
      ink: colors.offlineInk,
    };
  }
  if (state.pending) {
    return { word: `Uploading ${state.pending}`, dot: colors.online, ink: colors.goodInk };
  }
  return { word: 'Online', dot: colors.online, ink: colors.goodInk };
}

/** One quiet row: the business, the tabs, the connection, and who is using the tablet. */
export function TopBar({ tab, onTab }: { tab: CounterTab; onTab: (tab: CounterTab) => void }) {
  const { device, engine, staff, lock } = useTablet();
  const state = useEngineState(engine);
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const connection = connectionOf(state);
  const canAddStaff = staff?.capabilities.has('staff.manage') ?? false;
  const runsDrawer = staff?.capabilities.has('shift.operate') ?? false;
  const tabs = TABS.filter((option) => option.value !== 'drawer' || runsDrawer);

  const go = (path: '/add-staff' | '/attention' | '/diagnostics') => {
    setMenuOpen(false);
    router.push(path);
  };

  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        <Text style={styles.business} numberOfLines={1}>
          {device?.businessName}
        </Text>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map((option) => {
          const on = option.value === tab;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => onTab(option.value)}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.side, styles.right]}>
        {state && state.needsAttention > 0 && (
          <Pressable accessibilityRole="button" onPress={() => go('/attention')}>
            <Badge label={`${plural(state.needsAttention, 'change')} refused`} tone="red" />
          </Pressable>
        )}
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: connection.dot }]} />
          <Text style={[styles.statusWord, { color: connection.ink }]}>{connection.word}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        >
          <Text style={styles.pillLabel}>More</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${staff?.displayName ?? ''}, tap to lock`}
          onPress={lock}
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        >
          <Text style={styles.pillLabel}>{staff?.displayName}</Text>
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        supportedOrientations={['landscape', 'portrait']}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menu} onStartShouldSetResponder={() => true}>
            {canAddStaff && <MenuItem label="Add staff" onPress={() => go('/add-staff')} />}
            <MenuItem
              label={
                state?.needsAttention
                  ? `Needs attention (${state.needsAttention})`
                  : 'Needs attention'
              }
              onPress={() => go('/attention')}
            />
            <MenuItem label="Tablet check" onPress={() => go('/diagnostics')} />
            <MenuItem
              label="Lock the tablet"
              onPress={() => {
                setMenuOpen(false);
                lock();
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && styles.pillPressed]}
    >
      <Text style={styles.menuLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end', gap: space.md },
  business: { fontFamily: font.semibold, fontSize: 17, color: colors.ink },
  tabs: { flexDirection: 'row', gap: space.xs },
  tab: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radii.md,
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: colors.brand },
  tabLabel: { fontFamily: font.medium, fontSize: text.body, color: colors.muted },
  tabLabelOn: { fontFamily: font.semibold, color: colors.onBrand },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusWord: { fontFamily: font.medium, fontSize: text.small },
  pill: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
  },
  pillPressed: { backgroundColor: colors.track },
  pillLabel: { fontFamily: font.medium, fontSize: 15, color: colors.ink },
  menuBackdrop: { flex: 1, alignItems: 'flex-end', paddingTop: 64, paddingRight: space.lg },
  menu: {
    width: 260,
    backgroundColor: colors.canvas,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: space.xs,
    elevation: 4,
  },
  menuItem: { minHeight: 52, justifyContent: 'center', paddingHorizontal: space.md },
  menuLabel: { fontFamily: font.medium, fontSize: text.body, color: colors.ink },
});
