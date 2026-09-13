'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, DarkToggle } from '../../../../components/ui';
import type { TrackedOrder } from '../../../../lib/api';
import { ghs } from '../../../../lib/money';
import { phoneWords } from '../../../../lib/words';
import { checkOrder, payOrder, refreshOrder } from '../../../actions';

/** How often an open order is looked at again. */
const EVERY_MS = 15_000;

const open = (order: TrackedOrder) =>
  order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && order.status !== 'REFUNDED';

/** Not paid yet, and it has to be before the kitchen starts. */
const waitingForPayment = (order: TrackedOrder) =>
  !order.payOnCollection &&
  order.amountPaid < order.amountDue &&
  (order.status === 'NEW' || order.status === 'CONFIRMED');

/** A payment page is out and not paid yet: worth asking Moolre about. */
const paymentOut = (order: TrackedOrder) =>
  order.linkStatus === 'SENT' && order.amountPaid < order.amountDue;

type Step = { key: string; label: string };

function stepsOf(order: TrackedOrder): Step[] {
  const steps: Step[] = [
    order.payOnCollection
      ? { key: 'received', label: 'Order received' }
      : { key: 'paid', label: 'Paid' },
  ];
  if (order.acceptsFirst) steps.push({ key: 'accepted', label: 'Accepted by the kitchen' });
  steps.push({ key: 'preparing', label: 'Preparing' });
  if (order.type === 'DELIVERY') {
    steps.push({ key: 'out', label: 'Out for delivery' }, { key: 'done', label: 'Delivered' });
  } else {
    steps.push({ key: 'ready', label: 'Ready to collect' }, { key: 'done', label: 'Collected' });
  }
  return steps;
}

/** The furthest step the order has reached. */
function reachedOf(order: TrackedOrder, steps: Step[]): string {
  switch (order.status) {
    case 'CONFIRMED':
      return order.acceptsFirst ? 'accepted' : steps[0]!.key;
    case 'PREPARING':
      return 'preparing';
    case 'READY':
      return order.type === 'DELIVERY' ? 'preparing' : 'ready';
    case 'OUT_FOR_DELIVERY':
      return 'out';
    case 'COMPLETED':
      return 'done';
    default:
      return steps[0]!.key;
  }
}

/**
 * The customer's page for one order (the user's design). Coming back from the payment page, it
 * asks Moolre about the payment at once; after that it looks again every 15 seconds while the
 * order is open.
 */
