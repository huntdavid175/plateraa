import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, space, text } from './theme';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [styles.base, styles[kind], (pressed || inactive) && styles.dimmed]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'secondary' ? colors.ink : colors.onInk} />
      ) : (
        <Text style={[styles.label, kind === 'secondary' && styles.secondaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radius,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  primary: { backgroundColor: colors.ink },
  secondary: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.line },
  danger: { backgroundColor: colors.dangerInk },
  dimmed: { opacity: 0.5 },
  label: { fontSize: text.body, fontWeight: '600', color: colors.onInk },
  secondaryLabel: { color: colors.ink },
});
