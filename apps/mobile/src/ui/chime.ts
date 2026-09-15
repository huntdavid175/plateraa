import { requireOptionalNativeModule } from 'expo';
import newOrderSound from '../../assets/sounds/new-order.wav';

interface Player {
  seekTo(seconds: number): Promise<void>;
  play(): void;
}

let loading: Promise<Player | null> | null = null;

/**
 * The chime, loaded once. On a build without the audio module (a development build from before
 * 15 Sep) it's null and the tablet stays quiet rather than failing to start.
 */
function player(): Promise<Player | null> {
  loading ??= (async () => {
    if (!requireOptionalNativeModule('ExpoAudio')) return null;
    const audio = await import('expo-audio');
    // Over the vendor's music, which dips while it rings; and even with the tablet on silent.
    await audio.setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
    });
    return audio.createAudioPlayer(newOrderSound);
  })();
  return loading;
}

/** Rings the new-order chime from the start. */
export function chime() {
  void player()
    .then(async (sound) => {
      if (!sound) return;
      await sound.seekTo(0);
      sound.play();
    })
    .catch((error: unknown) => console.warn('The order chime could not play', error));
}
