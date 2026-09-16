import { z } from 'zod';

/** The week as the dashboard shows it, Monday first. */
export const STORE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type StoreDay = (typeof STORE_DAYS)[number];

const DAY_NAMES: Record<StoreDay, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const SHORT_NAMES: Record<StoreDay, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** What the weekday parts of `Intl.DateTimeFormat` give back, in our own order. */
const BY_INTL: Record<string, StoreDay> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** One day of the week: whether the store works that day, and between what times. */
export const dayHoursSchema = z.object({
  /** The store works that day at all. Off means closed all day. */
  open: z.boolean(),
  /** "HH:MM" in the store's own timezone. A `to` earlier than `from` closes after midnight. */
  from: z.string().regex(TIME),
  to: z.string().regex(TIME),
});

export const storeHoursSchema = z.object({
  mon: dayHoursSchema,
  tue: dayHoursSchema,
  wed: dayHoursSchema,
  thu: dayHoursSchema,
  fri: dayHoursSchema,
  sat: dayHoursSchema,
  sun: dayHoursSchema,
});

export type DayHours = z.infer<typeof dayHoursSchema>;
export type StoreHours = z.infer<typeof storeHoursSchema>;

/** What a store starts with until the owner sets its own: every day, 8 in the morning to 8 at night. */
export const DEFAULT_STORE_HOURS: StoreHours = Object.fromEntries(
  STORE_DAYS.map((day) => [day, { open: true, from: '08:00', to: '20:00' }]),
) as StoreHours;

/** Minutes since midnight: "08:30" → 510. */
export const minutesOf = (time: string): number => {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
};

/** "17:00" → "5:00 pm", as a Ghanaian customer reads it. */
export function timeWords(time: string): string {
  const total = minutesOf(time);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const oClock = hours % 12 === 0 ? 12 : hours % 12;
  return `${oClock}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
}

const dayBefore = (day: StoreDay): StoreDay =>
  STORE_DAYS[(STORE_DAYS.indexOf(day) + 6) % 7] as StoreDay;

/** A window that ends earlier than it starts runs past midnight into the next day. */
const pastMidnight = (hours: DayHours) => minutesOf(hours.to) < minutesOf(hours.from);

/** The store's own wall clock: which day it is there, and how far into it. */
export function clockAt(at: Date, timeZone: string): { day: StoreDay; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  // Midnight comes back as "24" from some runtimes.
  const hour = Number(value('hour')) % 24;
  return {
    day: BY_INTL[value('weekday')] ?? 'mon',
    minutes: hour * 60 + Number(value('minute')),
  };
}

/** Whether a day's window covers a time of that same day. */
function covers(hours: DayHours, minutes: number): boolean {
  if (!hours.open || hours.from === hours.to) return false;
  const from = minutesOf(hours.from);
  const to = minutesOf(hours.to);
  return pastMidnight(hours) ? minutes >= from : minutes >= from && minutes < to;
}

/** Is the store open at this moment, by its own clock? */
export function isOpenAt(hours: StoreHours, at: Date, timeZone: string): boolean {
  const { day, minutes } = clockAt(at, timeZone);
  if (covers(hours[day], minutes)) return true;
  // Still in last night's window: yesterday closed after midnight.
  const last = hours[dayBefore(day)];
  return last.open && pastMidnight(last) && minutes < minutesOf(last.to);
}

/** When the store next opens: the day it falls on, and how many days from now that is. */
export function nextOpening(
  hours: StoreHours,
  at: Date,
  timeZone: string,
): { day: StoreDay; from: string; inDays: number } | null {
  const { day, minutes } = clockAt(at, timeZone);
  const start = STORE_DAYS.indexOf(day);
  for (let ahead = 0; ahead < 7; ahead += 1) {
    const each = STORE_DAYS[(start + ahead) % 7] as StoreDay;
    const open = hours[each];
    if (!open.open || open.from === open.to) continue;
    // Today only counts if it hasn't opened yet.
    if (ahead === 0 && minutesOf(open.from) <= minutes) continue;
    return { day: each, from: open.from, inDays: ahead };
  }
  return null;
}

/**
 * When the store opens next, in words for the customer: "Opens today at 5:00 pm". Null when it
 * is open now, or when no day is open at all and there's nothing to promise.
 */
export function opensWords(hours: StoreHours, at: Date, timeZone: string): string | null {
  if (isOpenAt(hours, at, timeZone)) return null;
  const next = nextOpening(hours, at, timeZone);
  if (!next) return null;
  const when =
    next.inDays === 0 ? 'today' : next.inDays === 1 ? 'tomorrow' : `on ${DAY_NAMES[next.day]}`;
  return `Opens ${when} at ${timeWords(next.from)}`;
}

/**
 * The week for the store's page, with days that share their times run together:
 * "Mon–Fri 8:00 am – 8:00 pm · Sat 10:00 am – 6:00 pm · Sun closed".
 */
export function hoursWords(hours: StoreHours): string {
  const same = (a: DayHours, b: DayHours) =>
    a.open === b.open && (!a.open || (a.from === b.from && a.to === b.to));
  const runs: { first: StoreDay; last: StoreDay; hours: DayHours }[] = [];
  for (const day of STORE_DAYS) {
    const last = runs[runs.length - 1];
    if (last && same(last.hours, hours[day])) last.last = day;
    else runs.push({ first: day, last: day, hours: hours[day] });
  }
  if (runs.length === 1 && !runs[0]!.hours.open) return 'Closed every day';
  return runs
    .map((run) => {
      const days =
        run.first === run.last
          ? SHORT_NAMES[run.first]
          : `${SHORT_NAMES[run.first]}–${SHORT_NAMES[run.last]}`;
      const when =
        run.hours.open && run.hours.from !== run.hours.to
          ? `${timeWords(run.hours.from)} – ${timeWords(run.hours.to)}`
          : 'closed';
      return `${days} ${when}`;
    })
    .join(' · ');
}
