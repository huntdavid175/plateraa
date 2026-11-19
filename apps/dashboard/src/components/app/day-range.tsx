import { useSearchParams } from 'react-router';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { DateField } from '@/components/app/day-picker';
import { lastMonth, shiftDays } from '../../lib/expenses';
import { todayHere } from '../../lib/money';

export const RANGES = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: 'pick', label: 'Pick days' },
] as const;
export type Range = (typeof RANGES)[number]['value'];

/** The most the API reports on at once. */
export const MAX_DAYS = 92;
export const DAY_MS = 86_400_000;

function rangeOf(range: Exclude<Range, 'pick'>, today: string): { from: string; to: string } {
  if (range === 'week') return { from: shiftDays(today, -6), to: today };
  if (range === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return lastMonth(today);
}

/** What's wrong with a picked range, in words, or null. */
function rangeProblem(from: string, to: string): string | null {
  if (from > to) return 'The first day comes after the last.';
  if ((Date.parse(to) - Date.parse(from)) / DAY_MS >= MAX_DAYS) {
    return `Pick ${MAX_DAYS} days or fewer.`;
  }
  return null;
}

/**
 * The days a screen covers (Reports, Cash): the last 7 days, this month, last month, or picked
 * days. They live in the address (`?range=`, and `from`/`to` for picked days), so a page can be
 * shared and figures elsewhere can link to the same days.
 */
export function useDayRange() {
  const [params, setParams] = useSearchParams();
  const today = todayHere();
  const range = RANGES.find((r) => r.value === params.get('range'))?.value ?? 'week';
  const { from, to } =
    range === 'pick'
      ? { from: params.get('from') ?? shiftDays(today, -6), to: params.get('to') ?? today }
      : rangeOf(range, today);
  const problem = range === 'pick' ? rangeProblem(from, to) : null;

  const choose = (next: Range) =>
    setParams(
      next === 'week' ? {} : next === 'pick' ? { range: next, from, to } : { range: next },
      { replace: true },
    );
  const pickDay = (key: 'from' | 'to', value: string) => {
    if (value) setParams({ range: 'pick', from, to, [key]: value }, { replace: true });
  };
  return { range, from, to, today, problem, choose, pickDay };
}

/** The choice of days, and the two date fields when they're picked. */
export function DayRangePicker({ days }: { days: ReturnType<typeof useDayRange> }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SegmentedControl
        label="Which days"
        options={[...RANGES]}
        value={days.range}
        onValueChange={(value) => days.choose(value as Range)}
      />
      {days.range === 'pick' && (
        <>
          <DateField
            label="From"
            date={days.from}
            max={days.today}
            onPick={(day) => days.pickDay('from', day)}
          />
          <DateField
            label="To"
            date={days.to}
            max={days.today}
            onPick={(day) => days.pickDay('to', day)}
          />
        </>
      )}
    </div>
  );
}
