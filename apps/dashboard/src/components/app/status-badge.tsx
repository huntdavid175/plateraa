import { Badge } from '@/components/arc/badge/badge';
import type { PaymentState } from '../../lib/orders';

const TONES = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
  neutral: 'neutral',
} as const;

/** Paid, Unpaid, Refund owed, Cancelled or Refunded, as a small badge. */
export function StatusBadge({ state }: { state: PaymentState }) {
  return (
    <Badge tone={TONES[state.tone]} size="sm">
      {state.label}
    </Badge>
  );
}
