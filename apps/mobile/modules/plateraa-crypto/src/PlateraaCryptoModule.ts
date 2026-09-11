import { NativeModule, requireNativeModule } from 'expo';

declare class PlateraaCryptoModule extends NativeModule<Record<string, never>> {
  /** Checks a PIN against a verifier from the server (`pbkdf2-sha256$iterations$salt$hash`). */
  verifyPinAsync(verifier: string, pin: string): Promise<boolean>;
}

export default requireNativeModule<PlateraaCryptoModule>('PlateraaCrypto');
