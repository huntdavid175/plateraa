import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { Input } from '@/components/arc/input/input';
import { Textarea } from '@/components/arc/textarea/textarea';
import { OrderListRow } from '@/components/app/order-row';
import { Panel, PanelRows } from '@/components/app/panel';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchCustomer,
  refreshCustomers,
  saveCustomer,
  type CustomerDetail,
} from '../lib/customers';
import { cedis, shortDate } from '../lib/money';
import type { BackTo } from '../lib/orders';
import { useSession } from '../lib/session';
import { phoneWords } from '../lib/words';
import { useMe } from '../shell/Shell';

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <Link
        to={back.back}
        className="inline-flex items-center gap-2 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
        {back.label}
      </Link>
      {customer.isPending && (
        <div className="flex flex-col gap-6" aria-busy="true">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-24 w-full rounded-(--radius-surface)" />
          <Skeleton className="h-48 w-full rounded-(--radius-surface)" />
        </div>
      )}
      {customer.isError && (
        <Alert tone="danger" title="Couldn’t load this customer">
          {customer.error.message}
        </Alert>
      )}
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl leading-[1.1] font-medium tracking-[-0.03em]">
            {title}
          </h1>
          {customer.name && (
            <p className="font-mono text-sm text-text-secondary">{phoneWords(customer.phone)}</p>
          )}
        </div>
        {canEdit && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit details
          </Button>
        )}
      </header>

      <ul className="grid divide-y overflow-hidden rounded-(--radius-surface) border bg-card sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0">
        <Stat label="Orders" value={String(customer.orders)} />
        {seesMoney && <Stat label="Spent" value={cedis(customer.spent ?? 0)} />}
        <Stat
          label="Last order"
          value={customer.lastOrderOn ? shortDate(customer.lastOrderOn) : 'None yet'}
          note={customer.firstOrderOn ? `First on ${shortDate(customer.firstOrderOn)}` : undefined}
        />
      </ul>

      {customer.notes && (
        <Panel title="Notes">
          <p className="border-t px-5 py-4 text-sm whitespace-pre-line">{customer.notes}</p>
        </Panel>
      )}

      <Panel title="Their orders">
        {customer.recentOrders.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={24} strokeWidth={1.75} />}
            title="No orders yet"
            description="Orders taken with their number show here."
          />
        ) : (
          <PanelRows>
            {customer.recentOrders.map((order) => (
              <OrderListRow key={order.id} order={order} back={back} showDay />
            ))}
          </PanelRows>
        )}
      </Panel>
      {customer.recentOrders.length > 0 && customer.recentOrders.length < customer.orders && (
        <p className="text-sm text-muted-foreground">
          Showing their latest {customer.recentOrders.length} orders.
        </p>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        {editing && <EditCustomer customer={customer} onClose={() => setEditing(false)} />}
      </Dialog>
    </>
  );
}

function EditCustomer({ customer, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const [name, setName] = useState(customer.name ?? '');
  const [notes, setNotes] = useState(customer.notes ?? '');
  const saving = useMutation({
    mutationFn: () => saveCustomer(customer.id, { name: name.trim(), notes: notes.trim() }),
    meta: { ok: 'Customer saved' },
    onSuccess: () => {
      refreshCustomers();
      onClose();
    },
  });

  return (
    <DialogContent
      title="Customer details"
      description="The number can’t change: it’s how the tablet knows them. Tablets get these at their next sync."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          saving.mutate();
        }}
      >
        <Input
          label="Name"
          maxLength={80}
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Textarea
          label="Notes"
          maxLength={300}
          rows={3}
          placeholder="For example: the gate is on the left, call on arrival"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        {saving.error && (
          <Alert tone="danger" title="Couldn’t save">
            {saving.error.message}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving.isPending}>
            Save
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string | undefined }) {
  return (
    <li className="flex items-center justify-between gap-1 px-5 py-3 sm:flex-col sm:items-start sm:justify-start sm:py-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex flex-col items-end sm:items-start">
        <span className="font-mono text-lg sm:text-xl">{value}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </span>
    </li>
  );
}
