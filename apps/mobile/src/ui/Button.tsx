import { ActivityIndicator, Animated, Pressable, Text } from 'react-native';
import { usePressScale } from './press';
import { colors, font, radii, themedStyles } from './theme';

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
  const press = usePressScale();
  return (
    <Animated.View style={[press.style, grow && styles.grow]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: inactive, busy }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={inactive}
        style={({ pressed }) => [
          styles.base,
          size === 'md' && styles.md,
          styles[kind],
          pressed && PRESSED[kind],
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
    </Animated.View>
  );
}

const PRESSED = themedStyles(() => ({
  primary: { backgroundColor: colors.brandPressed },
  secondary: { backgroundColor: colors.tilePressed },
  danger: { backgroundColor: colors.redTint },
  ghost: { backgroundColor: colors.track },
}));

const LABEL = themedStyles(() => ({
  primary: { color: colors.onBrand },
  secondary: { color: colors.ink, fontFamily: font.medium },
  danger: { color: colors.redInk, fontFamily: font.medium },
  ghost: { color: colors.brand, fontFamily: font.medium },
}));

const styles = themedStyles(() => ({
  base: {
    minHeight: 56,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  md: { minHeight: 44, borderRadius: radii.md, paddingHorizontal: 14 },
  primary: { backgroundColor: colors.brand },
  /** Filled rather than outlined: fewer lines on the screen. */
  secondary: { backgroundColor: colors.tile },
  danger: { backgroundColor: colors.redBg, borderWidth: 1.5, borderColor: colors.redLine },
  ghost: { paddingHorizontal: 8 },
  grow: { flex: 1 },
  inactive: { opacity: 0.5 },
  label: { fontFamily: font.semibold, fontSize: 17, color: colors.onBrand },
  labelMd: { fontSize: 15 },
}));
