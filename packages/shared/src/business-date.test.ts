import { describe, expect, it } from 'vitest';
import { businessDateOf } from './business-date.js';

describe('businessDateOf', () => {
  it('gives the date in the business timezone', () => {
    expect(businessDateOf(new Date('2026-09-17T23:30:00Z'), 'Africa/Accra')).toBe('2026-09-17');
    // Lagos is an hour ahead of Accra, so 23:30 UTC is already the next day there.
    expect(businessDateOf(new Date('2026-09-17T23:30:00Z'), 'Africa/Lagos')).toBe('2026-09-18');
  });

  it('pads months and days', () => {
    expect(businessDateOf(new Date('2026-01-05T08:00:00Z'), 'Africa/Accra')).toBe('2026-01-05');
  });
});
