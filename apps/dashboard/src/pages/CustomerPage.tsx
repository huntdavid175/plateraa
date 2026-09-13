import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import {
  fetchCustomer,
  refreshCustomers,
  saveCustomer,
  type CustomerDetail,
} from '../lib/customers';
import { cedis, shortDate } from '../lib/money';
import { orderLine, paymentState, type BackTo } from '../lib/orders';
import { useSession } from '../lib/session';
import { SOURCE_WORDS, phoneWords } from '../lib/words';
import { useMe } from '../shell/Shell';
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  FieldLabel,
  Spinner,
  Tag,
  TextInput,
  cx,
} from '../ui/controls';
import { Dialog } from '../ui/Dialog';

/** One customer: what they've ordered, and the name and notes the tablet shows for them. */
export function CustomerPage() {
  const { customerId = '' } = useParams();
  const { tenantId } = useSession();
  const location = useLocation();
  const back = (location.state as BackTo | null) ?? { back: '/customers', label: 'Customers' };
  const customer = useQuery({
    queryKey: ['customer', tenantId, customerId],
    queryFn: () => fetchCustomer(customerId),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
      <Link
        to={back.back}
        className="mb-5 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text"
      >
        ← {back.label}
      </Link>
      {customer.isPending && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {customer.isError && <ErrorNote>{customer.error.message}</ErrorNote>}
      {customer.data && <CustomerBody customer={customer.data} />}
    </div>
  );
}

function CustomerBody({ customer }: { customer: CustomerDetail }) {
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const seesMoney = me.capabilities.includes('reports.revenue.view');
  const canEdit = me.capabilities.includes('customers.manage');
  const title = customer.name ?? phoneWords(customer.phone);
  const back: BackTo = { back: `/customers/${customer.id}`, label: title };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold">{title}</h1>
        {customer.name && (
          <p className="mt-0.5 font-mono text-sm text-muted">{phoneWords(customer.phone)}</p>
        )}
      </div>

      <div className={cx('mb-6 grid gap-3', seesMoney ? 'grid-cols-3' : 'grid-cols-2')}>
        <Stat label="Orders" value={String(customer.orders)} />
        {seesMoney && <Stat label="Spent" value={cedis(customer.spent ?? 0)} />}
        <Stat
          label="Last order"
          value={customer.lastOrderOn ? shortDate(customer.lastOrderOn) : '—'}
          sub={customer.firstOrderOn ? `First on ${shortDate(customer.firstOrderOn)}` : undefined}
        />
      </div>

      <Card className="mb-4 overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Details</h2>
          {canEdit && (
            <Button variant="secondary" small onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
        <div className="space-y-3 px-5 py-4">
          <Pair label="Name" value={customer.name ?? '—'} />
          <Pair label="Phone" value={phoneWords(customer.phone)} />
          <Pair label="Notes" value={customer.notes ?? '—'} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Their orders</h2>
        </div>
        {customer.recentOrders.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-muted">No orders yet.</p>
        )}
        {customer.recentOrders.map((order) => {
          const state = paymentState(order);
          return (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              state={back}
              className="flex items-center gap-4 border-b border-border px-5 py-3.5 transition-colors last:border-b-0 hover:bg-tile/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">{order.displayNumber}</span>
                  <span className="text-xs text-muted">{shortDate(order.businessDate)}</span>
                  <Tag>{SOURCE_WORDS[order.source]}</Tag>
                </div>
                <p className="mt-0.5 truncate text-sm">{orderLine(order.items)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm font-semibold">{cedis(order.total)}</p>
                <div className="mt-0.5">
                  <Badge tone={state.tone}>{state.label}</Badge>
                </div>
              </div>
            </Link>
          );
        })}
      </Card>
      {customer.recentOrders.length > 0 && customer.recentOrders.length < customer.orders && (
        <p className="mt-3 text-center text-xs text-muted">
          Showing their latest {customer.recentOrders.length} orders.
        </p>
      )}

      {editing && <EditCustomerDialog customer={customer} onClose={() => setEditing(false)} />}
    </>
  );
}

function EditCustomerDialog({
  customer,
  onClose,
}: {
  customer: CustomerDetail;
  onClose: () => void;
}) {
  const [name, setName] = useState(customer.name ?? '');
  const [notes, setNotes] = useState(customer.notes ?? '');
  const saving = useMutation({
    mutationFn: () => saveCustomer(customer.id, { name: name.trim(), notes: notes.trim() }),
    onSuccess: () => {
      refreshCustomers();
      onClose();
    },
  });

  return (
    <Dialog title="Customer details" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          saving.mutate();
        }}
      >
        <div>
          <FieldLabel htmlFor="customer-name">Name</FieldLabel>
          <TextInput
            id="customer-name"
            maxLength={80}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="customer-notes">Notes</FieldLabel>
          <textarea
            id="customer-notes"
            maxLength={300}
            rows={3}
            placeholder="e.g. Gate is on the left, call on arrival"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-brand"
          />
        </div>
        <p className="text-xs text-muted">
          The number can’t change: it’s how the tablet knows them. Tablets get these at their next
          sync.
        </p>
        {saving.error && <ErrorNote>{saving.error.message}</ErrorNote>}
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" full busy={saving.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="mb-1 text-xs text-muted">{label}</p>
      <p className="font-mono text-lg font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm whitespace-pre-line">{value}</span>
    </div>
  );
}
