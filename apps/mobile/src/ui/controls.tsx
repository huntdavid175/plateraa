import { Pressable, Text, View } from 'react-native';
import type { CategoryColour } from './categories';
import { colors, font, radii, space, text, themed, themedStyles } from './theme';

/** Two to four choices side by side, like Pickup | Delivery. */
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

/**
 * A rounded filter chip: menu categories, kitchen stations. Chosen, it's filled solid. A menu
 * category's chip wears its colour: its pastel, and once chosen its ink, ringed in the pastel so
 * it still shows on the dark look.
 */
export function Chip({
  label,
  selected = false,
  colour,
  onPress,
}: {
  label: string;
  selected?: boolean;
  colour?: CategoryColour;
  onPress: () => void;
}) {
  const tinted = colour
    ? selected
      ? { backgroundColor: colour.ink, borderColor: colour.tint }
      : { backgroundColor: colour.tint }
    : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipOn,
        tinted,
        pressed && !selected && (colour ? { backgroundColor: colour.pressed } : styles.chipPressed),
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          selected && styles.chipLabelOn,
          colour && { color: selected ? colour.tint : colour.ink },
        ]}
      >
        {label}
      </Text>
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

const TONES: Record<Tone, { backgroundColor: string; color: string }> = themed(() => ({
  neutral: { backgroundColor: colors.track, color: colors.text2 },
  good: { backgroundColor: colors.goodBg, color: colors.goodInk },
  amber: { backgroundColor: colors.amberBg, color: colors.amberInk },
  red: { backgroundColor: colors.redBg, color: colors.redInk },
  info: { backgroundColor: colors.infoBg, color: colors.infoInk },
  offline: { backgroundColor: colors.offlineBg, color: colors.offlineInk },
  stock: { backgroundColor: colors.stockBg, color: colors.stockInk },
}));

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

const styles = themedStyles(() => ({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: colors.track,
    borderRadius: radii.md,
    padding: 3,
    gap: 2,
  },
  segment: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: radii.sm,
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: colors.raised, elevation: 1 },
  segmentLabel: { fontFamily: font.medium, fontSize: 15, color: colors.muted },
  segmentLabelOn: { fontFamily: font.semibold, color: colors.ink },
  chip: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.tile,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.brand },
  chipPressed: { backgroundColor: colors.tilePressed },
  chipLabel: { fontFamily: font.medium, fontSize: 15, color: colors.text2 },
  chipLabelOn: { fontFamily: font.semibold, color: colors.onBrand },
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
    borderRadius: radii.pill,
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
    backgroundColor: colors.tile,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepPressed: { backgroundColor: colors.tilePressed },
  stepLabel: { fontFamily: font.medium, fontSize: 20, color: colors.ink },
  stepValue: {
    width: 40,
    textAlign: 'center',
    fontFamily: font.monoMedium,
    fontSize: text.body,
    color: colors.ink,
  },
}));
