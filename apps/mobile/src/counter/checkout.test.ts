import { pesewas } from '@plateraa/shared';
import { describe, expect, it } from 'vitest';
import { emptyCheckout, ghanaPhone, toDraft } from './checkout';
import type { TicketLine } from './ticket';

const lines: TicketLine[] = [
  {
    lineId: '01JZ0000000000000000000004',
    itemId: '01JZ0000000000000000000005',
    name: 'Jollof rice',
    unitPrice: pesewas(3500),
    modifiers: [],
    quantity: 1,
  },
];

describe('checking an order before it is saved', () => {
  it('takes a walk-in with no number, but needs one for a payment link', () => {
    expect(toDraft(emptyCheckout('POS'), lines, false)).toMatchObject({
      source: 'POS',
      type: 'WALK_IN',
    });
    expect(() => toDraft(emptyCheckout('POS'), lines, true)).toThrow(/customer's number/);
    expect(
      toDraft({ ...emptyCheckout('POS'), phone: '24 123 4567' }, lines, true).customer,
    ).toEqual({ phone: '+233241234567' });
  });

  it("needs the caller's number for a phone order, but not for Bolt or Chowdeck", () => {
    expect(() => toDraft(emptyCheckout('PHONE'), lines, true)).toThrow(/caller's number/);
    expect(
      toDraft({ ...emptyCheckout('BOLT_FOOD'), reference: ' BF-22 ' }, lines, false),
    ).toMatchObject({ source: 'BOLT_FOOD', type: 'PICKUP', externalReference: 'BF-22' });
  });

  it('needs an address and a fee that is an amount for delivery, and notes who keeps the fee', () => {
    const delivery = { ...emptyCheckout('POS'), delivery: true, phone: '0241234567' };
    expect(() => toDraft(delivery, lines, false)).toThrow(/address/);
    expect(() => toDraft({ ...delivery, address: 'Osu', fee: null }, lines, false)).toThrow(/fee/);
    expect(
      toDraft(
        { ...delivery, address: 'Osu', fee: pesewas(1500), riderKeepsFee: true },
        lines,
        false,
      ),
    ).toMatchObject({
      type: 'DELIVERY',
      delivery: { address: 'Osu', fee: 1500, feeCollectedBy: 'RIDER' },
    });
  });

  it('refuses a number that is not Ghanaian', () => {
    expect(ghanaPhone('024 123 4567')).toBe('+233241234567');
    expect(ghanaPhone('12345')).toBeNull();
    expect(() => toDraft({ ...emptyCheckout('POS'), phone: '12345' }, lines, false)).toThrow(
      /Ghanaian/,
    );
  });
});
