import { DMMono_400Regular } from '@expo-google-fonts/dm-mono/400Regular';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono/500Medium';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { IdleLock } from '../src/tablet/IdleLock';
import { TabletProvider, useTablet } from '../src/tablet/TabletProvider';
import { colors, space, text } from '../src/ui/theme';

export default function RootLayout() {
  // The fonts ship inside the app; if they ever fail to load, the tablet's own font is used.
  const [fontsReady, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });
  if (!fontsReady && !fontError) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }
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
