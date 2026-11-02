import { personColour } from '../ui/people';
import { useLocalQuery } from './TabletProvider';

/** Everyone at the business, inactive people too, so a colour stays put when someone leaves. */
const ALL_STAFF = 'SELECT id FROM staff';

/** Each person's colour, worked out against everyone at the business. */
export function usePersonColour() {
  const staffIds = (useLocalQuery<{ id: string }>(ALL_STAFF) ?? []).map((person) => person.id);
  return (id: string) => personColour(id, staffIds);
}
