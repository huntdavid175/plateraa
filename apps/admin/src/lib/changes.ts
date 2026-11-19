import { hoursWords, STOREFRONT_LOOKS, type StoreHours } from '@brixx/shared';
import { cedis, count, sentence, shortDay, STATUS_WORDS, vendorType } from './format';

/**
 * One thing a change did, in a support person's words: "Store look: Kente → Classic". `from` is
 * left out where there was nothing before (an item added, a payment recorded).
 */
export interface ChangeLine {
  label: string;
  from?: string;
  to: string;
}

/** What each saved field is called on the dashboard or the tablet. */
const LABELS: Record<string, string> = {
  name: 'Name',
  displayName: 'Name',
  price: 'Price',
  variants: 'Sizes',
  fee: 'Delivery fee',
  active: 'In use',
  code: 'Code',
  role: 'Role',
  amount: 'Amount',
  method: 'Paid by',
  reason: 'Reason',
  reasons: 'Why',
  amountPaid: 'Paid so far',
  vendorType: 'Kind of business',
  status: 'Status',
  slug: 'Store link',
  float: 'Float',
  counted: 'Counted',
  expected: 'Expected',
  variance: 'Over or short',
  type: 'Kind',
  businessDate: 'Day',
  onHand: 'In stock',
  discount: 'Discount',
  total: 'Total',
  category: 'Kind',
  note: 'Note',
  phone: 'Phone',
  failedAttempts: 'Wrong tries',
  photoKey: 'Photo',
  offersDineIn: 'Dine-in',
  countPortions: 'Count portions',
  idleLockSeconds: 'Tablet locks after',
  requirePaymentBeforePrep: 'Pay before prep',
  RIDER: 'Riders see sales',
  STAFF: 'Staff see sales',
  MANAGER: 'Managers see sales',
  storefrontArea: 'Area',
  storefrontHours: 'Opening hours',
  storefrontPhone: 'Store phone',
  storefrontTheme: 'Store look',
  storefrontEnabled: 'Online store',
  storefrontAcceptFirst: 'Wait for Accept',
  storefrontCashOnPickup: 'Cash on pickup',
  storefrontTakingOrders: 'Taking orders',
};

const MONEY = new Set([
  'price',
  'fee',
  'amount',
  'amountPaid',
  'float',
  'counted',
  'expected',
  'variance',
  'discount',
  'total',
]);
/** Fields that lead the line when a change is listed field by field. */
const FIRST = ['variance'];
/** Who sees sales is a yes or no; every other switch is on or off. */
const YES_NO = new Set(['RIDER', 'STAFF', 'MANAGER', 'active']);
/** Ids mean nothing to a person, and Bolt Food and Chowdeck prices are hidden for now. */
const HIDDEN = (key: string) => /(^id|Id)$/.test(key) || key === 'channelPrices';

type Record_ = Record<string, unknown>;
export const isRecord = (value: unknown): value is Record_ =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const empty = (value: unknown) =>
  value === null || value === undefined || (Array.isArray(value) && value.length === 0);

const labelOf = (key: string) => LABELS[key] ?? sentence(key.replace(/([a-z])([A-Z])/g, '$1 $2'));

