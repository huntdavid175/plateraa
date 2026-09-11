import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openSecret, sealSecret } from './secrets';

const key = () => randomBytes(32).toString('base64url');

describe('sealed secrets', () => {
  it('opens what it sealed, and never stores the secret as it was', () => {
    const secretsKey = key();
    const sealed = sealSecret('pk_live_1234', secretsKey);
    expect(sealed).not.toContain('pk_live_1234');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(openSecret(sealed, secretsKey)).toBe('pk_live_1234');
  });

  it('refuses the wrong key, or anything tampered with', () => {
    const secretsKey = key();
    const sealed = sealSecret('pk_live_1234', secretsKey);
    expect(() => openSecret(sealed, key())).toThrow();
    const [version, iv, tag, data] = sealed.split('.');
    const flipped = data!.startsWith('A') ? `B${data!.slice(1)}` : `A${data!.slice(1)}`;
    expect(() => openSecret([version, iv, tag, flipped].join('.'), secretsKey)).toThrow();
    expect(() => sealSecret('x', 'too-short')).toThrow(/32 random bytes/);
  });
});
