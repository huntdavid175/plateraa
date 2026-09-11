import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { colors, radius, space, text } from './theme';

/** A card over the screen, for a choice or a short task. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  width = 560,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['landscape', 'portrait']}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { width }]}>
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Button label="Close" kind="secondary" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(29, 27, 22, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.lg,
  },
  card: {
    maxWidth: '100%',
    maxHeight: '100%',
    backgroundColor: colors.ground,
    borderRadius: radius,
    padding: space.lg,
    gap: space.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { flex: 1, fontSize: text.heading, fontWeight: '700', color: colors.ink },
  body: { gap: space.md },
});
