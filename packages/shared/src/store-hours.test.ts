import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STORE_HOURS,
  STORE_DAYS,
  clockAt,
  hoursWords,
  isOpenAt,
  opensWords,
  storeHoursSchema,
  timeWords,
  type StoreDay,
  type StoreHours,
} from './store-hours.js';

const ACCRA = 'Africa/Accra';

/** A week where every day is the same, then changed day by day. */
const week = (from: string, to: string, open = true): StoreHours =>
  Object.fromEntries(STORE_DAYS.map((day: StoreDay) => [day, { open, from, to }])) as StoreHours;

/** Accra is on UTC all year, so the wall clock is the UTC clock. */
const at = (iso: string) => new Date(`${iso}Z`);

// Thu 17 Sep 2026.
const THURSDAY = '2026-09-17T';

describe('the store clock', () => {
  it('reads the day and time in the store’s own timezone', () => {
    expect(clockAt(at(`${THURSDAY}09:30:00`), ACCRA)).toEqual({ day: 'thu', minutes: 570 });
    // Lagos is an hour ahead: the same moment is later in the day there.
    expect(clockAt(at(`${THURSDAY}23:30:00`), 'Africa/Lagos')).toEqual({ day: 'fri', minutes: 30 });
  });

  it('is open between the times, and closed on either side', () => {
    const hours = week('08:00', '20:00');
    expect(isOpenAt(hours, at(`${THURSDAY}07:59:00`), ACCRA)).toBe(false);
    expect(isOpenAt(hours, at(`${THURSDAY}08:00:00`), ACCRA)).toBe(true);
    expect(isOpenAt(hours, at(`${THURSDAY}19:59:00`), ACCRA)).toBe(true);
    expect(isOpenAt(hours, at(`${THURSDAY}20:00:00`), ACCRA)).toBe(false);
  });

  it('is closed all day where the day is switched off', () => {
    const hours = { ...week('08:00', '20:00'), thu: { open: false, from: '08:00', to: '20:00' } };
    expect(isOpenAt(hours, at(`${THURSDAY}12:00:00`), ACCRA)).toBe(false);
    expect(isOpenAt(hours, at('2026-09-18T12:00:00'), ACCRA)).toBe(true); // Friday.
  });

  it('keeps a kitchen that closes after midnight open past midnight', () => {
    const hours = week('17:00', '02:00');
    expect(isOpenAt(hours, at(`${THURSDAY}18:00:00`), ACCRA)).toBe(true);
    expect(isOpenAt(hours, at(`${THURSDAY}23:59:00`), ACCRA)).toBe(true);
    expect(isOpenAt(hours, at('2026-09-18T01:30:00'), ACCRA)).toBe(true); // Friday, small hours.
    expect(isOpenAt(hours, at('2026-09-18T02:00:00'), ACCRA)).toBe(false);
    expect(isOpenAt(hours, at('2026-09-18T09:00:00'), ACCRA)).toBe(false);
  });

  it('does not carry last night over from a day that was switched off', () => {
    const hours = { ...week('17:00', '02:00'), thu: { open: false, from: '17:00', to: '02:00' } };
    expect(isOpenAt(hours, at('2026-09-18T01:00:00'), ACCRA)).toBe(false); // Thursday night.
  });

  it('treats the same time twice as closed, rather than guessing', () => {
    expect(isOpenAt(week('08:00', '08:00'), at(`${THURSDAY}12:00:00`), ACCRA)).toBe(false);
  });
});

describe('when the store opens next', () => {
  it('says nothing while it is open', () => {
    expect(opensWords(DEFAULT_STORE_HOURS, at(`${THURSDAY}12:00:00`), ACCRA)).toBeNull();
  });

  it('says today when it opens later on', () => {
    expect(opensWords(week('17:00', '22:00'), at(`${THURSDAY}09:00:00`), ACCRA)).toBe(
      'Opens today at 5:00 pm',
    );
  });

  it('says tomorrow once today’s closing time has passed', () => {
    expect(opensWords(week('08:00', '20:00'), at(`${THURSDAY}21:00:00`), ACCRA)).toBe(
      'Opens tomorrow at 8:00 am',
    );
  });

  it('names the day when the days between are closed', () => {
    const hours = {
      ...week('08:00', '20:00', false),
      sat: { open: true, from: '10:00', to: '18:00' },
    };
    expect(opensWords(hours, at(`${THURSDAY}21:00:00`), ACCRA)).toBe(
      'Opens on Saturday at 10:00 am',
    );
  });

  it('promises nothing when no day is open', () => {
    expect(opensWords(week('08:00', '20:00', false), at(`${THURSDAY}12:00:00`), ACCRA)).toBeNull();
  });
});

describe('the week in words', () => {
  it('runs days with the same times together', () => {
    const hours: StoreHours = {
      ...week('08:00', '20:00'),
      sat: { open: true, from: '10:00', to: '18:00' },
      sun: { open: false, from: '10:00', to: '18:00' },
    };
    expect(hoursWords(hours)).toBe(
      'Mon–Fri 8:00 am – 8:00 pm · Sat 10:00 am – 6:00 pm · Sun closed',
    );
  });

  it('says so when the store never opens', () => {
    expect(hoursWords(week('08:00', '20:00', false))).toBe('Closed every day');
  });

  it('writes the times as a customer reads them', () => {
    expect(timeWords('00:00')).toBe('12:00 am');
    expect(timeWords('12:05')).toBe('12:05 pm');
    expect(timeWords('13:30')).toBe('1:30 pm');
  });
});

describe('the hours as they are saved', () => {
  it('takes a full week of times', () => {
    expect(storeHoursSchema.parse(DEFAULT_STORE_HOURS)).toEqual(DEFAULT_STORE_HOURS);
  });

  it('refuses anything that is not a time of day', () => {
    const wrong = { ...DEFAULT_STORE_HOURS, mon: { open: true, from: '8am', to: '20:00' } };
    expect(storeHoursSchema.safeParse(wrong).success).toBe(false);
    expect(storeHoursSchema.safeParse({ mon: DEFAULT_STORE_HOURS.mon }).success).toBe(false);
  });
});
