import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Avatar } from '@/components/arc/avatar/avatar';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Gauge } from '@/components/arc/gauge/gauge';
import { Timeline, type TimelineEvent } from '@/components/arc/timeline/timeline';
import { Bento, Tile, TileRows } from '@/components/app/bento';
import { PanelLine } from '@/components/app/panel';
import { StatusBadge } from '@/components/app/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cedis, clock, longDate } from '../lib/money';
import { fetchOrder, paymentState, type BackTo, type OrderDetail } from '../lib/orders';
import { useSession } from '../lib/session';
import { useNow } from '../lib/use-now';
import {
  METHOD_WORDS,
  REVIEW_WORDS,
  SOURCE_WORDS,
  STATUS_WORDS,
  kindWords,
  linkWords,
  phoneWords,
} from '../lib/words';
import { useMe } from '../shell/Shell';
import { DiscountDialog, RecordRefundDialog } from './money-dialogs';

/** One order on its own page (`/orders/:orderId`), reached from Home, a customer, Refunds. */
export function OrderPage() {
  const { orderId = '' } = useParams();
  const location = useLocation();
  const back = (location.state as BackTo | null) ?? { back: '/orders', label: 'Orders' };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <Link
        to={back.back}
        className="inline-flex items-center gap-2 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
        {back.label}
      </Link>
      <OrderView orderId={orderId} />
    </div>
  );
}

/**
 * Everything about one order: its page, or the drawer the Orders list opens. `narrow` (the
 * drawer) stacks the tiles in one column.
 */
export function OrderView({ orderId, narrow }: { orderId: string; narrow?: boolean }) {
  const { tenantId } = useSession();
  const order = useQuery({
    queryKey: ['order', tenantId, orderId],
    queryFn: () => fetchOrder(orderId),
  });

  if (order.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-56 w-full rounded-(--radius-surface)" />
        <Skeleton className="h-40 w-full rounded-(--radius-surface)" />
      </div>
    );
  }
  if (order.isError) {
    return (
      <Alert tone="danger" title="Couldn’t load this order">
        <div className="flex flex-col items-start gap-3">
          <p>{order.error.message}</p>
          <Button variant="secondary" size="sm" onClick={() => order.refetch()}>
            Try again
          </Button>
        </div>
      </Alert>
    );
  }
  return <OrderBody order={order.data} narrow={narrow} />;
}

