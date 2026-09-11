import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, space, text } from './theme';

/** A tile that can be picked: an order kind, a size, an extra, a banknote. */
export function Choice({
  label,
  detail,
  selected = false,
  disabled = false,
  onPress,
}: {
  label: string;
  detail?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.selected,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text style={[styles.label, selected && styles.selectedText]}>{label}</Text>
      {detail ? (
        <Text style={[styles.detail, selected && styles.selectedText]}>{detail}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    minHeight: 52,
    minWidth: 96,
    justifyContent: 'center',
    borderRadius: radius,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  dimmed: { opacity: 0.55 },
  label: { fontSize: text.body, fontWeight: '600', color: colors.ink },
  detail: { fontSize: text.small, color: colors.muted },
  selectedText: { color: colors.onInk },
});
