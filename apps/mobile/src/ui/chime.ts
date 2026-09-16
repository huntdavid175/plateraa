import { requireOptionalNativeModule } from 'expo';
import newOrderSound from '../../assets/sounds/new-order.wav';

interface Player {
  seekTo(seconds: number): Promise<void>;
  play(): void;
}

let loading: Promise<Player | null> | null = null;
/** The chime once it's ready, so ringing it needn't wait on a promise. */
let ready: Player | null = null;

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
    const sound = audio.createAudioPlayer(newOrderSound);
    ready = sound;
    return sound;
  })();
  return loading;
}

/**
 * Loads the chime and opens the audio session up front, so the first online order of the day
 * rings as its note appears. Left until the order arrives, opening the session and decoding the
 * sound take long enough that the chime trails the note by seconds.
 */
export function warmUpChime() {
  void player().catch((error: unknown) => console.warn('The order chime could not load', error));
}

/** Rings the new-order chime from the start. */
export function chime() {
  if (ready) {
    ring(ready);
    return;
  }
  void player()
    .then((sound) => sound && ring(sound))
    .catch((error: unknown) => console.warn('The order chime could not play', error));
}

/**
 * The chime has been played before and sits at its end, so it's wound back first. Both calls go
 * to the same player, in order, and waiting on the rewind would only hold the sound back.
 */
function ring(sound: Player) {
  void sound.seekTo(0);
  sound.play();
}
