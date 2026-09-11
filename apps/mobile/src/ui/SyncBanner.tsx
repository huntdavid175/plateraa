import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useEngineState, useTablet } from '../tablet/TabletProvider';
import { Button } from './Button';
import { colors, plural, radius, space, text, timeOf } from './theme';

type Tone = 'warning' | 'danger' | 'info';

/**
 * Whether the tablet is reaching the server, and what's waiting. Sales are always saved on the
 * tablet first, so being offline is a notice, not an error.
 */
export function SyncBanner({
  offline = true,
  refused = true,
}: {
  /** Show the offline notice (the counter's top bar shows it instead). */
  offline?: boolean;
  /** Show the "refused" notice (the counter's top bar shows it instead). */
  refused?: boolean;
} = {}) {
  const { engine, forget } = useTablet();
  const state = useEngineState(engine);
  const router = useRouter();
  if (!state) return null;

  const registerAgain = () =>
    Alert.alert(
      'Register this tablet again?',
      state.pending
        ? `${plural(state.pending, 'change')} made on this tablet haven't reached the server and will be lost.`
        : 'An owner or manager signs in with their email to set it up again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Register again', style: 'destructive', onPress: () => void forget() },
      ],
    );

  const notices: {
    tone: Tone;
    message: string;
    action?: { label: string; onPress: () => void };
  }[] = [];
  if (state.connection === 'signed-out') {
    notices.push({
      tone: 'danger',
      message:
        'This tablet has been signed out, so nothing can upload. An owner or manager needs to register it again.',
      action: { label: 'Register again', onPress: registerAgain },
    });
  } else if (state.connection === 'offline' && offline) {
    const waiting = state.pending
      ? ` ${plural(state.pending, 'change')} will upload when the connection is back.`
      : '';
    const updated = state.lastSyncedAt ? ` Last updated ${timeOf(state.lastSyncedAt)}.` : '';
    notices.push({
      tone: 'warning',
      message: `No connection. Everything is saved on this tablet.${waiting}${updated}`,
    });
  } else if (state.pending > 0 && offline) {
    notices.push({ tone: 'info', message: `Uploading ${plural(state.pending, 'change')}…` });
  }
  if (state.needsAttention > 0 && refused) {
    notices.push({
      tone: 'danger',
      message: `The server refused ${plural(state.needsAttention, 'change')}.`,
      action: { label: 'See why', onPress: () => router.push('/attention') },
    });
  }

  return (
    <View style={styles.stack}>
      {notices.map((notice) => (
        <View key={notice.message} style={[styles.banner, styles[notice.tone]]}>
          <Text style={[styles.message, { color: INK[notice.tone] }]}>{notice.message}</Text>
          {notice.action && (
            <Button label={notice.action.label} kind="secondary" onPress={notice.action.onPress} />
          )}
        </View>
      ))}
    </View>
  );
}

const INK: Record<Tone, string> = {
  warning: colors.warningInk,
  danger: colors.dangerInk,
  info: colors.infoInk,
};

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  warning: { backgroundColor: colors.warningBg },
  danger: { backgroundColor: colors.dangerBg },
  info: { backgroundColor: colors.infoBg },
  message: { flex: 1, fontSize: text.small, fontWeight: '600' },
});
