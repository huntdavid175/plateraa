import { describe, expect, it } from 'vitest';
import { pinLockout } from './pin.js';

describe('pinLockout', () => {
  it('allows four mistakes without waiting', () => {
    for (const attempts of [0, 1, 2, 3, 4]) {
      expect(pinLockout(attempts)).toEqual({ lockSeconds: 0, disabled: false });
    }
  });

  it('waits 30 s from the fifth mistake, doubling each time', () => {
    expect([5, 6, 7, 8, 9].map((attempts) => pinLockout(attempts).lockSeconds)).toEqual([
      30, 60, 120, 240, 480,
    ]);
  });

  it('disables the PIN at the tenth mistake', () => {
    expect(pinLockout(10)).toEqual({ lockSeconds: 0, disabled: true });
    expect(pinLockout(25).disabled).toBe(true);
  });
});
