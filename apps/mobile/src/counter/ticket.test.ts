import { pesewas } from '@plateraa/shared';
import { describe, expect, it } from 'vitest';
import { forSource, platformPriceKey, type TicketLine } from './ticket';

const line = (itemId: string, unitPrice: number, variantId?: string): TicketLine => ({
  lineId: `${itemId}-${variantId ?? 'plain'}`,
  itemId,
  ...(variantId ? { variantId } : {}),
  name: itemId,
  unitPrice: pesewas(unitPrice),
  modifiers: [],
  quantity: 1,
});

describe('platform prices', () => {
  const prices = new Map([
    [platformPriceKey('BOLT_FOOD', 'jollof', 'large'), pesewas(7000)],
    [platformPriceKey('BOLT_FOOD', 'sobolo'), pesewas(1200)],
    [platformPriceKey('CHOWDECK', 'sobolo'), pesewas(1300)],
  ]);
  const ticket = [
    line('jollof', 6000, 'large'),
    line('jollof', 4500, 'regular'),
    line('sobolo', 1000),
  ];

  it('prices a Bolt order at Bolt’s prices where the owner set them', () => {
    expect(forSource(ticket, 'BOLT_FOOD', prices).map((l) => l.unitPrice)).toEqual([
      7000, 4500, 1200,
    ]);
    expect(forSource(ticket, 'CHOWDECK', prices).map((l) => l.unitPrice)).toEqual([
      6000, 4500, 1300,
    ]);
  });

  it('keeps menu prices for walk-ins and phone orders', () => {
    expect(forSource(ticket, 'PHONE', prices)).toBe(ticket);
    expect(forSource(ticket, 'POS', prices)).toBe(ticket);
  });
});
