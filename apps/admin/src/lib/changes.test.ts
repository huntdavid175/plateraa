import { describe, expect, it } from 'vitest';
import {
  changeLines,
  changeSummary,
  groupRuns,
  lineWords,
  runLines,
  runSubjects,
  type ActivityRow,
} from './changes';

const day = { open: true, from: '08:00', to: '20:00' };
const hours = { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day };
// The store's settings as the dashboard saves them: the whole set, every time.
const store = {
  storefrontArea: null,
  storefrontHours: hours,
  storefrontPhone: null,
  storefrontTheme: 'kente',
  storefrontEnabled: true,
  storefrontAcceptFirst: false,
  storefrontCashOnPickup: false,
  storefrontTakingOrders: true,
};

describe('changeLines', () => {
  it('says only what moved, in words', () => {
    const lines = changeLines(store, { ...store, storefrontTheme: 'classic' });
    expect(lines.map(lineWords)).toEqual(['Store look: Kente → Classic']);
  });

  it('turns switches, money and minutes into words', () => {
    expect(
      changeLines(
        { offersDineIn: false, idleLockSeconds: 180, price: 12000 },
        { offersDineIn: true, idleLockSeconds: 600, price: 15000 },
      ).map(lineWords),
    ).toEqual([
      'Dine-in: Off → On',
      'Tablet locks after: 3 min → 10 min',
      'Price: GH₵120.00 → GH₵150.00',
    ]);
  });

  it('writes opening hours the way the store shows them', () => {
    const closedSunday = { ...hours, sun: { ...day, open: false } };
    const [line] = changeLines(store, { ...store, storefrontHours: closedSunday });
    expect(line?.label).toBe('Opening hours');
    expect(line?.to).toContain('Sun closed');
  });

  it('lists what was added, without ids or the hidden delivery-app prices', () => {
    const lines = changeLines(null, {
      name: 'Sobolo',
      price: 3000,
      variants: [
        { name: 'Small', price: 3000 },
        { name: 'Large', price: 6000 },
      ],
      channelPrices: { BOLT_FOOD: 3500 },
      orderId: '01M6GVTV67XPSCK0MPKG1GQS3Y',
    });
    expect(lines.map(lineWords)).toEqual([
      'Name: Sobolo',
      'Price: GH₵30.00',
      'Sizes: Small GH₵30.00, Large GH₵60.00',
    ]);
  });

  it('leads a drawer close with whether it was over or short', () => {
    const lines = changeLines(null, {
      float: 25000,
      counted: 98500,
      expected: 100500,
      variance: -2000,
    });
    expect(lines[0]?.label).toBe('Over or short');
  });

  it('never shows a photo’s storage key', () => {
    const lines = changeLines({ photoKey: null }, { photoKey: 'tenant/items/x.webp' });
    expect(lines.map(lineWords)).toEqual(['Photo: None → New photo']);
  });

  it('names who sees sales with a yes or no', () => {
    const lines = changeLines(
      { RIDER: false, STAFF: false, MANAGER: true },
      { RIDER: false, STAFF: false, MANAGER: false },
    );
    expect(lines.map(lineWords)).toEqual(['Managers see sales: Yes → No']);
  });

  it('skips a field saved for the first time with nothing in it', () => {
    const lines = changeLines(
      { name: 'Fruit salad', price: 12000 },
      { name: 'Fruit salad', price: 12000, variants: [], channelPrices: {} },
    );
    expect(lines).toEqual([]);
  });

  it('says a suspension’s status and reason', () => {
    const lines = changeLines({ status: 'ACTIVE' }, { status: 'SUSPENDED', reason: 'Not trading' });
    expect(lines.map(lineWords)).toEqual(['Status: Open → Suspended', 'Reason: Not trading']);
  });
});

describe('changeSummary', () => {
  it('shows two lines and counts the rest', () => {
    const lines = [
      { label: 'A', from: '1', to: '2' },
      { label: 'B', to: '3' },
      { label: 'C', to: '4' },
    ];
    expect(changeSummary(lines)).toBe('A: 1 → 2 · B: 3 · 1 more');
    expect(changeSummary([])).toBeUndefined();
  });

  it('says only what changed when the values run long', () => {
    const lines = [
      {
        label: 'Opening hours',
        from: 'Mon–Sun 8:00 am – 8:00 pm',
        to: 'Mon–Sat 8:00 am – 8:00 pm · Sun closed',
      },
      { label: 'Store look', from: 'Kente', to: 'Classic' },
      { label: 'Cash on pickup', from: 'Off', to: 'On' },
    ];
    expect(changeSummary(lines)).toBe('Opening hours, store look and cash on pickup');
  });
});

const row = (id: string, minute: number, over: Partial<ActivityRow> = {}): ActivityRow => ({
  id,
  tenantId: 't1',
  businessName: 'Smoothie Bar',
  actorName: 'Fawaz Dogbe',
  action: 'settings.storefront',
  entityId: 't1',
  before: null,
  after: null,
  createdAt: new Date(Date.UTC(2026, 10, 19, 10, minute)).toISOString(),
  ...over,
});

describe('groupRuns', () => {
  it('folds the same change by the same person, minutes apart, into one run', () => {
    const runs = groupRuns([row('c', 20), row('b', 14), row('a', 5)]);
    expect(runs.map((run) => run.map((r) => r.id))).toEqual([['c', 'b', 'a']]);
  });

  it('starts a new run after a long gap, or for another person, action or business', () => {
    const runs = groupRuns([
      row('f', 59),
      row('e', 40), // 19 minutes after the next one: its own go
      row('d', 21, { actorName: 'Ama' }),
      row('c', 20, { action: 'item.updated' }),
      row('b', 19, { tenantId: 't2' }),
      row('a', 18),
    ]);
    expect(runs.map((run) => run.map((r) => r.id))).toEqual([
      ['f'],
      ['e'],
      ['d'],
      ['c'],
      ['b'],
      ['a'],
    ]);
  });
});

describe('runLines and runSubjects', () => {
  it('says where a run of setting changes ended up, skipping the steps between', () => {
    const run = [
      row('c', 3, {
        before: { ...store, storefrontTheme: 'sand' },
        after: { ...store, storefrontTheme: 'classic' },
      }),
      row('b', 2, { before: store, after: { ...store, storefrontTheme: 'sand' } }),
    ];
    expect(runLines(run).map(lineWords)).toEqual(['Store look: Kente → Classic']);
  });

  it('is empty when a run ends where it started', () => {
    const run = [
      row('b', 2, { before: { ...store, storefrontEnabled: false }, after: store }),
      row('a', 1, { before: store, after: { ...store, storefrontEnabled: false } }),
    ];
    expect(runLines(run)).toEqual([]);
  });

  it('names the different things a run touched', () => {
    const items = ['Sobolo', 'Fruit salad', 'Waakye', 'Kelewele', 'Sobolo'].map((name, i) =>
      row(String(i), 10 - i, { action: 'item.updated', entityId: name, after: { name } }),
    );
    expect(runSubjects(items)).toBe('Sobolo, Fruit salad, Waakye and 1 more');
  });
});
