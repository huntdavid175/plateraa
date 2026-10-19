import { useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
  reduceMotion = on;
});
AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
  reduceMotion = on;
});

/** A strong ease-out: it moves the moment the finger lands, then settles. */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Something pressable sinks a little under the finger (to 97%) and springs back on release, so
 * every tap is felt at once, before anything else changes. Runs on the native driver, so a busy
 * budget tablet doesn't drop it. Put `style` on an `Animated.View` around the `Pressable`, and
 * `onPressIn` / `onPressOut` on the `Pressable`. Skipped when the tablet asks for less motion.
 */
export function usePressScale(to = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;
  const go = (toValue: number, duration: number) => {
    if (reduceMotion) return;
    Animated.timing(scale, { toValue, duration, easing: EASE_OUT, useNativeDriver: true }).start();
  };
  return {
    style: { transform: [{ scale }] },
    onPressIn: () => go(to, 100),
    onPressOut: () => go(1, 180),
  };
}
