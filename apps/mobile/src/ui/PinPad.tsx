import { PIN_LENGTH } from '@plateraa/shared';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, text } from './theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;
type Key = (typeof KEYS)[number];

const KEY_LABELS: Partial<Record<Key, string>> = { clear: 'Clear', back: '⌫' };

/** Six dots and a big keypad. Calls `onComplete` on the sixth digit; `resetKey` empties it. */
export function PinPad({
  onComplete,
  disabled = false,
  resetKey,
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  resetKey?: unknown;
}) {
  const [pin, setPin] = useState('');
  useEffect(() => setPin(''), [resetKey]);

  const press = (key: Key) => {
    if (disabled) return;
    if (key === 'back') return setPin((current) => current.slice(0, -1));
    if (key === 'clear') return setPin('');
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) onComplete(next);
  };

  return (
    <View style={styles.pad}>
      <View
        style={styles.dots}
        accessibilityLabel={`${pin.length} of ${PIN_LENGTH} digits entered`}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <View key={index} style={[styles.dot, index < pin.length && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={key === 'back' ? 'Delete' : key === 'clear' ? 'Clear' : key}
            onPress={() => press(key)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.key,
              pressed && styles.keyPressed,
              disabled && styles.keyDisabled,
            ]}
          >
            <Text style={[styles.keyLabel, key === 'clear' && styles.keyWord]}>
              {KEY_LABELS[key] ?? key}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const KEY_WIDTH = 104;
const GAP = space.md;

const styles = StyleSheet.create({
  pad: { alignItems: 'center', gap: space.lg },
  dots: { flexDirection: 'row', gap: space.md },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  dotFilled: { backgroundColor: colors.ink },
  grid: {
    width: KEY_WIDTH * 3 + GAP * 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  key: {
    width: KEY_WIDTH,
    height: 76,
    borderRadius: radius,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyPressed: { backgroundColor: colors.line },
  keyDisabled: { opacity: 0.5 },
  keyLabel: { fontSize: text.key, fontWeight: '600', color: colors.ink },
  keyWord: { fontSize: text.body },
});
