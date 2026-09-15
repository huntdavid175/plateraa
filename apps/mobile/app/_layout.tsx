import { DMMono_400Regular } from '@expo-google-fonts/dm-mono/400Regular';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono/500Medium';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderAlerts } from '../src/counter/OrderAlerts';
import { IdleLock } from '../src/tablet/IdleLock';
import { TabletProvider, useTablet } from '../src/tablet/TabletProvider';
import { loadAppearance } from '../src/ui/appearance';
import { colors, space, text, themedStyles, useScheme } from '../src/ui/theme';

// Light or dark, as this tablet was left, before anything is drawn.
loadAppearance();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const scheme = useScheme();
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
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* A new look draws every screen afresh; the tablet stays unlocked and keeps syncing. */}
      <Screens key={scheme} />
      {/* Above every screen, the lock screen too, and kept through a change of look. */}
      <OrderAlerts />
    </TabletProvider>
  );
}

/** Which screens exist depends on the tablet's state; Expo Router moves between them itself. */
function Screens() {
  const { phase, problem } = useTablet();
  // Android draws the app edge to edge, so every screen keeps clear of the tablet's status bar
  // (time, battery, Wi-Fi) and its navigation bar.
  const insets = useSafeAreaInsets();
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
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }
  return (
    <IdleLock>
      <View
        style={[
          styles.frame,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
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
            <Stack.Screen name="today" />
          </Stack.Protected>
          <Stack.Screen name="diagnostics" />
        </Stack>
      </View>
    </IdleLock>
  );
}

const styles = themedStyles(() => ({
  centre: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.ground,
    padding: space.xl,
  },
  /** Behind the status and navigation bars: the same as the top bar. */
  frame: { flex: 1, backgroundColor: colors.canvas },
  problem: { fontSize: text.body, color: colors.redInk, textAlign: 'center' },
}));
