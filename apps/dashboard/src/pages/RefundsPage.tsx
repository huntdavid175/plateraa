import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { cedis, clock, longDate, todayHere } from '../lib/money';
import { fetchRefundsOwed, orderLine, type OrderRow } from '../lib/orders';
import { useSession } from '../lib/session';
import { METHOD_WORDS } from '../lib/words';
import { Button, Card, ErrorNote, Spinner } from '../ui/controls';
import { Page } from '../ui/Page';
import { RecordRefundDialog } from './money-dialogs';

export function RefundsPage() {
  const { tenantId } = useSession();
  const owed = useQuery({ queryKey: ['refunds-owed', tenantId], queryFn: fetchRefundsOwed });
  const [recording, setRecording] = useState<OrderRow | null>(null);

  return (
    <Page title="Refunds owed" subtitle="Give the money back first, then record it here." narrow>
      {owed.isPending && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}
      {owed.isError && <ErrorNote>{owed.error.message}</ErrorNote>}
      {owed.data?.length === 0 && (
        <Card className="px-5 py-12 text-center">
          <p className="text-muted-foreground">No refunds owed.</p>
        </Card>
      )}
      {owed.data?.map((order) => (
        <div key={order.id} className="mb-3 rounded-xl border border-red/25 bg-surface p-5">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-semibold">Order {order.displayNumber}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {order.businessDate === todayHere() ? 'Today' : longDate(order.businessDate)} at{' '}
                {clock(order.takenAt)}
                {order.paidWith.length > 0 &&
                  ` · paid by ${order.paidWith.map((m) => METHOD_WORDS[m].toLowerCase()).join(' and ')}`}
              </p>
              <p className="mt-1 truncate text-sm">{orderLine(order.items)}</p>
            </div>
            <p className="shrink-0 font-mono font-semibold text-red">{cedis(order.refundOwed)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="danger" full onClick={() => setRecording(order)}>
              Record refund given
            </Button>
            <Link
              to={`/orders/${order.id}`}
              state={{ back: '/refunds', label: 'Refunds' }}
              className="inline-flex h-11 shrink-0 items-center rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground"
            >
              View order
            </Link>
          </div>
        </div>
      ))}
      {recording && <RecordRefundDialog order={recording} onClose={() => setRecording(null)} />}
    </Page>
  );
}
