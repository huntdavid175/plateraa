import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { IdleLock } from '../src/tablet/IdleLock';
import { TabletProvider, useTablet } from '../src/tablet/TabletProvider';
import { colors, space, text } from '../src/ui/theme';

export default function RootLayout() {
  return (
    <TabletProvider>
      <StatusBar style="dark" />
      <Screens />
    </TabletProvider>
  );
}

/** Which screens exist depends on the tablet's state; Expo Router moves between them itself. */
function Screens() {
  const { phase, problem } = useTablet();
  if (problem) {
    return (
      <View style={styles.centre}>
        <Text style={styles.problem}>The tablet's storage couldn't be opened: {problem}</Text>
      </View>
    );
  }
  if (phase === 'loading') {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }
  return (
    <IdleLock>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: colors.ground },
        }}
      >
        <Stack.Protected guard={phase === 'unregistered'}>
          <Stack.Screen name="register" />
        </Stack.Protected>
        <Stack.Protected guard={phase === 'locked'}>
          <Stack.Screen name="lock" />
        </Stack.Protected>
        <Stack.Protected guard={phase === 'unlocked'}>
          <Stack.Screen name="index" />
          <Stack.Screen name="attention" />
          <Stack.Screen name="add-staff" />
        </Stack.Protected>
        <Stack.Screen name="diagnostics" />
      </Stack>
    </IdleLock>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.ground,
    padding: space.xl,
  },
  problem: { fontSize: text.body, color: colors.dangerInk, textAlign: 'center' },
});
