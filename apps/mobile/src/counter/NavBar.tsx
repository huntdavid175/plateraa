import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEngineState, useLocalQuery, useTablet } from '../tablet/TabletProvider';
import { saveAppearance } from '../ui/appearance';
import { initialOf, personColour } from '../ui/people';
import {
  CounterIcon,
  DrawerIcon,
  KitchenIcon,
  MoreIcon,
  OrdersIcon,
  StockIcon,
  type IconProps,
} from '../ui/icons';
import { colors, font, getScheme, plural, radii, space, text, themedStyles } from '../ui/theme';

export type CounterTab = 'counter' | 'orders' | 'kitchen' | 'drawer' | 'stock';

/** How tall the bar is, so a screen can keep its own things clear of it. */
export const NAV_BAR_HEIGHT = 68;

const TABS: readonly {
  value: CounterTab;
  label: string;
  Icon: (props: IconProps) => ReactElement;
}[] = [
  { value: 'counter', label: 'Counter', Icon: CounterIcon },
  { value: 'orders', label: 'Orders', Icon: OrdersIcon },
  { value: 'kitchen', label: 'Kitchen', Icon: KitchenIcon },
  { value: 'drawer', label: 'Drawer', Icon: DrawerIcon },
  { value: 'stock', label: 'Stock', Icon: StockIcon },
];

/**
 * The bar along the bottom of the counter: who is on the till, one button per part of the app
 * (an icon and a word, the one in use in the brand colour), and More. A POS keeps its menu down
 * here, within reach of both thumbs on a tablet standing on the counter.
 */
export function NavBar({ tab, onTab }: { tab: CounterTab; onTab: (tab: CounterTab) => void }) {
  const { engine, staff, lock } = useTablet();
  const state = useEngineState(engine);
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  // The menu rises from above this bar, which sits above the tablet's navigation bar.
  const insets = useSafeAreaInsets();
  // Online orders the store asks staff to accept before the kitchen starts.
  const toAccept =
    useLocalQuery<{ count: number }>(
      `SELECT count(*) AS count FROM orders WHERE source = 'STOREFRONT' AND status = 'NEW'`,
    )?.[0]?.count ?? 0;
  const refused = state?.needsAttention ?? 0;
  // The colour they were picked by on the lock screen, carried through to the till.
  const colour = personColour(staff?.id ?? '');
  const canAddStaff = staff?.capabilities.has('staff.manage') ?? false;
  const runsDrawer = staff?.capabilities.has('shift.operate') ?? false;
  const countsStock = staff?.capabilities.has('stock.count') ?? false;
  const tabs = TABS.filter((option) =>
    option.value === 'drawer' ? runsDrawer : option.value === 'stock' ? countsStock : true,
  );

  const go = (path: '/today' | '/add-staff' | '/attention' | '/diagnostics') => {
    setMenuOpen(false);
    router.push(path);
  };

  /** The name sits next to the tabs, so a mis-tap shouldn't throw someone off the till. */
  const askToLock = () =>
    Alert.alert(
      'Lock the tablet?',
      'Whoever uses it next types their PIN. An order being typed in is cleared; saved orders are safe.',
      [
        { text: 'Stay on', style: 'cancel' },
        { text: 'Lock', onPress: lock },
      ],
    );

  return (
    <View style={styles.bar} accessibilityRole="tablist">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${staff?.displayName ?? ''}, tap to lock the tablet`}
        onPress={askToLock}
        style={({ pressed }) => [styles.item, pressed && styles.pressed]}
      >
        <View style={[styles.avatar, { backgroundColor: colour.tint }]}>
          <Text style={[styles.initials, { color: colour.ink }]}>
            {initialOf(staff?.displayName ?? '')}
          </Text>
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {staff?.displayName}
        </Text>
      </Pressable>

      {tabs.map((option) => {
        const on = option.value === tab;
        const count = option.value === 'orders' ? toAccept : 0;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={
              count ? `${option.label}, ${plural(count, 'online order')} to accept` : option.label
            }
            onPress={() => onTab(option.value)}
            style={({ pressed }) => [styles.item, on ? styles.itemOn : pressed && styles.pressed]}
          >
            <View style={styles.glyph}>
              <option.Icon color={on ? colors.brand : colors.muted} />
              {count > 0 && <Count value={count} tone="brand" />}
            </View>
            <Text style={[styles.label, on && styles.labelOn]}>{option.label}</Text>
          </Pressable>
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={refused ? `More, ${plural(refused, 'change')} refused` : 'More'}
        onPress={() => setMenuOpen(true)}
        style={({ pressed }) => [styles.item, pressed && styles.pressed]}
      >
        <View style={styles.glyph}>
          <MoreIcon color={colors.muted} />
          {refused > 0 && <Count value={refused} tone="red" />}
        </View>
        <Text style={styles.label}>More</Text>
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        supportedOrientations={['landscape', 'portrait']}
      >
        <Pressable
          style={[
            styles.menuBackdrop,
            {
              paddingBottom: NAV_BAR_HEIGHT + insets.bottom + space.xs,
              paddingRight: space.lg + insets.right,
            },
          ]}
          onPress={() => setMenuOpen(false)}
        >
          <View style={styles.menu} onStartShouldSetResponder={() => true}>
            {/* Anyone can ask; the server shows the figures only to people allowed to see sales. */}
            <MenuItem label="Today's sales" onPress={() => go('/today')} />
            {canAddStaff && <MenuItem label="Add staff" onPress={() => go('/add-staff')} />}
            <MenuItem
              label={refused ? `Needs attention (${refused})` : 'Needs attention'}
              onPress={() => go('/attention')}
            />
            <MenuItem
              label={getScheme() === 'dark' ? 'Light mode' : 'Dark mode'}
              onPress={() => {
                setMenuOpen(false);
                saveAppearance(getScheme() === 'dark' ? 'light' : 'dark');
              }}
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

/** A count on an icon: online orders waiting to be accepted, or changes the server refused. */
function Count({ value, tone }: { value: number; tone: 'brand' | 'red' }) {
  return (
    <View style={[styles.count, tone === 'red' && styles.countRed]}>
      <Text style={styles.countText}>{value > 9 ? '9+' : value}</Text>
    </View>
  );
}

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
    >
      <Text style={styles.menuLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  bar: {
    height: NAV_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: space.md,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  item: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: radii.md,
  },
  pressed: { backgroundColor: colors.track },
  itemOn: { backgroundColor: colors.brandTint },
  glyph: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontFamily: font.semibold, fontSize: 13 },
  label: { fontFamily: font.medium, fontSize: 15, color: colors.muted },
  labelOn: { fontFamily: font.semibold, color: colors.brandInk },
  count: {
    position: 'absolute',
    top: -7,
    right: -11,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countRed: { backgroundColor: colors.redSolid },
  countText: { fontFamily: font.semibold, fontSize: 11, color: colors.onBrand },
  menuBackdrop: { flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end' },
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
}));
