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
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Input } from '@/components/arc/input/input';
import { RadioGroup } from '@/components/arc/radio-group/radio-group';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Select } from '@/components/arc/select/select';
import { CediInput, PlainField } from '@/components/app/money-field';
import { recordPayout, recordRefund, refreshMoney, setDiscount, type Drawer } from '../lib/manager';
import { cedis } from '../lib/money';
import type { OrderDetail } from '../lib/orders';
import { EXPENSE_WORDS, REFUND_METHOD_WORDS } from '../lib/words';

/** A money dialog: open while it's shown, closed by Cancel, Escape or a tap outside. */
function MoneyDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={title} description={description}>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
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
  const [amount, setAmount] = useState<number | null>(order.refundOwed);
  const [method, setMethod] = useState<'CASH' | 'LINK'>('CASH');
  const [reason, setReason] = useState(
    order.status === 'CANCELLED' ? 'Order cancelled' : 'Paid more than the order cost',
  );
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
    <MoneyDialog
      title={`Refund on order ${order.displayNumber}`}
      description="Give the money back first, from outside the drawer. Then record it here."
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <CediInput
          label="Amount given back"
          value={amount}
          onChange={setAmount}
          max={order.refundOwed}
          quickAdd={[]}
          description={problem && amount !== null ? problem : undefined}
        />
        <RadioGroup
          label="How it went back"
          value={method}
          onValueChange={(value) => setMethod(value as 'CASH' | 'LINK')}
          options={[
            { value: 'CASH', label: REFUND_METHOD_WORDS.CASH },
            { value: 'LINK', label: REFUND_METHOD_WORDS.LINK },
          ]}
        />
        <Input
          label="Why"
          value={reason}
          maxLength={200}
          onChange={(event) => setReason(event.target.value)}
        />
        {saving.error && (
          <Alert tone="danger" title="Couldn’t record the refund">
            {saving.error.message}
          </Alert>
        )}
        <Actions>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!!problem} loading={saving.isPending}>
            Record refund
          </Button>
        </Actions>
      </form>
    </MoneyDialog>
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
  const [amount, setAmount] = useState<number | null>(
    order.discount > 0 && order.discountBps === null ? order.discount : null,
  );

  const percent = /^\d{1,3}$/.test(percentText.trim()) ? Number(percentText) : null;
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
    <MoneyDialog title={`Discount on order ${order.displayNumber}`} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (discount && !belowPaid)
            saving.mutate(
              discount.kind === 'percent' ? discount : { kind: 'amount', amount: discount.amount },
            );
        }}
      >
        <SegmentedControl
          label="Discount by"
          value={kind}
          onValueChange={(value) => setKind(value as 'percent' | 'amount')}
          options={[
            { value: 'percent', label: 'Percent off' },
            { value: 'amount', label: 'Amount off' },
          ]}
        />
        {kind === 'percent' ? (
          <PlainField
            label="Percent off"
            inputMode="numeric"
            placeholder="For example: 10"
            value={percentText}
            onChange={setPercentText}
          />
        ) : (
          <CediInput label="Amount off" value={amount} onChange={setAmount} quickAdd={[1, 5, 10]} />
        )}
        <dl className="flex flex-col divide-y rounded-(--radius-panel) border text-sm">
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-text-secondary">Now</dt>
            <dd className="font-mono">{cedis(order.total)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="font-medium">New total</dt>
            <dd className="font-mono">{preview ? cedis(preview.total) : 'Type a discount'}</dd>
          </div>
        </dl>
        {belowPaid && (
          <Alert tone="warning" title="That’s more than is left to pay">
            {cedis(order.amountPaid)} is already paid, so the total can’t go below that.
          </Alert>
        )}
        {saving.error && (
          <Alert tone="danger" title="Couldn’t save the discount">
            {saving.error.message}
          </Alert>
        )}
        <Actions>
          {order.discount > 0 ? (
            <Button
              variant="ghost"
              loading={saving.isPending && saving.variables?.kind === 'none'}
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
            disabled={!discount || belowPaid}
            loading={saving.isPending && saving.variables?.kind !== 'none'}
          >
            Apply discount
          </Button>
        </Actions>
      </form>
    </MoneyDialog>
  );
}

/** Cash paid out of a tablet's open drawer, booked as an expense for today. */
export function PayoutDialog({ drawer, onClose }: { drawer: Drawer; onClose: () => void }) {
  const [payoutId] = useState(() => ulid());
  const [amount, setAmount] = useState<number | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>('INGREDIENTS');
  const [note, setNote] = useState('');
  const tooMuch = amount !== null && drawer.expectedCash !== null && amount > drawer.expectedCash;

  const saving = useMutation({
    meta: { ok: 'Payout recorded' },
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
    <MoneyDialog
      title={`Payout from ${drawer.deviceName}`}
      description="For cash already taken out of this drawer to pay for something. It counts as money out today, and the drawer expects that much less at close."
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (amount && !tooMuch) saving.mutate();
        }}
      >
        <CediInput label="Amount paid out" value={amount} onChange={setAmount} />
        <Select
          label="What for"
          value={category}
          onValueChange={(value) => setCategory(value as ExpenseCategory)}
          options={EXPENSE_CATEGORIES.map((value) => ({
            value,
            label: EXPENSE_WORDS[value],
          }))}
        />
        <Input
          label="Note"
          description="Optional."
          value={note}
          maxLength={200}
          placeholder="For example: gas refill"
          onChange={(event) => setNote(event.target.value)}
        />
        {tooMuch && drawer.expectedCash !== null && (
          <Alert tone="warning" title="More than the drawer holds">
            Only {cedis(drawer.expectedCash)} should be in that drawer.
          </Alert>
        )}
        {saving.error && (
          <Alert tone="danger" title="Couldn’t record the payout">
            {saving.error.message}
          </Alert>
        )}
        <Actions>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!amount || tooMuch} loading={saving.isPending}>
            Record payout
          </Button>
        </Actions>
      </form>
    </MoneyDialog>
  );
}
