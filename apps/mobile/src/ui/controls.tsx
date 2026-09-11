import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radii, space, text } from './theme';

/** Two to four choices side by side, like Walk-in | Delivery. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A rounded filter chip: menu categories, kitchen stations. */
export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipOn,
        pressed && !selected && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>{label}</Text>
    </Pressable>
  );
}

/** A large tile that can be picked: a size, an extra, an order source, a platform. */
export function OptionTile({
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
      style={[styles.option, selected && styles.optionOn, disabled && styles.disabled]}
    >
      <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>{label}</Text>
      {detail ? (
        <Text style={[styles.optionDetail, selected && styles.optionDetailOn]}>{detail}</Text>
      ) : null}
    </Pressable>
  );
}

type Tone = 'neutral' | 'good' | 'amber' | 'red' | 'info' | 'offline' | 'stock';

const TONES: Record<Tone, { backgroundColor: string; color: string }> = {
  neutral: { backgroundColor: colors.track, color: colors.text2 },
  good: { backgroundColor: colors.goodBg, color: colors.goodInk },
  amber: { backgroundColor: colors.amberBg, color: colors.amberInk },
  red: { backgroundColor: colors.redBg, color: colors.redInk },
  info: { backgroundColor: colors.infoBg, color: colors.infoInk },
  offline: { backgroundColor: colors.offlineBg, color: colors.offlineInk },
  stock: { backgroundColor: colors.stockBg, color: colors.stockInk },
};

/** A small word in a pill. Status is always a word, never colour alone. */
export function Badge({
  label,
  tone = 'neutral',
  strong = false,
}: {
  label: string;
  tone?: Tone;
  /** Uppercase, for flags that must not be missed: UNPAID, REFUND OWED. */
  strong?: boolean;
}) {
  const { backgroundColor, color } = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.badgeLabel, { color }, strong && styles.badgeStrong]}>
        {strong ? label.toUpperCase() : label}
      </Text>
    </View>
  );
}

/** − 2 + with 44 dp buttons: big enough for a quick thumb. */
export function Stepper({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="One fewer"
        onPress={() => onChange(Math.max(min, value - 1))}
        style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
      >
        <Text style={styles.stepLabel}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="One more"
        onPress={() => onChange(value + 1)}
        style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
      >
        <Text style={styles.stepLabel}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: colors.track,
    borderRadius: radii.md,
    padding: 3,
    gap: 2,
  },
  segment: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: radii.sm,
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: colors.canvas, elevation: 1 },
  segmentLabel: { fontFamily: font.medium, fontSize: 15, color: colors.muted },
  segmentLabelOn: { fontFamily: font.semibold, color: colors.ink },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.tile,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.brandTint, borderColor: colors.brand },
  chipPressed: { backgroundColor: colors.tilePressed },
  chipLabel: { fontFamily: font.medium, fontSize: 15, color: colors.text2 },
  chipLabelOn: { color: colors.brand },
  option: {
    minHeight: 56,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.field,
    paddingHorizontal: 14,
    paddingVertical: space.sm,
    justifyContent: 'center',
  },
  optionOn: { borderWidth: 2, borderColor: colors.brand, backgroundColor: colors.brandTint },
  disabled: { opacity: 0.45 },
  optionLabel: { fontFamily: font.medium, fontSize: 15, color: colors.ink },
  optionLabelOn: { fontFamily: font.semibold, color: colors.brandInk },
  optionDetail: { fontFamily: font.mono, fontSize: 13, color: colors.muted, marginTop: 1 },
  optionDetailOn: { color: colors.brandPressed },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  badgeLabel: { fontFamily: font.semibold, fontSize: text.label },
  badgeStrong: { letterSpacing: 0.4 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  step: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepPressed: { backgroundColor: colors.track },
  stepLabel: { fontFamily: font.medium, fontSize: 20, color: colors.text2 },
  stepValue: {
    width: 40,
    textAlign: 'center',
    fontFamily: font.monoMedium,
    fontSize: text.body,
    color: colors.ink,
  },
});