function OrderBody({ order, narrow }: { order: OrderDetail; narrow?: boolean | undefined }) {
  const me = useMe();
  const [dialog, setDialog] = useState<'refund' | 'discount' | null>(null);
  const stillOwed = Math.max(0, order.amountDue - order.amountPaid);
  const settled = order.status === 'CANCELLED' || order.status === 'REFUNDED';
  const canDiscount = me.capabilities.includes('discounts.apply') && !settled && stillOwed > 0;
  const paidShare =
    order.amountDue > 0
      ? Math.min(100, Math.round((order.amountPaid / order.amountDue) * 100))
      : 100;
  // In the drawer every tile takes the whole width.
  const wide = narrow ? 'col-span-2 lg:col-span-4' : 'col-span-2';

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl leading-[1.1] font-medium tracking-[-0.03em]">
            Order <span className="tabular-nums">{order.displayNumber}</span>
          </h1>
          <p className="text-sm text-text-secondary">
            {longDate(order.businessDate)} at {clock(order.takenAt)}
            {order.takenBy ? `, taken by ${order.takenBy}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge state={paymentState(order)} />
            <Badge size="sm">{kindWords(order)}</Badge>
            <Badge size="sm">{STATUS_WORDS[order.status]}</Badge>
            {order.onHold && <Badge size="sm">On hold</Badge>}
          </div>
        </div>
        {canDiscount && (
          <Button variant="secondary" onClick={() => setDialog('discount')}>
            {order.discount > 0 ? 'Change discount' : 'Apply discount'}
          </Button>
        )}
      </header>

      {order.refundOwed > 0 && (
        <Alert tone="danger" title={`Refund owed: ${cedis(order.refundOwed)}`}>
          <div className="flex flex-col items-start gap-3">
            <p>Give it back to the customer, then record it here.</p>
            {me.capabilities.includes('refunds.record') && (
              <Button onClick={() => setDialog('refund')}>Record refund given</Button>
            )}
          </div>
        </Alert>
      )}
      {order.reviewReasons.length > 0 && (
        <Alert tone="warning" title="Worth a look">
          {order.reviewReasons.map((reason) => (
            <p key={reason}>{REVIEW_WORDS[reason] ?? reason}</p>
          ))}
        </Alert>
      )}
      {order.status === 'CANCELLED' && order.cancelReason && (
        <Alert tone="info" title="Cancelled">
          {order.cancelReason}
        </Alert>
      )}

      <Bento>
        <Tile title="Items" className={wide}>
          <TileRows>
            {order.items.map((line, index) => (
              <li key={index} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-sm">
                    {line.quantity > 1 && (
                      <span className="text-muted-foreground tabular-nums">{line.quantity} × </span>
                    )}
                    {line.name}
                    {line.variantName && (
                      <span className="text-muted-foreground"> ({line.variantName})</span>
                    )}
                  </p>
                  {line.modifiers.map((modifier) => (
                    <p key={modifier.name} className="text-xs text-muted-foreground">
                      + {modifier.name}
                      {modifier.quantity > 1 ? ` × ${modifier.quantity}` : ''}
                      {modifier.unitPriceDelta !== 0 ? ` (${cedis(modifier.unitPriceDelta)})` : ''}
                    </p>
                  ))}
                  {line.note && <p className="text-xs text-muted-foreground">“{line.note}”</p>}
                </div>
                <p className="shrink-0 font-mono text-sm">{cedis(line.lineTotal)}</p>
              </li>
            ))}
            {(order.discount > 0 || order.deliveryFee > 0) && (
              <PanelLine label="Subtotal" value={cedis(order.subtotal)} />
            )}
            {order.discount > 0 && (
              <PanelLine label="Discount" value={`-${cedis(order.discount)}`} />
            )}
            {order.deliveryFee > 0 && (
              <PanelLine
                label={
                  order.deliveryFeeCollectedBy === 'RIDER'
                    ? 'Delivery fee (kept by the rider)'
                    : 'Delivery fee'
                }
                value={cedis(order.deliveryFee)}
              />
            )}
            <PanelLine strong label="Total" value={cedis(order.total)} />
          </TileRows>
        </Tile>

        <Tile title="Payment" className={narrow ? wide : 'col-span-2 sm:col-span-1'}>
          <div className="flex justify-center">
            <Gauge
              label="Paid"
              value={paidShare}
              detail={`${cedis(order.amountPaid)} of ${cedis(order.amountDue)}`}
              thresholds={[
                { from: 0, tone: 'warning', label: settled ? 'Settled' : 'Still owed' },
                { from: 100, tone: 'success', label: 'Paid in full' },
              ]}
            />
          </div>
          {!settled && stillOwed > 0 && (
            <p className="text-center text-sm text-warning">{cedis(stillOwed)} still owed</p>
          )}
        </Tile>

        <CustomerTile order={order} className={narrow ? wide : 'col-span-2 sm:col-span-1'} />

        <Tile title="What happened" className="col-span-2 lg:col-span-4">
          <OrderTimeline order={order} />
        </Tile>
      </Bento>

      {dialog === 'refund' && <RecordRefundDialog order={order} onClose={() => setDialog(null)} />}
      {dialog === 'discount' && <DiscountDialog order={order} onClose={() => setDialog(null)} />}
    </div>
  );
}

function CustomerTile({ order, className }: { order: OrderDetail; className: string }) {
  const name = order.customerName ?? (order.customerPhone ? phoneWords(order.customerPhone) : null);
  const extra = [
    order.customerName && order.customerPhone && phoneWords(order.customerPhone),
    order.deliveryAddress && `Deliver to ${order.deliveryAddress}`,
    order.externalReference && `${SOURCE_WORDS[order.source]} order ${order.externalReference}`,
  ].filter(Boolean);
  return (
    <Tile
      title="Customer"
      className={className}
      {...(order.customerId
        ? { to: `/customers/${order.customerId}`, toLabel: 'Open the customer' }
        : {})}
    >
      {name ? (
        <div className="flex items-center gap-3">
          <Avatar name={order.customerName ?? 'Customer'} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{name}</span>
            {extra.map((line) => (
              <span key={String(line)} className="truncate text-xs text-muted-foreground">
                {line}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Walk-in: no number was taken.</p>
      )}
      {order.note && (
        <p className="rounded-(--radius-control) bg-muted/60 px-3 py-2 text-sm">“{order.note}”</p>
      )}
    </Tile>
  );
}

const LINK_TONES = { green: 'success', red: 'danger', amber: 'neutral', blue: 'neutral' } as const;

/** The order's whole story in one feed: status changes, payments, links and refunds. */
function OrderTimeline({ order }: { order: OrderDetail }) {
  const now = useNow();
  const events: TimelineEvent[] = [
    ...order.history.map((event, index) => ({
      id: `history-${index}`,
      at: event.at,
      title: STATUS_WORDS[event.to],
      ...(event.by ? { actor: event.by } : {}),
      tone: event.to === 'CANCELLED' ? ('danger' as const) : ('neutral' as const),
    })),
    ...order.payments.map((payment) => ({
      id: `payment-${payment.id}`,
      at: payment.at,
      title: `Paid ${cedis(payment.amount)}, ${METHOD_WORDS[payment.method].toLowerCase()}${payment.status !== 'CONFIRMED' ? ` (${payment.status.toLowerCase()})` : ''}`,
      ...(payment.by ? { actor: payment.by } : {}),
      ...(payment.tendered !== null && payment.tendered > payment.amount
        ? {
            meta: `Handed ${cedis(payment.tendered)}, change ${cedis(payment.tendered - payment.amount)}`,
          }
        : {}),
      tone: payment.status === 'CONFIRMED' ? ('success' as const) : ('neutral' as const),
    })),
    ...order.links.map((link) => {
      const words = linkWords(link);
      return {
        id: `link-${link.id}`,
        at: link.at,
        title: words.text,
        meta: cedis(link.amount),
        tone: LINK_TONES[words.tone],
      };
    }),
    ...order.refunds.map((refund) => ({
      id: `refund-${refund.id}`,
      at: refund.at,
      title: `Refund given: ${cedis(refund.amount)}, ${METHOD_WORDS[refund.method].toLowerCase()}`,
      ...(refund.by ? { actor: refund.by } : {}),
      meta: refund.reason,
      tone: 'danger' as const,
    })),
  ];
  return (
    <Timeline
      events={events}
      now={now}
      label={`What happened to order ${order.displayNumber}`}
      timeZone="Africa/Accra"
      locale="en-GB"
    />
  );
}
