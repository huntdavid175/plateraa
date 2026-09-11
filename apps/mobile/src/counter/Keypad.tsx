import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Label } from '../ui/Field';
import { colors, font, radii, space } from '../ui/theme';
import { KEYS, pressKey } from './amounts';

/** A big number pad for cash amounts. */
export function Keypad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.keypad}>
      {KEYS.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={key === 'back' ? 'Delete' : key}
          onPress={() => onChange(pressKey(value, key))}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
        >
          <Text style={styles.keyLabel}>{key === 'back' ? '⌫' : key}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The amount typed on the pad, shown the way it will be recorded. */
export function AmountDisplay({ label, typed }: { label: string; typed: string }) {
  return (
    <View style={styles.block}>
      <Label text={label} />
      <Text style={[styles.display, typed ? styles.displayOn : null]}>GH₵ {typed || '0.00'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  keypad: { width: 216, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  key: {
    width: 66,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.field,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyPressed: { backgroundColor: colors.tile },
  keyLabel: { fontFamily: font.monoMedium, fontSize: 20, color: colors.ink },
  block: { gap: 8 },
  display: {
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.field,
    paddingHorizontal: space.md,
    fontFamily: font.monoMedium,
    fontSize: 22,
    lineHeight: 52,
    color: colors.disabled,
  },
  displayOn: { borderColor: colors.brand, color: colors.ink },
});
