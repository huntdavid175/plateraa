import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  add,
  bpsOf,
  formatCedis,
  mul,
  parseCedis,
  pesewas,
  splitFees,
  type Pesewas,
} from './money.js';

const MAX_AMOUNT = 1_000_000_000_000; // GH₵10 billion: far above any real payment
const amount = fc.integer({ min: 0, max: MAX_AMOUNT }).map((n) => n as Pesewas);

describe('pesewas', () => {
  it('rejects anything that is not a safe integer', () => {
    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => pesewas(bad)).toThrow(MoneyError);
    }
  });

  it('detects overflow instead of losing precision', () => {
    expect(() => add(pesewas(Number.MAX_SAFE_INTEGER), pesewas(1))).toThrow(MoneyError);
    expect(() => mul(pesewas(Number.MAX_SAFE_INTEGER), 2)).toThrow(MoneyError);
    expect(() => mul(pesewas(100), 1.5)).toThrow(MoneyError);
  });
});

describe('bpsOf', () => {
  it('rounds half up to the pesewa', () => {
    expect(bpsOf(pesewas(1000), 100)).toBe(10);
    expect(bpsOf(pesewas(50), 100)).toBe(1); // 0.50 → 1
    expect(bpsOf(pesewas(49), 100)).toBe(0); // 0.49 → 0
    expect(bpsOf(pesewas(12345), 200)).toBe(247); // 246.9 → 247
  });

  it('rejects invalid basis points and negative amounts', () => {
    expect(() => bpsOf(pesewas(100), -1)).toThrow(MoneyError);
    expect(() => bpsOf(pesewas(100), 10_001)).toThrow(MoneyError);
    expect(() => bpsOf(pesewas(100), 1.5)).toThrow(MoneyError);
    expect(() => bpsOf(pesewas(-100), 100)).toThrow(MoneyError);
  });
});

describe('splitFees', () => {
  it('applies the Moolre 1% + platform 2% split', () => {
    expect(splitFees(pesewas(10_000), 100, 200)).toEqual({
      gross: 10_000,
      providerFee: 100,
      platformFee: 200,
      net: 9_700,
    });
  });

  it('always adds up exactly and never goes negative', () => {
    const bpsPair = fc
      .tuple(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 10_000 }))
      .filter(([a, b]) => a + b <= 10_000);

    fc.assert(
      fc.property(amount, bpsPair, (gross, [providerBps, platformBps]) => {
        const split = splitFees(gross, providerBps, platformBps);
        expect(split.providerFee + split.platformFee + split.net).toBe(gross);
        expect(split.providerFee).toBeGreaterThanOrEqual(0);
        expect(split.platformFee).toBeGreaterThanOrEqual(0);
        expect(split.net).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('keeps net non-negative even on a 1-pesewa payment at extreme rates', () => {
    expect(splitFees(pesewas(1), 5_000, 5_000).net).toBe(0);
  });
});

describe('formatCedis', () => {
  it('formats with cedi sign, thousands separators and two decimals', () => {
    expect(formatCedis(pesewas(0))).toBe('GH₵0.00');
    expect(formatCedis(pesewas(1250))).toBe('GH₵12.50');
    expect(formatCedis(pesewas(123_456_789))).toBe('GH₵1,234,567.89');
    expect(formatCedis(pesewas(-5))).toBe('-GH₵0.05');
  });
});

describe('parseCedis', () => {
  it('parses typed amounts', () => {
    expect(parseCedis('12.5')).toBe(1250);
    expect(parseCedis('12.50')).toBe(1250);
    expect(parseCedis('1,200')).toBe(120_000);
    expect(parseCedis('GH₵ 5')).toBe(500);
    expect(parseCedis(' 0.05 ')).toBe(5);
  });

  it('rejects anything ambiguous', () => {
    for (const bad of ['', '12.345', '-1', 'abc', '1.2.3', '.5']) {
      expect(parseCedis(bad)).toBeNull();
    }
  });

  it('round-trips with formatCedis', () => {
    fc.assert(
      fc.property(amount, (value) => {
        expect(parseCedis(formatCedis(value))).toBe(value);
      }),
    );
  });
});
