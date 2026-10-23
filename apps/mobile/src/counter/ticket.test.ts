import { pesewas } from '@brixx/shared';
import { describe, expect, it } from 'vitest';
import { addToTicket, changeQuantity, removeLine, type TicketLine } from './ticket';

const line = (lineId: string, itemId: string, quantity = 1): TicketLine => ({
  lineId,
  itemId,
  name: itemId,
  unitPrice: pesewas(1000),
  modifiers: [],
  quantity,
});

describe('the order being typed in', () => {
  it('adds one more of the same thing, and drops a line at zero', () => {
    const lines = addToTicket(addToTicket([], line('a', 'jollof')), line('b', 'jollof'));
    expect(lines).toMatchObject([{ lineId: 'a', quantity: 2 }]);
    expect(changeQuantity(lines, 'a', -2)).toEqual([]);
  });

  it('removes a line whatever its quantity, and leaves the rest', () => {
    const lines = [line('a', 'jollof', 3), line('b', 'sobolo')];
    expect(removeLine(lines, 'a')).toEqual([line('b', 'sobolo')]);
    expect(removeLine(lines, 'missing')).toEqual(lines);
  });
});
