import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { StatusBadge } from '@/components/app/status-badge';
import { cedis, shortDate } from '../../lib/money';
import { orderLine, paymentState, type BackTo, type OrderRow } from '../../lib/orders';
import { kindWords } from '../../lib/words';

/**
 * One order in a short list (Home's recent orders, a customer's orders): number and kind, the
 * items, the amount and whether it's paid. Opens the order, which offers the way `back`.
 */
export function OrderListRow({
  order,
  back,
  showDay,
}: {
  order: Pick<
    OrderRow,
    | 'id'
    | 'displayNumber'
    | 'businessDate'
    | 'source'
    | 'type'
    | 'items'
    | 'total'
    | 'status'
    | 'amountDue'
    | 'amountPaid'
    | 'refundOwed'
  >;
  back: BackTo;
  /** Say which day it was on, for a list that spans days. */
  showDay?: boolean;
}) {
  return (
    <li>
      <Link
        to={`/orders/${order.id}`}
        state={back}
        className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/60"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm">
            <span className="font-mono font-medium">{order.displayNumber}</span>
            {showDay && (
              <span className="text-muted-foreground">{shortDate(order.businessDate)}</span>
            )}
            <span className="text-muted-foreground">{kindWords(order)}</span>
          </span>
          <span className="truncate text-sm text-text-secondary">{orderLine(order.items)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-sm">{cedis(order.total)}</span>
          <StatusBadge state={paymentState(order)} />
        </span>
        <ChevronRight
          size={16}
          strokeWidth={1.75}
          className="hidden shrink-0 text-muted-foreground sm:block"
          aria-hidden
        />
      </Link>
    </li>
  );
}
