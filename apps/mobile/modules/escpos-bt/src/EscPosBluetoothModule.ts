import { NativeModule, requireNativeModule } from 'expo';

export interface PairedPrinter {
  name: string;
  address: string;
}

declare class EscPosBluetoothModule extends NativeModule<Record<string, never>> {
  /** Printers paired in Android's Bluetooth settings. */
  listBondedAsync(): Promise<PairedPrinter[]>;
  connectAsync(address: string): Promise<void>;
  /** Sends raw ESC/POS bytes, base64-encoded. */
  writeAsync(base64: string): Promise<void>;
  disconnectAsync(): Promise<void>;
  isConnected(): boolean;
}

export default requireNativeModule<EscPosBluetoothModule>('EscPosBluetooth');