export function OrderStatus({ token, initial }: { token: string; initial: TrackedOrder }) {
  const [order, setOrder] = useState(initial);
  const [checking, setChecking] = useState(paymentOut(initial));
  const [paying, setPaying] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!paymentOut(initial)) return;
    let live = true;
    void checkOrder(token).then((result) => {
      if (!live) return;
      if (result.ok) setOrder(result.order);
      setChecking(false);
    });
    return () => {
      live = false;
    };
  }, [token, initial]);

  const stillOpen = open(order);
  const askMoolre = paymentOut(order);
  useEffect(() => {
    if (!stillOpen) return;
    const timer = setInterval(() => {
      void (askMoolre ? checkOrder(token) : refreshOrder(token)).then((result) => {
        if (result.ok) setOrder(result.order);
      });
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [token, stillOpen, askMoolre]);

  const pay = async () => {
    setPaying(true);
    setProblem(null);
    const result = await payOrder(token);
    if (!result.ok) {
      setProblem(result.message);
      setPaying(false);
      return;
    }
    if (result.payUrl) {
      window.location.assign(result.payUrl);
      return;
    }
    if (result.payProblem) setProblem(result.payProblem);
    const fresh = await refreshOrder(token);
    if (fresh.ok) setOrder(fresh.order);
    setPaying(false);
  };

  const steps = stepsOf(order);
  const reached = steps.findIndex((step) => step.key === reachedOf(order, steps));
  const cancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';
  const lapsed = order.linkStatus === 'FAILED' || order.linkStatus === 'EXPIRED';
  const owed = order.amountDue - order.amountPaid;

  return (
    <div className="mx-auto max-w-[430px] px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href={`/${order.storeSlug}`}
          className="flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft />
          Menu
        </Link>
        <DarkToggle className="hover:bg-tile" />
      </div>

      <div className="mb-8 text-center">
        <p className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
          Order number
        </p>
        <p className="font-mono text-5xl font-bold text-brand-ink">{order.number}</p>
        <p className="mt-2 text-sm text-muted">
          {order.storeName} · {order.type === 'DELIVERY' ? 'Delivery' : 'Pickup'}
        </p>
      </div>

      {checking ? (
        <div className="mb-6 rounded-xl border border-border bg-card p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 animate-pulse items-center justify-center rounded-full bg-brand-tint">
            <span className="text-xl" aria-hidden="true">
              💳
            </span>
          </div>
          <p className="font-semibold text-ink">Checking your payment…</p>
          <p className="mt-1 text-sm text-muted">This usually takes a few seconds.</p>
        </div>
      ) : cancelled ? (
        <div className="mb-6 rounded-xl border border-red/30 bg-red-bg p-5 text-center">
          <p className="font-semibold text-red">Order cancelled by the store</p>
          {order.amountPaid > 0 && (
            <p className="mt-1 text-sm text-red">The store will contact you about your money.</p>
          )}
        </div>
      ) : waitingForPayment(order) ? (
        <div className="mb-6 rounded-xl border border-brand/30 bg-brand-tint p-5 text-center">
          <p className="font-semibold text-brand-ink">
            {lapsed ? 'Your payment didn’t go through' : 'Waiting for payment'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {lapsed
              ? 'It was declined or took too long. Nothing was charged.'
              : 'Your order is held for you. It goes to the kitchen once it’s paid.'}
          </p>
          <button
            type="button"
            onClick={() => void pay()}
            disabled={paying}
            className="mt-3 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-on-brand disabled:opacity-50"
          >
            {paying ? (
              'Opening the payment page…'
            ) : (
              <>
                {lapsed ? 'Try paying again' : 'Pay'} ·{' '}
                <span className="font-mono">{ghs(owed)}</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-border bg-card p-5">
          {steps.map((step, index) => {
            const done = index <= reached;
            const current = index === reached;
            return (
              <div key={step.key} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      done ? 'border-brand bg-brand text-on-brand' : 'border-border bg-tile'
                    }`}
                  >
                    {done && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M2 6L5 9L10 3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`mt-1 h-8 w-0.5 ${index < reached ? 'bg-brand' : 'bg-border'}`}
                    />
                  )}
                </div>
                <div className="pt-0.5 pb-8">
                  <p
                    className={`text-sm ${
                      current ? 'font-semibold text-ink' : done ? 'text-muted' : 'text-muted/50'
                    }`}
                  >
                    {step.label}
                  </p>
                  {order.payOnCollection && step.key === 'ready' && owed > 0 && (
                    <p className="mt-0.5 text-xs text-amber">
                      Pay <span className="font-mono">{ghs(owed)}</span> when you collect
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {problem && (
        <p className="mb-4 rounded-xl bg-red-bg px-4 py-3 text-sm text-red" role="alert">
          {problem}
        </p>
      )}

      <div className="mb-4 space-y-2 rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
          What you ordered
        </p>
        {order.lines.map((line, index) => (
          <div key={index} className="flex justify-between gap-3 text-sm">
            <span>
              {line.quantity}× {line.name}
              {line.variantName ? ` (${line.variantName})` : ''}
              {line.extras.length > 0 && (
                <span className="block text-xs text-muted">{line.extras.join(', ')}</span>
              )}
            </span>
            <span className="font-mono text-muted">{ghs(line.lineTotal)}</span>
          </div>
        ))}
        {order.deliveryFee > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Delivery</span>
            <span className="font-mono text-muted">{ghs(order.deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
          <span>Total</span>
          <span className="font-mono">{ghs(order.total)}</span>
        </div>
        {order.deliveryAddress && (
          <p className="pt-1 text-xs text-muted">Delivering to {order.deliveryAddress}</p>
        )}
      </div>

      {order.storePhone && (
        <p className="text-center text-xs text-muted">
          Questions? Call {order.storeName} on{' '}
          <a href={`tel:${order.storePhone}`} className="text-brand-ink underline">
            {phoneWords(order.storePhone)}
          </a>
        </p>
      )}
    </div>
  );
}
