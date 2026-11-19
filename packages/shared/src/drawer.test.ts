import { describe, expect, it } from 'vitest';
import { DRAWER_TOLERANCE, drawerResult } from './drawer.js';

describe('drawerResult', () => {
  it('counts GH₵1 or less either way as exact', () => {
    expect(drawerResult(0)).toBe('EXACT');
    expect(drawerResult(DRAWER_TOLERANCE)).toBe('EXACT');
    expect(drawerResult(-DRAWER_TOLERANCE)).toBe('EXACT');
    expect(drawerResult(-50)).toBe('EXACT');
  });

  it('calls anything more short or over', () => {
    expect(drawerResult(-DRAWER_TOLERANCE - 1)).toBe('SHORT');
    expect(drawerResult(-1_500)).toBe('SHORT');
    expect(drawerResult(DRAWER_TOLERANCE + 1)).toBe('OVER');
    expect(drawerResult(2_000)).toBe('OVER');
  });
});
