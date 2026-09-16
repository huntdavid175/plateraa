import {
  EXPENSE_CATEGORIES,
  pesewas,
  priceOrder,
  type Discount,
  type ExpenseCategory,
} from '@plateraa/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ulid } from 'ulid';
import { recordPayout, recordRefund, refreshMoney, setDiscount, type Drawer } from '../lib/manager';
import { amountText, cedis, parseAmount } from '../lib/money';
import type { OrderDetail } from '../lib/orders';
import { EXPENSE_WORDS, REFUND_METHOD_WORDS } from '../lib/words';
import { Button, ErrorNote, FieldLabel, PillFilter, TextInput } from '../ui/controls';
import { Dialog } from '../ui/Dialog';

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex gap-2">{children}</div>;
}

function MoneyField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted">
          GH₵
        </span>
        <TextInput
          id={id}
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          className="pl-14 font-mono"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}

/** Money handed back to a customer, recorded after it's given. It doesn't touch the drawer. */
export function RecordRefundDialog({
  order,
  onClose,
}: {
  order: { id: string; displayNumber: string; status: string; refundOwed: number };
  onClose: () => void;
}) {
  const [refundId] = useState(() => ulid());
  const [text, setText] = useState(amountText(order.refundOwed));
  const [method, setMethod] = useState<'CASH' | 'LINK'>('CASH');
  const [reason, setReason] = useState(
    order.status === 'CANCELLED' ? 'Order cancelled' : 'Paid more than the order cost',
  );
  const amount = parseAmount(text);
  const problem =
    amount === null || amount === 0
      ? 'Type the amount you gave back.'
      : amount > order.refundOwed
        ? `Only ${cedis(order.refundOwed)} is owed back.`
        : reason.trim().length < 2
          ? 'Say why the money went back.'
          : null;

  const saving = useMutation({
    meta: { ok: 'Refund recorded' },
    mutationFn: () =>
      recordRefund(order.id, { refundId, amount: amount!, method, reason: reason.trim() }),
    onSuccess: () => {
      refreshMoney();
      onClose();
    },
  });

  return (
    <Dialog title={`Refund on order ${order.displayNumber}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <p className="text-sm text-muted">
          Give the money back first, from outside the drawer. Then record it here.
        </p>
        <MoneyField id="refund-amount" label="Amount given back" value={text} onChange={setText} />
        <div>
          <FieldLabel>How it went back</FieldLabel>
          <PillFilter
            label="How it went back"
            options={[
              { value: 'CASH', label: REFUND_METHOD_WORDS.CASH },
              { value: 'LINK', label: REFUND_METHOD_WORDS.LINK },
            ]}
            value={method}
            onChange={setMethod}
          />
        </div>
        <div>
          <FieldLabel htmlFor="refund-reason">Why</FieldLabel>
          <TextInput
            id="refund-reason"
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        {saving.error && <ErrorNote>{saving.error.message}</ErrorNote>}
        {problem && text !== '' && <p className="text-xs text-muted">{problem}</p>}
        <Actions>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" full disabled={!!problem} busy={saving.isPending}>
            Record refund
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}

/** Takes money off an unpaid order, by percent or by amount; the server re-prices it. */
export function DiscountDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const [kind, setKind] = useState<'percent' | 'amount'>(
    order.discount > 0 && order.discountBps === null ? 'amount' : 'percent',
  );
  const [percentText, setPercentText] = useState(
    order.discountBps !== null ? String(order.discountBps / 100) : '',
  );
  const [amountValue, setAmountValue] = useState(
    order.discount > 0 && order.discountBps === null ? amountText(order.discount) : '',
  );

  const percent = /^\d{1,3}$/.test(percentText.trim()) ? Number(percentText) : null;
  const amount = parseAmount(amountValue);
  const discount: Discount | null =
    kind === 'percent'
      ? percent && percent <= 100
        ? { kind: 'percent', bps: percent * 100 }
        : null
      : amount
        ? { kind: 'amount', amount: pesewas(amount) }
        : null;

  // The same pricing the server and the tablet use, so the new total shown is the one saved.
  const preview = discount
    ? priceOrder({
        lines: order.items.map((line) => ({
          unitPrice: pesewas(line.unitPrice),
          quantity: line.quantity,
          modifiers: line.modifiers.map((m) => ({
            unitPriceDelta: pesewas(m.unitPriceDelta),
            quantity: m.quantity,
          })),
        })),
        discount,
        deliveryFee: pesewas(order.deliveryFee),
      })
    : null;
  const belowPaid = preview !== null && preview.total < order.amountPaid;

  const saving = useMutation({
    meta: { ok: 'Discount saved' },
    mutationFn: (body: Parameters<typeof setDiscount>[1]) => setDiscount(order.id, body),
    onSuccess: () => {
      refreshMoney();
      onClose();
    },
  });

  return (
    <Dialog title={`Discount on order ${order.displayNumber}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (discount && !belowPaid)
            saving.mutate(
              discount.kind === 'percent' ? discount : { kind: 'amount', amount: discount.amount },
            );
        }}
      >
        <PillFilter
          label="Discount by"
          options={[
            { value: 'percent', label: 'Percent off' },
            { value: 'amount', label: 'Amount off' },
          ]}
          value={kind}
          onChange={setKind}
        />
        {kind === 'percent' ? (
          <div>
            <FieldLabel htmlFor="discount-percent">Percent off</FieldLabel>
            <div className="relative">
              <TextInput
                id="discount-percent"
                inputMode="numeric"
                autoFocus
                className="pr-10 font-mono"
                value={percentText}
                onChange={(event) => setPercentText(event.target.value)}
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">
                %
              </span>
            </div>
          </div>
        ) : (
          <MoneyField
            id="discount-amount"
            label="Amount off"
            value={amountValue}
            onChange={setAmountValue}
          />
        )}
        <div className="rounded-xl bg-tile px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Now</span>
            <span className="font-mono">{cedis(order.total)}</span>
          </div>
          <div className="mt-1 flex justify-between font-semibold">
            <span>New total</span>
            <span className="font-mono">{preview ? cedis(preview.total) : '—'}</span>
          </div>
        </div>
        {belowPaid && (
          <ErrorNote>
            {cedis(order.amountPaid)} is already paid, so the total can’t go below that.
          </ErrorNote>
        )}
        {saving.error && <ErrorNote>{saving.error.message}</ErrorNote>}
        <Actions>
          {order.discount > 0 ? (
            <Button
              variant="ghost"
              busy={saving.isPending && saving.variables?.kind === 'none'}
              onClick={() => saving.mutate({ kind: 'none' })}
            >
              Remove discount
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            full
            disabled={!discount || belowPaid}
            busy={saving.isPending && saving.variables?.kind !== 'none'}
          >
            Apply discount
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}

/** Cash paid out of a tablet's open drawer, booked as an expense for today. */
export function PayoutDialog({ drawer, onClose }: { drawer: Drawer; onClose: () => void }) {
  const [payoutId] = useState(() => ulid());
  const [text, setText] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('INGREDIENTS');
  const [note, setNote] = useState('');
  const amount = parseAmount(text);
  const tooMuch = amount !== null && drawer.expectedCash !== null && amount > drawer.expectedCash;

  const saving = useMutation({
    mutationFn: () =>
      recordPayout(drawer.shiftId, {
        payoutId,
        amount: amount!,
        category,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      refreshMoney();
      onClose();
    },
  });

  return (
    <Dialog title={`Payout from ${drawer.deviceName}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (amount && !tooMuch) saving.mutate();
        }}
      >
        <p className="text-sm text-muted">
          For cash already taken out of this drawer to pay for something. It counts as money out
          today, and the drawer expects that much less at close.
        </p>
        <MoneyField id="payout-amount" label="Amount paid out" value={text} onChange={setText} />
        <div>
          <FieldLabel htmlFor="payout-category">What for</FieldLabel>
          <select
            id="payout-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-text outline-none focus:border-brand"
          >
            {EXPENSE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {EXPENSE_WORDS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="payout-note">Note (optional)</FieldLabel>
          <TextInput
            id="payout-note"
            value={note}
            maxLength={200}
            placeholder="e.g. Gas refill"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {tooMuch && drawer.expectedCash !== null && (
          <ErrorNote>Only {cedis(drawer.expectedCash)} should be in that drawer.</ErrorNote>
        )}
        {saving.error && <ErrorNote>{saving.error.message}</ErrorNote>}
        <Actions>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" full disabled={!amount || tooMuch} busy={saving.isPending}>
            Record payout
          </Button>
        </Actions>
      </form>
    </Dialog>
  );
}
