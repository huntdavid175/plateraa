import { describe, expect, it } from 'vitest';
import { CART_KEEPS_MS, keptLines, knownCustomer, type CartLine } from './cart';

const line: CartLine = { uid: 'u1', itemId: 'i1', optionIds: [], quantity: 2 };
const now = Date.parse('2026-11-19T12:00:00Z');
const kept = (changedAt: number) => JSON.stringify({ lines: [line], changedAt });

describe('keptLines', () => {
  it('brings a cart back within a day of its last change', () => {
    expect(keptLines(kept(now - 60_000), now)).toEqual([line]);
    expect(keptLines(kept(now - CART_KEEPS_MS), now)).toEqual([line]);
  });

  it('lets a cart go once it is more than a day old', () => {
    expect(keptLines(kept(now - CART_KEEPS_MS - 1), now)).toEqual([]);
    expect(keptLines(kept(now - 14 * CART_KEEPS_MS), now)).toEqual([]);
  });

  it('brings back a cart kept before carts were stamped, once', () => {
    expect(keptLines(JSON.stringify([line]), now)).toEqual([line]);
  });

  it('treats nothing, or anything broken, as an empty cart', () => {
    expect(keptLines(null, now)).toEqual([]);
    expect(keptLines('not json', now)).toEqual([]);
    expect(keptLines(JSON.stringify({ lines: [line] }), now)).toEqual([]);
    expect(keptLines('null', now)).toEqual([]);
  });
});

describe('knownCustomer', () => {
  it('reads a name and number kept from the last order', () => {
    expect(knownCustomer(JSON.stringify({ name: 'Ama', phone: '0244123456' }))).toEqual({
      name: 'Ama',
      phone: '0244123456',
    });
  });

  it('ignores anything else', () => {
    expect(knownCustomer(null)).toBeNull();
    expect(knownCustomer('{')).toBeNull();
    expect(knownCustomer(JSON.stringify({ name: 'Ama' }))).toBeNull();
    expect(knownCustomer('null')).toBeNull();
  });
});
