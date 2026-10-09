import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Panel, PanelRows } from '@/components/app/panel';
import { StatusBadge } from '@/components/app/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { cedis, clock, longDate } from '../lib/money';
import { fetchOrder, paymentState, type BackTo, type OrderDetail } from '../lib/orders';
import { useSession } from '../lib/session';
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

export function OrderPage() {
  const { orderId = '' } = useParams();
  const { tenantId } = useSession();
  const location = useLocation();
  const back = (location.state as BackTo | null) ?? { back: '/orders', label: 'Orders' };

  const order = useQuery({
    queryKey: ['order', tenantId, orderId],
    queryFn: () => fetchOrder(orderId),
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <Link
        to={back.back}
        className="inline-flex items-center gap-2 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
        {back.label}
      </Link>
      {order.isPending && (
        <div className="flex flex-col gap-6" aria-busy="true">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-56 w-full rounded-(--radius-surface)" />
          <Skeleton className="h-40 w-full rounded-(--radius-surface)" />
        </div>
      )}
      {order.isError && (
        <Alert tone="danger" title="Couldn’t load this order">
          <div className="flex flex-col items-start gap-3">
            <p>{order.error.message}</p>
            <Button variant="secondary" size="sm" onClick={() => order.refetch()}>
              Try again
            </Button>
          </div>
        </Alert>
      )}
      {order.data && <OrderBody order={order.data} />}
    </div>
  );
}

function OrderBody({ order }: { order: OrderDetail }) {
  const me = useMe();
  const [dialog, setDialog] = useState<'refund' | 'discount' | null>(null);
  const stillOwed = Math.max(0, order.amountDue - order.amountPaid);
  const settled = order.status === 'CANCELLED' || order.status === 'REFUNDED';
  const canDiscount = me.capabilities.includes('discounts.apply') && !settled && stillOwed > 0;

  return (
    <>
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

      <Panel title="Items">
        <PanelRows>
          {order.items.map((line, index) => (
            <li key={index} className="flex items-start justify-between gap-4 px-5 py-3.5">
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
            <Total label="Subtotal" value={cedis(order.subtotal)} />
          )}
          {order.discount > 0 && <Total label="Discount" value={`-${cedis(order.discount)}`} />}
          {order.deliveryFee > 0 && (
            <Total
              label={
                order.deliveryFeeCollectedBy === 'RIDER'
                  ? 'Delivery fee (kept by the rider)'
                  : 'Delivery fee'
              }
              value={cedis(order.deliveryFee)}
            />
          )}
          <li className="flex items-center justify-between gap-4 bg-muted/60 px-5 py-4">
            <span className="font-medium">Total</span>
            <span className="font-mono text-lg">{cedis(order.total)}</span>
          </li>
        </PanelRows>
      </Panel>

      <Panel title="Payment">
        <PanelRows>
          <Total label="To collect" value={cedis(order.amountDue)} />
          <Total label="Paid" value={cedis(order.amountPaid)} />
          {!settled && stillOwed > 0 && (
            <Total label="Still owed" value={cedis(stillOwed)} tone="text-warning" />
          )}
          {order.payments.map((payment) => (
            <Entry
              key={payment.id}
              title={
                <>
                  {METHOD_WORDS[payment.method]}
                  {payment.status !== 'CONFIRMED' && (
                    <span className="text-muted-foreground"> ({payment.status.toLowerCase()})</span>
                  )}
                </>
              }
              detail={[
                clock(payment.at),
                payment.by && `by ${payment.by}`,
                payment.tendered !== null && payment.tendered > payment.amount
                  ? `handed ${cedis(payment.tendered)}, change ${cedis(payment.tendered - payment.amount)}`
                  : null,
              ]}
              amount={cedis(payment.amount)}
            />
          ))}
          {order.refunds.map((refund) => (
            <Entry
              key={refund.id}
              title={`Refund given, ${METHOD_WORDS[refund.method].toLowerCase()}`}
              detail={[clock(refund.at), refund.by && `by ${refund.by}`, refund.reason]}
              amount={`-${cedis(refund.amount)}`}
              tone="text-danger"
            />
          ))}
          {order.links.map((link) => {
            const words = linkWords(link);
            return (
              <Entry
                key={link.id}
                title={words.text}
                tone={LINK_TONES[words.tone]}
                detail={[`asked for at ${clock(link.at)}`]}
                amount={cedis(link.amount)}
              />
            );
          })}
        </PanelRows>
      </Panel>

      {(order.customerPhone ||
        order.customerName ||
        order.deliveryAddress ||
        order.note ||
        order.externalReference) && (
        <Panel
          title="Customer and notes"
          action={
            order.customerId && (
              <Link
                to={`/customers/${order.customerId}`}
                state={{ back: `/orders/${order.id}`, label: `Order ${order.displayNumber}` }}
                className="text-sm font-medium text-accent-strong"
              >
                All their orders
              </Link>
            )
          }
        >
          <dl className="flex flex-col divide-y border-t">
            {order.customerName && <Pair label="Name" value={order.customerName} />}
            {order.customerPhone && <Pair label="Phone" value={phoneWords(order.customerPhone)} />}
            {order.deliveryAddress && <Pair label="Deliver to" value={order.deliveryAddress} />}
            {order.externalReference && (
              <Pair label={`${SOURCE_WORDS[order.source]} order`} value={order.externalReference} />
            )}
            {order.note && <Pair label="Note" value={order.note} />}
          </dl>
        </Panel>
      )}

      {order.history.length > 0 && (
        <Panel title="History">
          <ol className="flex flex-col divide-y border-t">
            {order.history.map((event, index) => (
              <li key={index} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span>{STATUS_WORDS[event.to]}</span>
                <span className="text-muted-foreground">
                  {clock(event.at)}
                  {event.by ? `, ${event.by}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {dialog === 'refund' && <RecordRefundDialog order={order} onClose={() => setDialog(null)} />}
      {dialog === 'discount' && <DiscountDialog order={order} onClose={() => setDialog(null)} />}
    </>
  );
}

const LINK_TONES: Record<string, string | undefined> = {
  green: 'text-success',
  amber: 'text-warning',
  red: 'text-danger',
  blue: 'text-info',
};

function Total({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className={cn('font-mono', tone)}>{value}</span>
    </li>
  );
}

/** A payment, refund or link: what it was, when and by whom, and how much. */
function Entry({
  title,
  detail,
  amount,
  tone,
}: {
  title: ReactNode;
  detail: (string | null | false | undefined)[];
  amount: string;
  tone?: string | undefined;
}) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="flex min-w-0 flex-col">
        <p className={cn('text-sm', tone)}>{title}</p>
        <p className="text-xs text-muted-foreground">{detail.filter(Boolean).join(', ')}</p>
      </div>
      <p className={cn('shrink-0 font-mono text-sm', tone)}>{amount}</p>
    </li>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className="text-right text-sm">{value}</dd>
    </div>
  );
}
