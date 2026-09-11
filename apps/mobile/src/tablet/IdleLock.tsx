import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalQuery, useTablet } from './TabletProvider';

const DEFAULT_IDLE_SECONDS = 180;

/** Locks the tablet when nobody has touched it for the business's idle time (3 minutes by default). */
export function IdleLock({ children }: { children: ReactNode }) {
  const { phase, lock } = useTablet();
  const settings = useLocalQuery<{ idle_lock_seconds: number | null }>(
    'SELECT idle_lock_seconds FROM settings LIMIT 1',
  );
  const idleSeconds = settings?.[0]?.idle_lock_seconds ?? DEFAULT_IDLE_SECONDS;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const restart = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = phase === 'unlocked' ? setTimeout(lock, idleSeconds * 1000) : null;
  }, [phase, lock, idleSeconds]);

  useEffect(() => {
    restart();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [restart]);

  return (
    <View style={styles.fill} onTouchStart={restart}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
