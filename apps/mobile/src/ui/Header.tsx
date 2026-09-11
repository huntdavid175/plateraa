import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { colors, font, space, text } from './theme';

/** A screen title with a way back. */
export function Header({ title }: { title: string }) {
  const router = useRouter();
  return (
    <View style={styles.bar}>
      <Button label="‹ Back" kind="ghost" size="md" onPress={() => router.back()} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { fontFamily: font.semibold, fontSize: text.heading, color: colors.ink },
});
