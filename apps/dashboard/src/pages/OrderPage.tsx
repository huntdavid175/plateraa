import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { cedis, clock, longDate } from '../lib/money';
import { fetchOrder, paymentState, type BackTo, type OrderDetail } from '../lib/orders';
import { useSession } from '../lib/session';
import {
  METHOD_WORDS,
  REVIEW_WORDS,
  SOURCE_WORDS,
  STATUS_WORDS,
  TYPE_WORDS,
  linkWords,
  phoneWords,
} from '../lib/words';
import { useMe } from '../shell/Shell';
import { Badge, Button, Card, ErrorNote, Spinner, Tag, cx } from '../ui/controls';
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
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
      <Link
        to={back.back}
        className="mb-5 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text"
      >
        ← {back.label}
      </Link>
      {order.isPending && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {order.isError && <ErrorNote>{order.error.message}</ErrorNote>}
      {order.data && <OrderBody order={order.data} />}
    </div>
  );
}

function OrderBody({ order }: { order: OrderDetail }) {
  const me = useMe();
  const [dialog, setDialog] = useState<'refund' | 'discount' | null>(null);
  const state = paymentState(order);
  const stillOwed = Math.max(0, order.amountDue - order.amountPaid);
  const settled = order.status === 'CANCELLED' || order.status === 'REFUNDED';

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Order {order.displayNumber}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {longDate(order.businessDate)} at {clock(order.takenAt)}
            {order.takenBy ? ` · ${order.takenBy}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Tag>{SOURCE_WORDS[order.source]}</Tag>
            <Tag>{TYPE_WORDS[order.type]}</Tag>
            <Tag>{STATUS_WORDS[order.status]}</Tag>
            {order.onHold && <Tag>On hold</Tag>}
          </div>
        </div>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>

      {order.reviewReasons.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber/25 bg-amber-bg px-5 py-4 text-sm text-amber">
          <p className="font-semibold">Worth a look</p>
          {order.reviewReasons.map((reason) => (
            <p key={reason} className="mt-1">
              {REVIEW_WORDS[reason] ?? reason}
            </p>
          ))}
        </div>
      )}

      {order.status === 'CANCELLED' && order.cancelReason && (
        <p className="mb-4 rounded-xl bg-tile px-5 py-3 text-sm">
          Cancelled: <span className="text-muted">{order.cancelReason}</span>
        </p>
      )}

      {order.refundOwed > 0 && (
        <div className="mb-4 rounded-xl border border-red/20 bg-red-bg p-5 text-red">
          <p className="mb-1 text-sm font-semibold">Refund owed</p>
          <p className="text-xs">
            Give {cedis(order.refundOwed)} back to the customer, then record it here.
          </p>
          {me.capabilities.includes('refunds.record') && (
            <Button variant="danger" full className="mt-4" onClick={() => setDialog('refund')}>
              Record refund given
            </Button>
          )}
        </div>
      )}

      <Card className="mb-4 overflow-hidden">
        <CardTitle>Items</CardTitle>
        {order.items.map((line, index) => (
          <div
            key={index}
            className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5"
          >
            <div className="min-w-0">
              <p className="text-sm">
                {line.quantity > 1 && <span className="text-muted">{line.quantity} × </span>}
                {line.name}
                {line.variantName && <span className="text-muted"> ({line.variantName})</span>}
              </p>
              {line.modifiers.map((modifier) => (
                <p key={modifier.name} className="mt-0.5 text-xs text-muted">
                  + {modifier.name}
                  {modifier.quantity > 1 ? ` × ${modifier.quantity}` : ''}
                  {modifier.unitPriceDelta !== 0 ? ` (${cedis(modifier.unitPriceDelta)})` : ''}
                </p>
              ))}
              {line.note && <p className="mt-0.5 text-xs text-muted italic">“{line.note}”</p>}
            </div>
            <p className="shrink-0 font-mono text-sm">{cedis(line.lineTotal)}</p>
          </div>
        ))}
        {(order.discount > 0 || order.deliveryFee > 0) && (
          <Line label="Subtotal" value={cedis(order.subtotal)} />
        )}
        {order.discount > 0 && <Line label="Discount" value={`−${cedis(order.discount)}`} />}
        {order.deliveryFee > 0 && (
          <Line
            label={
              order.deliveryFeeCollectedBy === 'RIDER'
                ? 'Delivery fee (kept by the rider)'
                : 'Delivery fee'
            }
            value={cedis(order.deliveryFee)}
          />
        )}
        <div className="flex items-center justify-between bg-tile px-5 py-4">
          <p className="text-sm font-semibold">Total</p>
          <p className="font-mono font-semibold">{cedis(order.total)}</p>
        </div>
      </Card>

      {me.capabilities.includes('discounts.apply') && !settled && stillOwed > 0 && (
        <div className="-mt-2 mb-4 flex justify-end">
          <Button variant="secondary" small onClick={() => setDialog('discount')}>
            {order.discount > 0 ? 'Change discount' : 'Apply discount'}
          </Button>
        </div>
      )}

      <Card className="mb-4 overflow-hidden">
        <CardTitle>Payment</CardTitle>
        <div className="space-y-3 px-5 py-4">
          <Pair label="To collect" value={cedis(order.amountDue)} />
          <Pair label="Paid" value={cedis(order.amountPaid)} />
          {!settled && stillOwed > 0 && <Pair label="Still owed" value={cedis(stillOwed)} strong />}
        </div>
        {order.payments.map((payment) => (
          <div
            key={payment.id}
            className="flex items-center justify-between gap-4 border-t border-border px-5 py-3"
          >
            <div>
              <p className="text-sm">
                {METHOD_WORDS[payment.method]}
                {payment.status !== 'CONFIRMED' && (
                  <span className="text-muted"> ({payment.status.toLowerCase()})</span>
                )}
              </p>
              <p className="text-xs text-muted">
                {clock(payment.at)}
                {payment.by ? ` · ${payment.by}` : ''}
                {payment.tendered !== null && payment.tendered > payment.amount
                  ? ` · handed ${cedis(payment.tendered)}, change ${cedis(payment.tendered - payment.amount)}`
                  : ''}
              </p>
            </div>
            <p className="font-mono text-sm">{cedis(payment.amount)}</p>
          </div>
        ))}
        {order.refunds.map((refund) => (
          <div
            key={refund.id}
            className="flex items-center justify-between gap-4 border-t border-border px-5 py-3"
          >
            <div>
              <p className="text-sm">Refund given · {METHOD_WORDS[refund.method]}</p>
              <p className="text-xs text-muted">
                {clock(refund.at)}
                {refund.by ? ` · ${refund.by}` : ''} · {refund.reason}
              </p>
            </div>
            <p className="font-mono text-sm text-red">−{cedis(refund.amount)}</p>
          </div>
        ))}
        {order.links.map((link) => {
          const words = linkWords(link);
          return (
            <div key={link.id} className="border-t border-border px-5 py-3">
              <p
                className={cx(
                  'text-sm',
                  words.tone === 'green' && 'text-green',
                  words.tone === 'amber' && 'text-amber',
                  words.tone === 'red' && 'text-red',
                  words.tone === 'blue' && 'text-blue',
                )}
              >
                {words.text}
              </p>
              <p className="text-xs text-muted">
                {cedis(link.amount)} · asked for at {clock(link.at)}
              </p>
            </div>
          );
        })}
      </Card>

      {(order.customerPhone ||
        order.customerName ||
        order.deliveryAddress ||
        order.note ||
        order.externalReference) && (
        <Card className="mb-4 overflow-hidden">
          <CardTitle>Customer and notes</CardTitle>
          <div className="space-y-3 px-5 py-4">
            {order.customerName && <Pair label="Name" value={order.customerName} />}
            {order.customerPhone && <Pair label="Phone" value={phoneWords(order.customerPhone)} />}
            {order.customerId && (
              <div className="text-right">
                <Link
                  to={`/customers/${order.customerId}`}
                  state={{ back: `/orders/${order.id}`, label: `Order ${order.displayNumber}` }}
                  className="text-xs font-medium text-brand"
                >
                  All their orders →
                </Link>
              </div>
            )}
            {order.deliveryAddress && <Pair label="Deliver to" value={order.deliveryAddress} />}
            {order.externalReference && (
              <Pair label={`${SOURCE_WORDS[order.source]} order`} value={order.externalReference} />
            )}
            {order.note && <Pair label="Note" value={order.note} />}
          </div>
        </Card>
      )}

      {order.history.length > 0 && (
        <Card className="overflow-hidden">
          <CardTitle>History</CardTitle>
          <ol className="px-5 py-2">
            {order.history.map((event, index) => (
              <li key={index} className="flex items-center justify-between gap-4 py-2 text-sm">
                <span>{STATUS_WORDS[event.to]}</span>
                <span className="text-xs text-muted">
                  {clock(event.at)}
                  {event.by ? ` · ${event.by}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {dialog === 'refund' && <RecordRefundDialog order={order} onClose={() => setDialog(null)} />}
      {dialog === 'discount' && <DiscountDialog order={order} onClose={() => setDialog(null)} />}
    </>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-border px-5 py-4">
      <h2 className="text-sm font-semibold">{children}</h2>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function Pair({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-muted">{label}</span>
      <span className={cx('text-right text-sm', strong && 'font-semibold text-amber')}>
        {value}
      </span>
    </div>
  );
}
