import { useQuery } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { Panel, PanelRows } from '@/components/app/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { cedis, clock, longDate, todayHere } from '../lib/money';
import { fetchRefundsOwed, orderLine, type OrderRow } from '../lib/orders';
import { useSession } from '../lib/session';
import { METHOD_WORDS } from '../lib/words';
import { Page } from '../ui/Page';
import { RecordRefundDialog } from './money-dialogs';

export function RefundsPage() {
  const { tenantId } = useSession();
  const owed = useQuery({ queryKey: ['refunds-owed', tenantId], queryFn: fetchRefundsOwed });
  const [recording, setRecording] = useState<OrderRow | null>(null);
  const total = (owed.data ?? []).reduce((sum, order) => sum + order.refundOwed, 0);

  return (
    <Page title="Refunds owed" subtitle="Give the money back first, then record it here." narrow>
      {owed.isError && (
        <Alert tone="danger" title="Couldn’t load the refunds">
          {owed.error.message}
        </Alert>
      )}
      {!owed.isError && (
        <Panel
          title={
            owed.data && owed.data.length > 0
              ? `${owed.data.length === 1 ? '1 order' : `${owed.data.length} orders`}, ${cedis(total)} to give back`
              : 'To give back'
          }
        >
          {owed.isPending && (
            <PanelRows>
              {[0, 1].map((row) => (
                <li key={row} className="flex flex-col gap-3 px-5 py-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3.5 w-56" />
                  <Skeleton className="h-9 w-48" />
                </li>
              ))}
            </PanelRows>
          )}
          {owed.data?.length === 0 && (
            <EmptyState
              icon={<Undo2 size={24} strokeWidth={1.75} />}
              title="No refunds owed"
              description="When a paid order is cancelled on the tablet, it shows here until the money is given back."
            />
          )}
          {owed.data && owed.data.length > 0 && (
            <PanelRows>
              {owed.data.map((order) => (
                <li key={order.id} className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">
                        Order <span className="font-mono">{order.displayNumber}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {order.businessDate === todayHere()
                          ? 'Today'
                          : longDate(order.businessDate)}{' '}
                        at {clock(order.takenAt)}
                        {order.paidWith.length > 0 &&
                          `, paid by ${order.paidWith.map((m) => METHOD_WORDS[m].toLowerCase()).join(' and ')}`}
                      </span>
                      <span className="truncate text-sm text-text-secondary">
                        {orderLine(order.items)}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-danger">
                      {cedis(order.refundOwed)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setRecording(order)}>
                      Record refund given
                    </Button>
                    <Link
                      to={`/orders/${order.id}`}
                      state={{ back: '/refunds', label: 'Refunds' }}
                      className="inline-flex min-h-(--control-height-md) items-center px-3 text-sm font-medium text-accent-strong"
                    >
                      View order
                    </Link>
                  </div>
                </li>
              ))}
            </PanelRows>
          )}
        </Panel>
      )}
      {recording && <RecordRefundDialog order={recording} onClose={() => setRecording(null)} />}
    </Page>
  );
}
