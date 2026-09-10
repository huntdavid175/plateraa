import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pesewas, type Pesewas } from './money.js';
import { PricingError, priceOrder, type Discount, type LineInput } from './pricing.js';

const cedis = (value: number) => pesewas(value * 100);

describe('priceOrder', () => {
  it('prices a chop-bar order with modifiers, a discount and delivery', () => {
    const priced = priceOrder({
      lines: [
        // Jollof GH₵45 + extra chicken GH₵15, x2
        {
          unitPrice: cedis(45),
          quantity: 2,
          modifiers: [{ unitPriceDelta: cedis(15), quantity: 1 }],
        },
        // Sobolo GH₵10 x3
        { unitPrice: cedis(10), quantity: 3 },
      ],
      discount: { kind: 'percent', bps: 1000 },
      deliveryFee: cedis(20),
    });

    expect(priced.lines).toEqual([
      { unitTotal: 6000, lineTotal: 12_000 },
      { unitTotal: 1000, lineTotal: 3000 },
    ]);
    expect(priced.subtotal).toBe(15_000);
    expect(priced.discount).toBe(1500);
    expect(priced.deliveryFee).toBe(2000);
    expect(priced.total).toBe(15_500);
  });

  it('caps a fixed discount at the subtotal', () => {
    const priced = priceOrder({
      lines: [{ unitPrice: cedis(10), quantity: 1 }],
      discount: { kind: 'amount', amount: cedis(50) },
    });
    expect(priced.discount).toBe(1000);
    expect(priced.total).toBe(0);
  });

  it('rejects bad quantities and negative totals', () => {
    expect(() => priceOrder({ lines: [{ unitPrice: cedis(10), quantity: 0 }] })).toThrow(
      PricingError,
    );
    expect(() => priceOrder({ lines: [{ unitPrice: cedis(10), quantity: 1.5 }] })).toThrow(
      PricingError,
    );
    expect(() =>
      priceOrder({
        lines: [
          {
            unitPrice: cedis(5),
            quantity: 1,
            modifiers: [{ unitPriceDelta: cedis(-6), quantity: 1 }],
          },
        ],
      }),
    ).toThrow(PricingError);
    expect(() =>
      priceOrder({ lines: [{ unitPrice: cedis(5), quantity: 1 }], deliveryFee: pesewas(-1) }),
    ).toThrow(PricingError);
  });

  it('keeps totals consistent for any valid order', () => {
    const price = fc.integer({ min: 0, max: 100_000 }).map((n) => n as Pesewas);
    const line: fc.Arbitrary<LineInput> = fc.record({
      unitPrice: price,
      quantity: fc.integer({ min: 1, max: 50 }),
      modifiers: fc.array(
        fc.record({ unitPriceDelta: price, quantity: fc.integer({ min: 1, max: 3 }) }),
        { maxLength: 3 },
      ),
    });
    const discount: fc.Arbitrary<Discount | null> = fc.oneof(
      fc.constant(null),
      fc.record({
        kind: fc.constant('percent' as const),
        bps: fc.integer({ min: 0, max: 10_000 }),
      }),
      fc.record({ kind: fc.constant('amount' as const), amount: price }),
    );

    fc.assert(
      fc.property(fc.array(line, { maxLength: 10 }), discount, price, (lines, disc, fee) => {
        const priced = priceOrder({ lines, discount: disc, deliveryFee: fee });
        const lineSum = priced.lines.reduce((sum, l) => sum + l.lineTotal, 0);
        expect(priced.subtotal).toBe(lineSum);
        expect(priced.discount).toBeGreaterThanOrEqual(0);
        expect(priced.discount).toBeLessThanOrEqual(priced.subtotal);
        expect(priced.total).toBe(priced.subtotal - priced.discount + priced.deliveryFee);
        expect(priced.total).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});
