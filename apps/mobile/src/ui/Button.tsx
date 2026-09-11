import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, font, radii } from './theme';

type Kind = 'primary' | 'secondary' | 'danger' | 'ghost';

/** Big through space, not heavy boxes: 56 tall by default, 44 for secondary rows. */
export function Button({
  label,
  onPress,
  kind = 'primary',
  size = 'lg',
  disabled = false,
  busy = false,
  grow = false,
}: {
  label: string;
  onPress: () => void;
  kind?: Kind;
  size?: 'lg' | 'md';
  disabled?: boolean;
  busy?: boolean;
  /** Take the free width in a row. */
  grow?: boolean;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        size === 'md' && styles.md,
        styles[kind],
        pressed && PRESSED[kind],
        grow && styles.grow,
        inactive && styles.inactive,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? colors.onBrand : colors.ink} />
      ) : (
        <Text
          numberOfLines={1}
          style={[styles.label, size === 'md' && styles.labelMd, LABEL[kind]]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const PRESSED = StyleSheet.create({
  primary: { backgroundColor: colors.brandPressed },
  secondary: { backgroundColor: colors.track },
  danger: { backgroundColor: '#FEE2E2' },
  ghost: { backgroundColor: colors.track },
});

const LABEL = StyleSheet.create({
  primary: { color: colors.onBrand },
  secondary: { color: colors.text2, fontFamily: font.medium },
  danger: { color: colors.redInk, fontFamily: font.medium },
  ghost: { color: colors.brand, fontFamily: font.medium },
});

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  md: { minHeight: 44, borderRadius: radii.md, paddingHorizontal: 14 },
  primary: { backgroundColor: colors.brand },
  secondary: { borderWidth: 1.5, borderColor: colors.line },
  danger: { backgroundColor: colors.redBg, borderWidth: 1.5, borderColor: colors.redLine },
  ghost: { paddingHorizontal: 8 },
  grow: { flex: 1 },
  inactive: { opacity: 0.5 },
  label: { fontFamily: font.semibold, fontSize: 17, color: colors.onBrand },
  labelMd: { fontSize: 15 },
});
