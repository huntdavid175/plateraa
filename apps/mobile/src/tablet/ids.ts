import { getRandomBytes } from 'expo-crypto';
import { monotonicFactory } from 'ulid';

/**
 * ULIDs for everything the tablet creates (orders, payments, commands). The random part comes
 * from the tablet's secure random source, drawn 256 bytes at a time.
 */
let pool: Uint8Array = new Uint8Array(0);
let next = 0;

function randomFraction(): number {
  if (next >= pool.length) {
    pool = getRandomBytes(256);
    next = 0;
  }
  return pool[next++]! / 256;
}

const factory = monotonicFactory(randomFraction);

export const newId = (): string => factory();
