import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, space, text } from './theme';

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.muted} {...input} />
    </View>
  );
}

/** Keeps only digits, for PIN boxes. */
export const digitsOnly = (value: string) => value.replace(/\D/g, '');

const styles = StyleSheet.create({
  field: { gap: space.xs },
  label: { fontSize: text.small, fontWeight: '600', color: colors.muted },
  input: {
    minHeight: 56,
    borderRadius: radius,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    fontSize: text.body,
    color: colors.ink,
  },
});
