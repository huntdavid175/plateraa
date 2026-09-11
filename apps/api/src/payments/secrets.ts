import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Secrets stored in the database (a vendor's Moolre key) are sealed with AES-256-GCM under
 * SECRETS_KEY: "v1.<iv>.<tag>.<ciphertext>", each part base64url. Tampering or the wrong key
 * makes opening fail rather than return garbage.
 */
export function sealSecret(plain: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function openSecret(sealed: string, key: string): string {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Not a sealed secret');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function keyBytes(key: string): Buffer {
  const bytes = Buffer.from(key, 'base64url');
  if (bytes.length !== 32) throw new Error('SECRETS_KEY must be 32 random bytes, base64url');
  return bytes;
}
