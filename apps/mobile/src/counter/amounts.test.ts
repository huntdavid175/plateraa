import { pesewas } from '@plateraa/shared';
import { describe, expect, it } from 'vitest';
import { amountOf, plainAmount, pressKey, type Key } from './amounts';

const type = (keys: Key[]) => keys.reduce(pressKey, '');

describe('the cash keypad', () => {
  it('builds an amount with at most two decimals', () => {
    expect(type(['1', '0', '5', '.', '5'])).toBe('105.5');
    expect(type(['1', '.', '2', '5', '9'])).toBe('1.25');
    expect(type(['.', '5'])).toBe('0.5');
    expect(type(['0', '7'])).toBe('7');
    expect(type(['4', '5', 'back'])).toBe('4');
  });

  it('turns what was typed into pesewas without floating-point maths', () => {
    expect(amountOf('105.5')).toBe(10550);
    expect(amountOf('12.')).toBe(1200);
    expect(amountOf('')).toBeNull();
    expect(plainAmount(pesewas(10550))).toBe('105.50');
    expect(plainAmount(pesewas(123456))).toBe('1234.56');
  });
});
