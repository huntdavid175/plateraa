import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View, type DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radii, themedStyles } from './theme';

/** The gap around a card in the centre. */
const GAP = 24;

/**
 * A card over a dimmed screen: in the centre (payment), or as a panel from the right (an item's
 * options, over the order column). Tapping outside closes it. The dimming covers the whole
 * screen, the tablet's status and navigation bars too; the card keeps clear of them.
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
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['landscape', 'portrait']}
    >
      <Pressable
        accessibilityLabel="Close"
        style={[
          styles.backdrop,
          side === 'right'
            ? styles.backdropRight
            : {
                paddingTop: GAP + insets.top,
                paddingBottom: GAP + insets.bottom,
                paddingLeft: GAP + insets.left,
                paddingRight: GAP + insets.right,
              },
        ]}
        onPress={onClose}
      >
        <View
          onStartShouldSetResponder={() => true}
          style={
            side === 'right'
              ? [
                  styles.panel,
                  {
                    width: width ?? '38%',
                    paddingTop: insets.top,
                    paddingBottom: insets.bottom,
                    paddingRight: insets.right,
                  },
                ]
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

const styles = themedStyles(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 25, 23, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropRight: { alignItems: 'flex-end' },
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
}));
