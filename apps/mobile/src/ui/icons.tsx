import { StyleSheet, View } from 'react-native';

/**
 * The nav bar's icons, drawn from plain Views: no icon font and no SVG library, so there's
 * nothing new to build into the app. Each one is 22 × 22 and takes the colour to draw it in.
 */
export type IconProps = { color: string };

/** The counter: the menu's grid of tiles. */
export function CounterIcon({ color }: IconProps) {
  return (
    <View style={[styles.box, styles.grid]}>
      {[0, 1, 2, 3].map((corner) => (
        <View key={corner} style={[styles.cell, { borderColor: color }]} />
      ))}
    </View>
  );
}

/** Orders: a list of tickets. */
export function OrdersIcon({ color }: IconProps) {
  return (
    <View style={[styles.box, styles.rows]}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <View style={[styles.rule, { backgroundColor: color }]} />
        </View>
      ))}
    </View>
  );
}

/** The kitchen: a serving dome. */
export function KitchenIcon({ color }: IconProps) {
  return (
    <View style={[styles.box, styles.cloche]}>
      <View style={[styles.knob, { backgroundColor: color }]} />
      <View style={[styles.dome, { borderColor: color }]} />
      <View style={[styles.base, { backgroundColor: color }]} />
    </View>
  );
}

/** The drawer: the cash till, with its handle. */
export function DrawerIcon({ color }: IconProps) {
  return (
    <View style={styles.box}>
      <View style={[styles.till, { borderColor: color }]}>
        <View style={[styles.split, { backgroundColor: color }]} />
        <View style={[styles.handle, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

/** Stock: a price tag. */
export function StockIcon({ color }: IconProps) {
  return (
    <View style={styles.box}>
      <View style={[styles.tag, { borderColor: color }]}>
        <View style={[styles.hole, { borderColor: color }]} />
      </View>
    </View>
  );
}

/** More: the menu of everything else. */
export function MoreIcon({ color }: IconProps) {
  return (
    <View style={[styles.box, styles.stack]}>
      {[0, 1, 2].map((line) => (
        <View key={line} style={[styles.bar, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: 8, height: 8, borderWidth: 2, borderRadius: 2 },
  rows: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  rule: { width: 12, height: 2, borderRadius: 1 },
  cloche: { justifyContent: 'flex-end' },
  knob: { width: 4, height: 4, borderRadius: 2 },
  dome: {
    width: 20,
    height: 10,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  base: { width: 22, height: 2, borderRadius: 1, marginTop: 2 },
  till: {
    width: 20,
    height: 15,
    borderWidth: 2,
    borderRadius: 3,
    alignItems: 'center',
  },
  split: { alignSelf: 'stretch', height: 2 },
  handle: { width: 6, height: 2, borderRadius: 1, marginTop: 3 },
  tag: {
    width: 15,
    height: 15,
    borderWidth: 2,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
  },
  hole: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 5,
    height: 5,
    borderRadius: 3,
    borderWidth: 2,
  },
  stack: { gap: 4 },
  bar: { width: 18, height: 2, borderRadius: 1 },
});
