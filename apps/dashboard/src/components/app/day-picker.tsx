import { Button } from '@/components/arc/button/button';
import { DatePicker } from '@/components/arc/date-picker/date-picker';

/** YYYY-MM-DD to a local Date and back, for the date picker. */
const toDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};
const fromDate = (date: Date) => date.toLocaleDateString('en-CA');

/** Any day up to today, and a way back to today once another is picked. */
export function DayPicker({
  date,
  today,
  onPick,
}: {
  /** YYYY-MM-DD. */
  date: string;
  today: string;
  /** The picked day, or '' for today. */
  onPick: (day: string) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      {date < today && (
        <Button variant="secondary" onClick={() => onPick('')}>
          Back to today
        </Button>
      )}
      <DatePicker
        label="Day"
        className="w-44"
        value={toDate(date)}
        maxDate={toDate(today)}
        locale="en-GB"
        format={{ weekday: 'short', day: 'numeric', month: 'short' }}
        showToday
        onChange={(picked) => onPick(picked ? fromDate(picked) : '')}
      />
    </div>
  );
}
