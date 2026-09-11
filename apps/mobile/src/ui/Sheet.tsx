import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { colors, font, radii } from './theme';

/**
 * A card over a dimmed screen: in the centre (payment), or as a panel from the right (an item's
 * options, over the order column). Tapping outside closes it.
 */
export function Overlay({
  visible,
  onClose,
  side = 'center',
  width,
  height,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  side?: 'center' | 'right';
  width?: DimensionValue;
  height?: DimensionValue;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['landscape', 'portrait']}
    >
      <Pressable
        accessibilityLabel="Close"
        style={[styles.backdrop, side === 'right' && styles.backdropRight]}
        onPress={onClose}
      >
        <View
          onStartShouldSetResponder={() => true}
          style={
            side === 'right'
              ? [styles.panel, { width: width ?? '38%' }]
              : [styles.card, { width: width ?? 900, height: height ?? 680 }]
          }
        >
          {children}
        </View>
      </Pressable>
    </Modal>
  );
}

/** The round × in a sheet's corner. */
export function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={onPress}
      style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
    >
      <Text style={styles.closeLabel}>×</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 25, 23, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdropRight: { alignItems: 'flex-end', padding: 0 },
  card: {
    maxWidth: '100%',
    maxHeight: '100%',
    backgroundColor: colors.canvas,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  panel: {
    height: '100%',
    backgroundColor: colors.canvas,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.track,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closePressed: { backgroundColor: colors.line },
  closeLabel: { fontFamily: font.regular, fontSize: 22, lineHeight: 24, color: colors.muted },
});
