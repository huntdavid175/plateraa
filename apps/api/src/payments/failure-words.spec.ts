import { describe, expect, it } from 'vitest';
import { MoolreError } from './moolre';
import { failureWords } from './payment-links.service';

describe('why a payment link failed, in words', () => {
  it("names Moolre's code, and whether making the link or texting it failed", () => {
    expect(
      failureWords(new MoolreError('AIN03', 'Authentication Error, user not found.', false)),
    ).toBe(
      "Moolre didn't accept this business's account details (Moolre AIN03: Authentication Error, user not found).",
    );
    expect(failureWords(new MoolreError('AIN01', 'Authentication Error', false), 'text')).toBe(
      "Moolre didn't accept Plateraa's SMS key (Moolre AIN01: Authentication Error).",
    );
    expect(
      failureWords(new MoolreError('ASMS07', 'Sender ID is not approved', false), 'text'),
    ).toBe("The text couldn't go: the sender name isn't approved by Moolre yet.");
    expect(failureWords(new Error('socket hang up'))).toBe(
      "The link couldn't be made. Send it again.",
    );
  });
});
