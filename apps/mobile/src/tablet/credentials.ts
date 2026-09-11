import * as SecureStore from 'expo-secure-store';

/**
 * What a registered tablet keeps, encrypted by Android's keystore. The device token is its only
 * credential: the owner's email login isn't stored, and staff unlock the tablet with PINs.
 */
export interface DeviceCredentials {
  token: string;
  deviceId: string;
  tenantId: string;
  locationId: string;
  deviceName: string;
  /** The letter on this business's tablets: A, B, … */
  deviceCode: string;
  businessName: string;
}

const KEY = 'plateraa.device';

export async function loadCredentials(): Promise<DeviceCredentials | null> {
  const stored = await SecureStore.getItemAsync(KEY);
  return stored ? (JSON.parse(stored) as DeviceCredentials) : null;
}

export function saveCredentials(credentials: DeviceCredentials): Promise<void> {
  return SecureStore.setItemAsync(KEY, JSON.stringify(credentials));
}

export function forgetCredentials(): Promise<void> {
  return SecureStore.deleteItemAsync(KEY);
}
