import type { Pesewas } from '@plateraa/shared';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Label } from '../ui/Field';
import { cedis, colors, font, radii, space } from '../ui/theme';

export interface Done {
  number: string;
  /** Cash sales: the change to hand over. */
  change: Pesewas | null;
  message: string;
}

/**
 * After a sale, the two things the cashier must say out loud: the order number and the change.
 * Big, and it stays until the next tap.
 */
export function SaleDone({ done, onDismiss }: { done: Done | null; onDismiss: () => void }) {
  return (
    <Modal
      visible={done !== null}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      supportedOrientations={['landscape', 'portrait']}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue"
        style={styles.backdrop}
        onPress={onDismiss}
      >
        {done && (
          <View style={styles.card}>
            <Label text="Order" />
            <Text style={styles.number}>{done.number}</Text>
            {done.change !== null && (
              <View style={styles.change}>
                <Label text="Change to give" />
                <Text style={[styles.changeValue, done.change === 0 && styles.noChange]}>
                  {done.change > 0 ? cedis(done.change) : 'No change'}
                </Text>
              </View>
            )}
            <Text style={styles.message}>{done.message}</Text>
            <Text style={styles.hint}>Tap anywhere to carry on</Text>
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 25, 23, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    minWidth: 440,
    maxWidth: '90%',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.canvas,
    borderRadius: radii.xl,
    paddingHorizontal: space.xl,
    paddingVertical: 28,
  },
  number: { fontFamily: font.monoMedium, fontSize: 88, lineHeight: 96, color: colors.ink },
  change: { alignItems: 'center', gap: 4, marginTop: space.sm },
  changeValue: { fontFamily: font.monoMedium, fontSize: 52, lineHeight: 60, color: colors.good },
  noChange: { fontSize: 32, lineHeight: 40, color: colors.muted },
  message: {
    fontFamily: font.medium,
    fontSize: 17,
    color: colors.text2,
    textAlign: 'center',
    marginTop: space.sm,
  },
  hint: { fontFamily: font.regular, fontSize: 14, color: colors.muted, marginTop: space.xs },
});
