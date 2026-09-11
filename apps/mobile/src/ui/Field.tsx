import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, font, radii, space, text } from './theme';

/** A small uppercase label, with a brand-coloured star when the field is required. */
export function Label({
  text: label,
  required = false,
  optional = false,
}: {
  text: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <Text style={styles.label}>
      {label.toUpperCase()}
      {required && <Text style={styles.required}> *</Text>}
      {optional && <Text style={styles.optional}> (optional)</Text>}
    </Text>
  );
}

export function Field({
  label,
  required,
  optional,
  mono = false,
  ...input
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  mono?: boolean;
} & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Label text={label} required={required} optional={optional} />
      <TextInput
        placeholderTextColor={colors.faint}
        {...input}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        style={[styles.input, mono && styles.mono, focused && styles.focused, input.style]}
      />
    </View>
  );
}

/** A Ghanaian number: "+233" is shown, so "24 123 4567" and "024 123 4567" both work. */
export function PhoneField({
  label,
  value,
  onChangeText,
  required,
  optional,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  required?: boolean;
  optional?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Label text={label} required={required} optional={optional} />
      <View style={[styles.phone, focused && styles.focused]}>
        <Text style={styles.prefix}>+233</Text>
        <View style={styles.divider} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="phone-pad"
          placeholder="024 000 0000"
          placeholderTextColor={colors.faint}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.phoneInput}
        />
      </View>
    </View>
  );
}

/** Keeps only digits, for PIN boxes. */
export const digitsOnly = (value: string) => value.replace(/\D/g, '');

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: {
    fontFamily: font.medium,
    fontSize: text.label,
    letterSpacing: 0.3,
    color: colors.muted,
  },
  required: { color: colors.brand, fontFamily: font.semibold },
  optional: { color: colors.faint, fontFamily: font.regular, letterSpacing: 0 },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.field,
    paddingHorizontal: 14,
    fontFamily: font.regular,
    fontSize: text.body,
    color: colors.ink,
  },
  mono: { fontFamily: font.mono },
  focused: { borderColor: colors.brand },
  phone: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.field,
  },
  prefix: {
    paddingLeft: 14,
    paddingRight: space.sm,
    fontFamily: font.medium,
    fontSize: text.small,
    color: colors.muted,
  },
  divider: { width: 1, height: 20, backgroundColor: colors.line },
  phoneInput: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: space.sm + 4,
    fontFamily: font.mono,
    fontSize: text.body,
    color: colors.ink,
  },
});
