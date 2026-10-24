import { describe, expect, it } from 'vitest';
import { MoolreError } from './moolre';
import { failureWords } from './payment-links.service';

describe('why a payment link failed, in words', () => {
  it("names Moolre's code, and whether making the link or texting it failed", () => {
    expect(
      failureWords(new MoolreError('AIN03', 'Authentication Error, user not found.', false)),
    ).toBe(
      "This business's payment details weren't accepted (AIN03: Authentication Error, user not found).",
    );
    expect(failureWords(new MoolreError('AIN01', 'Authentication Error', false), 'text')).toBe(
      "Brixx's text message key wasn't accepted (AIN01: Authentication Error).",
    );
    expect(
      failureWords(new MoolreError('ASMS07', 'Sender ID is not approved', false), 'text'),
    ).toBe("The text couldn't go: the sender name isn't approved yet.");
    expect(failureWords(new Error('socket hang up'))).toBe(
      "The link couldn't be made. Send it again.",
    );
  });
});
