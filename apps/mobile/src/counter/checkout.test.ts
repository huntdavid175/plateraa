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
  it('takes dine-in and pickup with no number, but needs one for a payment link', () => {
    expect(toDraft(emptyCheckout('DINE_IN'), lines, false)).toMatchObject({
      source: 'POS',
      type: 'DINE_IN',
    });
    expect(toDraft(emptyCheckout('PICKUP'), lines, false)).toMatchObject({
      source: 'POS',
      type: 'PICKUP',
    });
    expect(() => toDraft(emptyCheckout('PICKUP'), lines, true)).toThrow(/customer's number/);
    expect(
      toDraft({ ...emptyCheckout('PICKUP'), phone: '24 123 4567', name: ' Kofi ' }, lines, true)
        .customer,
    ).toEqual({ phone: '+233241234567', name: 'Kofi' });
  });

  it('needs a number, an address and a fee that is an amount for delivery, and notes who keeps the fee', () => {
    expect(() => toDraft({ ...emptyCheckout('DELIVERY'), address: 'Osu' }, lines, false)).toThrow(
      /for the rider/,
    );
    const delivery = { ...emptyCheckout('DELIVERY'), phone: '0241234567' };
    expect(() => toDraft(delivery, lines, false)).toThrow(/address/);
    expect(() => toDraft({ ...delivery, address: 'Osu', fee: null }, lines, false)).toThrow(/fee/);
    expect(
      toDraft(
        { ...delivery, address: 'Osu', fee: pesewas(1500), riderKeepsFee: true },
        lines,
        false,
      ),
    ).toMatchObject({
      source: 'POS',
      type: 'DELIVERY',
      delivery: { address: 'Osu', fee: 1500, feeCollectedBy: 'RIDER' },
    });
  });

  it('refuses a number that is not Ghanaian, and an empty order', () => {
    expect(ghanaPhone('024 123 4567')).toBe('+233241234567');
    expect(ghanaPhone('12345')).toBeNull();
    expect(() => toDraft({ ...emptyCheckout('PICKUP'), phone: '12345' }, lines, false)).toThrow(
      /Ghanaian/,
    );
    expect(() => toDraft(emptyCheckout('PICKUP'), [], false)).toThrow(/Add something/);
  });
});
