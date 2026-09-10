import { createHash, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { hash, verify, type Options } from '@node-rs/argon2';

const pbkdf2Async = promisify(pbkdf2);

/** Argon2id at OWASP's recommended minimum (19 MiB, 2 passes), light enough for a small server. */
const ARGON2_OPTIONS: Options = {
  algorithm: 2, // Algorithm.Argon2id (a const enum, which isolatedModules can't import)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/** Passwords and PINs, checked on the server. */
export function hashSecret(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifySecret(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

const PIN_VERIFIER_ITERATIONS = 50_000;

/**
 * The offline PIN check sent to registered devices: `pbkdf2-sha256$iterations$salt$hash`.
 * PBKDF2 because every Android version can compute it natively. It can be cracked offline on a
 * compromised device (accepted risk: see plan.md); approvals limit what a cracked PIN can do.
 */
export async function createPinVerifier(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await pbkdf2Async(pin, salt, PIN_VERIFIER_ITERATIONS, 32, 'sha256');
  return [
    'pbkdf2-sha256',
    PIN_VERIFIER_ITERATIONS,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function checkPinVerifier(verifier: string, pin: string): Promise<boolean> {
  const [scheme, iterations, salt, expected] = verifier.split('$');
  if (scheme !== 'pbkdf2-sha256' || !iterations || !salt || !expected) return false;
  const derived = await pbkdf2Async(
    pin,
    Buffer.from(salt, 'base64url'),
    Number(iterations),
    32,
    'sha256',
  );
  const expectedBytes = Buffer.from(expected, 'base64url');
  return derived.length === expectedBytes.length && timingSafeEqual(derived, expectedBytes);
}

/** Long random tokens (device tokens, receipt tokens). Only their SHA-256 is stored. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