/** One saved value in words: cedis for money, the look's name, "On" for a switch. */
export function valueWords(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'None';
  if (typeof value === 'boolean') {
    if (YES_NO.has(key)) return value ? 'Yes' : 'No';
    return value ? 'On' : 'Off';
  }
  if (typeof value === 'number') {
    if (MONEY.has(key)) return cedis(value);
    if (key === 'idleLockSeconds') return value < 60 ? `${value} sec` : `${value / 60} min`;
    return count(value);
  }
  if (typeof value === 'string') {
    if (key === 'storefrontTheme')
      return STOREFRONT_LOOKS[value as keyof typeof STOREFRONT_LOOKS]?.name ?? sentence(value);
    if (key === 'vendorType') return vendorType(value);
    if (key === 'status') return STATUS_WORDS[value] ?? sentence(value);
    if (key === 'businessDate' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return shortDay(value);
    if (key === 'photoKey') return 'A photo';
    if (/^[A-Z][A-Z_]+$/.test(value)) return sentence(value);
    return value;
  }
  if (key === 'storefrontHours' && isRecord(value)) {
    try {
      return hoursWords(value as StoreHours);
    } catch {
      return 'Changed';
    }
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';
    return value
      .map((part) =>
        isRecord(part) && typeof part.name === 'string'
          ? typeof part.price === 'number'
            ? `${part.name} ${cedis(part.price)}`
            : part.name
          : valueWords(key, part),
      )
      .join(', ');
  }
  return JSON.stringify(value);
}

function linesOf(before: unknown, after: unknown, prefix = ''): ChangeLine[] {
  const lines: ChangeLine[] = [];
  const label = (key: string) =>
    prefix ? `${prefix}, ${labelOf(key).toLowerCase()}` : labelOf(key);

  if (isRecord(before) && isRecord(after)) {
    for (const key of Object.keys(after)) {
      if (HIDDEN(key)) continue;
      const was = before[key];
      const now = after[key];
      if (!(key in before)) {
        // Saved for the first time with this change: say it only when it says something.
        if (!empty(now)) lines.push({ label: label(key), to: valueWords(key, now) });
      } else if (!same(was, now)) {
        if (key === 'photoKey') {
          lines.push({
            label: label(key),
            from: was ? 'Old photo' : 'None',
            to: now ? 'New photo' : 'Taken off',
          });
        } else if (isRecord(was) && isRecord(now) && key !== 'storefrontHours') {
          lines.push(...linesOf(was, now, labelOf(key)));
        } else {
          lines.push({ label: label(key), from: valueWords(key, was), to: valueWords(key, now) });
        }
      }
    }
    return lines;
  }

  // Added (nothing before) or removed (nothing after): what it was, field by field.
  const only = isRecord(after) ? after : isRecord(before) ? before : null;
  if (!only) return lines;
  // What someone looks for first: a drawer's over or short before its float.
  const entries = Object.entries(only).sort(
    ([a], [b]) => Number(FIRST.includes(b)) - Number(FIRST.includes(a)),
  );
  for (const [key, value] of entries) {
    if (HIDDEN(key) || empty(value)) continue;
    lines.push({ label: label(key), to: valueWords(key, value) });
  }
  return lines;
}

/** What a change did, field by field, leaving out what stayed the same. */
export const changeLines = (before: unknown, after: unknown): ChangeLine[] =>
  linesOf(before, after);

/** "Store look: Kente → Classic". */
export const lineWords = (line: ChangeLine) =>
  line.from === undefined
    ? `${line.label}: ${line.to}`
    : `${line.label}: ${line.from} → ${line.to}`;

/** Longest grey line before it says only what changed, not what to. */
const SUMMARY_MAX = 80;

/** "a, b and c" */
const listWords = (words: string[]) =>
  words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/**
 * The grey line under a change in a feed: its first two lines and how many more ("Store look:
 * Kente → Classic"), or, where that runs long (opening hours), just what changed ("Opening hours,
 * store look and cash on pickup"). The open row has the rest.
 */
export function changeSummary(lines: ChangeLine[]): string | undefined {
  if (lines.length === 0) return undefined;
  const shown = lines.slice(0, 2).map(lineWords).join(' · ');
  const full = lines.length > 2 ? `${shown} · ${lines.length - 2} more` : shown;
  if (full.length <= SUMMARY_MAX) return full;
  return listWords(lines.map((line, i) => (i === 0 ? line.label : line.label.toLowerCase())));
}

/** One audited row, as the feeds get it from the API. */
export interface ActivityRow {
  id: string;
  tenantId: string;
  businessName: string;
  actorName: string;
  action: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

/** Changes this close together, by the same person, count as one go. */
export const RUN_GAP_MS = 10 * 60_000;

/**
 * Rows in a feed, newest first, with runs of the same change folded together: the same person
 * doing the same thing at the same business, each within 10 minutes of the last. Tapping through
 * the store's switches on the dashboard saves each tap, and nine rows of "changed store settings"
 * tell the team less than one.
 */
export function groupRuns<T extends ActivityRow>(rows: T[], gapMs = RUN_GAP_MS): T[][] {
  const runs: T[][] = [];
  for (const row of rows) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (
      run &&
      last &&
      last.tenantId === row.tenantId &&
      last.actorName === row.actorName &&
      last.action === row.action &&
      Math.abs(new Date(last.createdAt).getTime() - new Date(row.createdAt).getTime()) <= gapMs
    ) {
      run.push(row);
    } else {
      runs.push([row]);
    }
  }
  return runs;
}

/**
 * What a run did overall. The same thing changed several times (the store's settings) is the
 * first before against the last after, so "Store look: Kente → Classic" even if Sand came between;
 * different things (five menu items) are each one's lines.
 */
export function runLines(run: ActivityRow[]): ChangeLine[] {
  const newest = run[0]!;
  const oldest = run[run.length - 1]!;
  if (run.every((row) => row.entityId === newest.entityId) && isRecord(oldest.before)) {
    return changeLines(oldest.before, newest.after);
  }
  return [];
}

/** The names of what a run touched, for a run of different things: "Sobolo, Fruit salad". */
export function runSubjects(run: ActivityRow[]): string | undefined {
  const names = [
    ...new Set(
      run
        .map((row) => {
          const side = isRecord(row.after) ? row.after : isRecord(row.before) ? row.before : null;
          const name = side?.name ?? side?.displayName;
          return typeof name === 'string' ? name : null;
        })
        .filter((name): name is string => name !== null),
    ),
  ];
  if (names.length === 0) return undefined;
  return names.length > 3
    ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
    : names.join(', ');
}
