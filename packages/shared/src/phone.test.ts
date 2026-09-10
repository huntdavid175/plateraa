import { describe, expect, it } from 'vitest';
import { normalizeGhanaPhone } from './phone.js';

describe('normalizeGhanaPhone', () => {
  it('normalises the ways Ghanaian numbers get typed', () => {
    for (const input of [
      '0241234567',
      '024 123 4567',
      '024-123-4567',
      '233241234567',
      '+233 24 123 4567',
      '00233241234567',
    ]) {
      expect(normalizeGhanaPhone(input)).toBe('+233241234567');
    }
    expect(normalizeGhanaPhone('0551234567')).toBe('+233551234567');
    expect(normalizeGhanaPhone('0302123456')).toBe('+233302123456');
  });

  it('rejects numbers that are not Ghanaian', () => {
    for (const input of [
      '',
      '12345',
      '024123456',
      '02412345678',
      '+2348031234567',
      '0741234567',
      'abc',
    ]) {
      expect(normalizeGhanaPhone(input)).toBeNull();
    }
  });
});
