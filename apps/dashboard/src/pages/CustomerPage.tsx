import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { ActivityHeatmap } from '@/components/arc/activity-heatmap/activity-heatmap';
import { Alert } from '@/components/arc/alert/alert';
import { Avatar } from '@/components/arc/avatar/avatar';
import { InlineEdit } from '@/components/arc/inline-edit/inline-edit';
import { Timeline, type TimelineEvent } from '@/components/arc/timeline/timeline';
import { Bento, Cedis, Tile } from '@/components/app/bento';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchCustomer,
  refreshCustomers,
  saveCustomer,
  type CustomerDetail,
} from '../lib/customers';
import { shiftDays } from '../lib/expenses';
import { cedis, shortDate, todayHere } from '../lib/money';
import { orderLine, paymentState, type BackTo } from '../lib/orders';
import { useSession } from '../lib/session';
import { useNow } from '../lib/use-now';
import { kindWords, phoneWords } from '../lib/words';
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <Link
        to={back.back}
        className="inline-flex items-center gap-2 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
        {back.label}
      </Link>
      {customer.isPending && (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-20 w-72" />
          <Skeleton className="h-40 w-full rounded-(--radius-surface)" />
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

const TONES = { green: 'success', red: 'danger', amber: 'neutral', neutral: 'neutral' } as const;

function CustomerBody({ customer }: { customer: CustomerDetail }) {
  const me = useMe();
  const now = useNow();
  const seesMoney = me.capabilities.includes('reports.revenue.view');
  const canEdit = me.capabilities.includes('customers.manage');
  const title = customer.name ?? phoneWords(customer.phone);
  const back: BackTo = { back: `/customers/${customer.id}`, label: title };
  // A blank name or notes clears it; each saves on its own, keeping the other as it is.
  const save = async (patch: { name?: string; notes?: string }) => {
    await saveCustomer(customer.id, {
      name: patch.name ?? customer.name ?? '',
      notes: patch.notes ?? customer.notes ?? '',
    });
    refreshCustomers();
  };

  // The days they ordered over the last 12 weeks, from the orders shown here; the rest are zero
  // so the grid always spans the weeks and shows how often they come.
  const days = new Map<string, number>();
  const today = todayHere();
  for (let back = 83; back >= 0; back--) days.set(shiftDays(today, -back), 0);
  for (const order of customer.recentOrders) {
    if (days.has(order.businessDate))
      days.set(order.businessDate, days.get(order.businessDate)! + 1);
  }
  const orderedLately = [...days.values()].some((count) => count > 0);
  const events: TimelineEvent[] = customer.recentOrders.map((order) => {
    const state = paymentState(order);
    return {
      id: order.id,
      at: order.takenAt,
      title: `${order.displayNumber}, ${kindWords(order).toLowerCase()}: ${cedis(order.total)}, ${state.label.toLowerCase()}`,
      meta: shortDate(order.businessDate),
      tone: TONES[state.tone],
      detail: (
        <div className="flex flex-col items-start gap-2 text-sm">
          <span>{orderLine(order.items)}</span>
          <Link
            to={`/orders/${order.id}`}
            state={back}
            className="font-medium text-accent-strong underline-offset-2 hover:underline"
          >
            Open order {order.displayNumber}
          </Link>
        </div>
      ),
    };
  });

  return (
    <>
      <header className="flex items-center gap-4">
        <Avatar name={customer.name ?? 'Customer'} size="xl" />
        <div className="flex min-w-0 flex-col gap-1">
          {canEdit ? (
            <InlineEdit
              as="h1"
              label="Name"
              value={customer.name ?? ''}
              placeholder="Add their name"
              onSave={(name) => save({ name: name.trim() })}
              className="font-heading text-3xl"
            />
          ) : (
            <h1 className="font-heading text-3xl leading-[1.1] font-medium tracking-[-0.03em]">
              {title}
            </h1>
          )}
          <p className="font-mono text-sm text-text-secondary">{phoneWords(customer.phone)}</p>
        </div>
      </header>

      <Bento>
        <Tile title="Orders">
          <span className="font-heading text-2xl leading-none tracking-[-0.03em] tabular-nums">
            {customer.orders}
          </span>
          {customer.firstOrderOn && (
            <span className="text-xs text-muted-foreground">
              Since {shortDate(customer.firstOrderOn)}
            </span>
          )}
        </Tile>
        {seesMoney && (
          <Tile title="Spent">
            <Cedis amount={customer.spent ?? 0} />
            {customer.orders > 0 && (
              <span className="text-xs text-muted-foreground">
                {cedis(Math.round((customer.spent ?? 0) / customer.orders))} an order
              </span>
            )}
          </Tile>
        )}
        <Tile title="Last order">
          <span className="font-heading text-2xl leading-none tracking-[-0.03em]">
            {customer.lastOrderOn ? shortDate(customer.lastOrderOn) : 'None yet'}
          </span>
        </Tile>
        <Tile title="Notes" className={seesMoney ? 'col-span-1' : 'col-span-2 lg:col-span-2'}>
          {canEdit ? (
            <InlineEdit
              label="Notes"
              variant="body"
              multiline
              value={customer.notes ?? ''}
              placeholder="Add a note the tablet shows, like where the gate is"
              onSave={(notes) => save({ notes: notes.trim() })}
            />
          ) : (
            <p className="text-sm whitespace-pre-line">{customer.notes ?? 'No notes.'}</p>
          )}
        </Tile>

        {orderedLately && (
          <Tile title="When they order" className="col-span-2">
            <ActivityHeatmap
              label="Days they ordered"
              period="the last 12 weeks"
              unit={{ one: 'order', other: 'orders' }}
              weekStartsOn={1}
              locale="en-GB"
              days={[...days]
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => (a.date < b.date ? -1 : 1))}
            />
          </Tile>
        )}

        <Tile
          title="Their orders"
          className={orderedLately ? 'col-span-2' : 'col-span-2 lg:col-span-4'}
        >
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Orders taken with their number show here.
            </p>
          ) : (
            <Timeline
              events={events}
              now={now}
              label={`${title}’s orders`}
              timeZone="Africa/Accra"
              locale="en-GB"
              maxHeight={420}
            />
          )}
          {customer.recentOrders.length > 0 && customer.recentOrders.length < customer.orders && (
            <p className="text-xs text-muted-foreground">
              Showing their latest {customer.recentOrders.length} orders.
            </p>
          )}
        </Tile>
      </Bento>
    </>
  );
}
