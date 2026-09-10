import { describe, expect, it } from 'vitest';
import { pinProblem } from './pin.js';

describe('pinProblem', () => {
  it('refuses PINs a coworker would guess', () => {
    for (const pin of [
      '000000',
      '111111',
      '123456',
      '654321',
      '345678',
      '121212',
      '123123',
      '199801',
      '200512',
      '112233',
      '147258',
    ]) {
      expect(pinProblem(pin), pin).not.toBeNull();
    }
  });

  it('refuses anything that is not exactly six digits', () => {
    for (const pin of ['', '12345', '1234567', '12a456', ' 48291']) {
      expect(pinProblem(pin), pin).toBe('PIN must be exactly 6 digits');
    }
  });

  it('accepts ordinary PINs', () => {
    for (const pin of ['482913', '305871', '917364', '560238']) {
      expect(pinProblem(pin), pin).toBeNull();
    }
  });
});
