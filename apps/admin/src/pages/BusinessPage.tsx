import { pinProblem } from '@brixx/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, MessageCircle, Phone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { BarChart } from '@/components/arc/bar-chart/bar-chart';
import { Button } from '@/components/arc/button/button';
import { CopyButton } from '@/components/arc/copy-button/copy-button';
import { Input } from '@/components/arc/input/input';
import { JsonViewer } from '@/components/arc/json-viewer/json-viewer';
import { MetricCard } from '@/components/arc/metric-card/metric-card';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import {
  SortableDataTable,
  type DataColumn,
} from '@/components/arc/sortable-data-table/sortable-data-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs';
import { Textarea } from '@/components/arc/textarea/textarea';
import { Timeline } from '@/components/arc/timeline/timeline';
import { LinkBadge, ReasonDialog, TableScroll, TabletBadge } from '@/components/app/admin';
import { Panel, PanelEmpty, PanelLink } from '@/components/app/panel';
import { api, call, type BusinessDetail, type Tablet } from '@/lib/api';
import {
  actionWords,
  ago,
  cedis,
  localPhone,
  orderWay,
  orderWord,
  sentence,
  shortDay,
  stamp,
  vendorType,
  NBSP,
} from '@/lib/format';
import { refreshAll, useCan } from '@/lib/query';
import { BusinessStatus } from '@/shell/Shell';
import { Page } from '@/ui/Page';

type Staff = BusinessDetail['staff'][number];
type Order = BusinessDetail['recentOrders'][number];
type Link_ = BusinessDetail['recentLinks'][number];
type Dialog =
  | { kind: 'suspend' }
  | { kind: 'restore' }
  | { kind: 'tablet'; tablet: Tablet }
  | { kind: 'pin'; person: Staff };

const ROLE_WORDS: Record<string, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
  RIDER: 'Rider',
};
const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** Money to hand back: all of a cancelled order's, or what was paid over the total. */
const owed = (order: Order) =>
  order.status === 'CANCELLED' || order.status === 'REFUNDED'
    ? order.amountPaid
    : Math.max(0, order.amountPaid - order.total);

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function PinFields({
  pin,
  again,
  onPin,
  onAgain,
}: {
  pin: string;
  again: string;
  onPin: (v: string) => void;
  onAgain: (v: string) => void;
}) {
  const problem = pin.length === 6 ? pinProblem(pin) : null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Input
        label="New PIN"
        description="6 digits"
        error={problem ?? undefined}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(event) => onPin(event.target.value.replace(/\D/g, ''))}
      />
      <Input
        label="Type it again"
        error={again.length === 6 && again !== pin ? 'They don’t match' : undefined}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={again}
        onChange={(event) => onAgain(event.target.value.replace(/\D/g, ''))}
      />
    </div>
  );
}

function Notes({ business }: { business: BusinessDetail }) {
  const can = useCan();
  const [body, setBody] = useState('');
  const add = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/platform/businesses/{tenantId}/notes', {
          params: { path: { tenantId: business.id } },
          body: { body },
        }),
      ),
    meta: { ok: 'Note added' },
    onSuccess: () => {
      setBody('');
      void refreshAll();
    },
  });
  return (
    <Panel title="Team notes" description="What each call was about. Vendors never see these.">
      {can('notes.write') && (
        <form
          className="flex flex-col gap-3 border-t px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim()) add.mutate();
          }}
        >
          <Textarea
            label="New note"
            placeholder="Called 27 Oct: tablet battery dead, they’ll charge it."
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={add.isPending} disabled={!body.trim()}>
              Add note
            </Button>
          </div>
        </form>
      )}
      {business.notes.length === 0 ? (
        <PanelEmpty>No notes yet.</PanelEmpty>
      ) : (
        <div className="border-t px-5 py-4">
          <Timeline
            label="Team notes"
            now={Date.now()}
            timeZone="Africa/Accra"
            locale="en-GB"
            events={business.notes.map((note) => ({
              id: note.id,
              at: note.createdAt,
              actor: note.authorName,
              title: note.body,
            }))}
          />
        </div>
      )}
    </Panel>
  );
}

export function BusinessPage() {
  const { tenantId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';
  const can = useCan();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');

  const detail = useQuery({
    queryKey: ['business', tenantId],
    queryFn: () =>
      call<BusinessDetail>(
        api.GET('/api/platform/businesses/{tenantId}', { params: { path: { tenantId } } }),
      ),
  });
  const b = detail.data;

  const back = (
    <Link
      to="/businesses"
      className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft size={14} strokeWidth={1.75} aria-hidden /> Businesses
    </Link>
  );

  if (detail.error) {
    return (
      <Page title="Business" back={back}>
        <Alert tone="danger" title="This business couldn’t load">
          {detail.error.message}
        </Alert>
      </Page>
    );
  }
  if (!b) {
    return (
      <Page title="Loading…" back={back}>
        <Skeleton lines={10} />
      </Page>
    );
  }

  const orders30 = b.trend.reduce((sum, d) => sum + d.orders, 0);
  const value30 = b.trend.reduce((sum, d) => sum + d.value, 0);
  const daysOpen = b.trend.filter((d) => d.orders > 0).length;
  const troubled = b.tabletList.filter((t) => t.alerts.length > 0).length;
  const phone = localPhone(b.contactPhone);
  const close = () => {
    setDialog(null);
    setPin('');
    setAgain('');
  };

  const tabletColumns: DataColumn<Tablet>[] = [
    {
      key: 'name',
      label: 'Tablet',
      sortable: true,
      render: (_, t) => (
        <span className="flex flex-col">
          <span className="font-medium">{t.name}</span>
          <span className="text-xs text-muted-foreground">
            Code {t.code}
            {t.appVersion && ` · app ${t.appVersion}`}
          </span>
        </span>
      ),
    },
    { key: 'alerts', label: 'State', render: (_, t) => <TabletBadge tablet={t} /> },
    { key: 'lastSeenAt', label: 'Last in touch', sortable: true, render: (v) => ago(v as string) },
    { key: 'lastSyncedAt', label: 'Last full sync', render: (v) => ago(v as string) },
    { key: 'pendingChanges', label: 'Waiting', sortable: true, numeric: true },
    {
      key: 'id',
      label: '',
      render: (_, t) =>
        can('support.fix') && !t.signedOut ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDialog({ kind: 'tablet', tablet: t })}
          >
            Sign out
          </Button>
        ) : null,
    },
  ];

  const staffColumns: DataColumn<Staff>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (_, s) => (
        <span className="flex flex-col">
          <span className="font-medium">{s.name}</span>
          <span className="text-xs text-muted-foreground">
            {ROLE_WORDS[s.role]}
            {!s.active && ' · switched off'}
          </span>
        </span>
      ),
    },
    {
      key: 'hasPin',
      label: 'PIN',
      render: (_, s) =>
        s.lockedUntil ? (
          <Badge tone="danger">Locked out</Badge>
        ) : s.hasPin ? (
          <Badge tone="success">Set</Badge>
        ) : (
          <Badge>None</Badge>
        ),
    },
    {
      key: 'id',
      label: '',
      render: (_, s) =>
        can('support.fix') && s.active ? (
          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'pin', person: s })}>
            New PIN
          </Button>
        ) : null,
    },
  ];

  const orderColumns: DataColumn<Order>[] = [
    {
      key: 'displayNumber',
      label: 'Order',
      render: (v) => <span className="font-mono font-medium">{v as string}</span>,
    },
    { key: 'createdAt', label: 'When', sortable: true, render: (v) => stamp(v as string) },
    {
      key: 'type',
      label: 'Kind',
      render: (_, o) =>
        `${orderWord(o.type)}${o.source !== 'POS' ? ` · ${orderWord(o.source)}` : ''}`,
    },
    { key: 'status', label: 'Status', render: (v) => sentence(v as string) },
    {
      key: 'total',
      label: 'Total',
      sortable: true,
      numeric: true,
      render: (v) => cedis(v as number),
    },
    {
      key: 'amountPaid',
      label: 'Paid',
      render: (_, o) =>
        owed(o) > 0 ? (
          <Badge tone="danger">Refund owed {cedis(owed(o))}</Badge>
        ) : o.status === 'CANCELLED' ? (
          <Badge>Cancelled</Badge>
        ) : o.amountPaid >= o.total ? (
          <Badge tone="success">Paid</Badge>
        ) : (
          <Badge tone="warning">{cedis(o.total - o.amountPaid)} unpaid</Badge>
        ),
    },
  ];

  const linkColumns: DataColumn<Link_>[] = [
    {
      key: 'orderNumber',
      label: 'Order',
      render: (v) => <span className="font-mono font-medium">{v as string}</span>,
    },
    { key: 'createdAt', label: 'Sent', sortable: true, render: (v) => stamp(v as string) },
    {
      key: 'phone',
      label: 'To',
      render: (v) => <span className="font-mono">{localPhone(v as string)}</span>,
    },
    {
      key: 'status',
      label: 'State',
      render: (_, l) => (
        <span className="flex flex-col items-start gap-0.5">
          <LinkBadge status={l.status} />
          {l.failure && <span className="text-xs text-muted-foreground">{l.failure}</span>}
        </span>
      ),
    },
    { key: 'amount', label: 'Amount', numeric: true, render: (v) => cedis(v as number) },
  ];

  return (
    <Page
      back={back}
      title={b.name}
      subtitle={`${vendorType(b.vendorType)} · ${b.area ?? 'no area given'} · /${b.slug}`}
      actions={
        <>
          {b.status === 'ACTIVE' && (
            <a
              href={b.storeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-(--radius-control) border bg-card px-3 text-sm font-medium hover:bg-muted"
            >
              Store <ExternalLink {...ICON} />
            </a>
          )}
          {b.status === 'PENDING' && (
            <Link
              to={`/requests?open=${b.id}`}
              className="inline-flex h-9 items-center rounded-(--radius-control) bg-foreground px-3 text-sm font-medium text-background"
            >
              Decide on request
            </Link>
          )}
          {can('businesses.suspend') && b.status === 'ACTIVE' && (
            <Button variant="danger" onClick={() => setDialog({ kind: 'suspend' })}>
              Suspend
            </Button>
          )}
          {can('businesses.suspend') && b.status === 'SUSPENDED' && (
            <Button onClick={() => setDialog({ kind: 'restore' })}>Restore</Button>
          )}
        </>
      }
    >
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2">
        <BusinessStatus status={b.status} />
        {b.paymentConnected ? (
          <Badge tone="success">Payments connected</Badge>
        ) : (
          <Badge tone="warning">Payments not connected</Badge>
        )}
        {b.storeOn ? <Badge tone="info">Online store on</Badge> : <Badge>Online store off</Badge>}
        {troubled > 0 && (
          <Badge tone="danger">
            {troubled} tablet{troubled === 1 ? ' needs' : 's need'} help
          </Badge>
        )}
      </div>

      {b.status === 'SUSPENDED' && (
        <div className="mb-5">
          <Alert tone="danger" title="Suspended">
            {b.statusReason}. Their dashboard, tablets and store are stopped until an Admin restores
            them.
          </Alert>
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          if (value === 'overview') next.delete('tab');
          else next.set('tab', value);
          setParams(next, { replace: true });
        }}
      >
        <TabsList aria-label="About this business">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tablets">Tablets and staff</TabsTrigger>
          <TabsTrigger value="orders">Orders and payments</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="notes">Notes ({b.notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="flex flex-col gap-4 pt-4 md:gap-6">
            <section
              aria-label="Last 30 days"
              className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"
            >
              <MetricCard label="Orders" value={orders30} context="last 30 days" />
              <MetricCard
                label="Worth, in cedis"
                value={Math.round(value30 / 100)}
                context="last 30 days"
              />
              <MetricCard
                label="Days open"
                value={daysOpen}
                suffix={`${NBSP}of 30`}
                context="took an order"
              />
              <MetricCard label="Customers" value={b.customers} context="with a number" />
            </section>
            <div className="grid gap-4 md:gap-6 lg:grid-cols-5">
              <Panel title="Orders per day" className="lg:col-span-3">
                <div className="border-t px-5 py-4">
                  <BarChart
                    label="Orders per day"
                    period="Last 30 days"
                    unit="orders"
                    averageLabel="Daily average"
                    valueLabel="Orders"
                    categoryLabel="Day"
                    showAverage
                    height={200}
                    data={b.trend.map((d, i) => ({
                      key: d.date,
                      label: shortDay(d.date),
                      axisLabel:
                        i % 7 === 0 || i === b.trend.length - 1 ? shortDay(d.date) : undefined,
                      value: d.orders,
                    }))}
                  />
                </div>
              </Panel>
              <Panel title="Details" className="lg:col-span-2">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t px-5 py-4">
                  <Fact label="Owner">
                    {b.ownerName ?? '—'}
                    <span className="block truncate text-xs text-muted-foreground">
                      {b.ownerEmail}
                    </span>
                  </Fact>
                  <Fact label="Phone or WhatsApp">
                    <span className="flex items-center gap-1 font-mono">
                      {phone}
                      {b.contactPhone && (
                        <CopyButton value={phone} label="Copy number" iconOnly variant="plain" />
                      )}
                    </span>
                    {b.contactPhone && (
                      <span className="mt-1 flex gap-3 text-xs font-medium">
                        <a
                          href={`tel:${b.contactPhone}`}
                          className="inline-flex items-center gap-1 text-accent-strong"
                        >
                          <Phone size={12} strokeWidth={1.75} aria-hidden /> Call
                        </a>
                        <a
                          href={`https://wa.me/${b.contactPhone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-accent-strong"
                        >
                          <MessageCircle size={12} strokeWidth={1.75} aria-hidden /> WhatsApp
                        </a>
                      </span>
                    )}
                  </Fact>
                  <Fact label="Payment account">
                    {b.paymentConnected
                      ? `Connected, ending ${b.paymentAccountLast4}`
                      : 'Not connected'}
                  </Fact>
                  <Fact label="Menu">{b.menuItems} items</Fact>
                  <Fact label="Joined">
                    {stamp(b.createdAt)}
                    {b.approvedAt && (
                      <span className="block text-xs text-muted-foreground">
                        approved {ago(b.approvedAt)}
                      </span>
                    )}
                  </Fact>
                  <Fact label="Took orders by">
                    {b.orderWays.length ? b.orderWays.map(orderWay).join(', ') : '—'}
                  </Fact>
                </dl>
              </Panel>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tablets">
          <div className="flex flex-col gap-4 pt-4 md:gap-6">
            <Panel
              title="Tablets"
              description="Signing one out stops it at once; setting it up again makes it a new tablet."
            >
              {b.tabletList.length === 0 ? (
                <PanelEmpty>
                  No tablet set up yet. The owner registers one from the tablet app.
                </PanelEmpty>
              ) : (
                <TableScroll>
                  <SortableDataTable
                    rows={b.tabletList}
                    columns={tabletColumns}
                    rowKey="id"
                    caption="Tablets"
                  />
                </TableScroll>
              )}
            </Panel>
            <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
              <Panel title="Staff and PINs">
                <TableScroll>
                  <SortableDataTable
                    rows={b.staff}
                    columns={staffColumns}
                    rowKey="id"
                    caption="Staff"
                    emptyMessage="No staff yet."
                  />
                </TableScroll>
              </Panel>
              <Panel title="Email logins" description="Who signs in to the dashboard.">
                {b.logins.length === 0 ? (
                  <PanelEmpty>No one signs in to the dashboard.</PanelEmpty>
                ) : (
                  <ul className="flex flex-col divide-y border-t">
                    {b.logins.map((login) => (
                      <li
                        key={login.email}
                        className="flex items-center justify-between gap-3 px-5 py-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{login.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {login.email}
                          </span>
                        </span>
                        <Badge size="sm">
                          {ROLE_WORDS[login.role]}
                          {!login.active && ', off'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <div className="flex flex-col gap-4 pt-4 md:gap-6">
            <Panel title="Latest orders" description="The 25 newest, any day.">
              <TableScroll>
                <SortableDataTable
                  rows={b.recentOrders}
                  columns={orderColumns}
                  rowKey="id"
                  caption="Latest orders"
                  emptyMessage="No orders yet."
                  defaultSort={{ key: 'createdAt', direction: 'desc' }}
                />
              </TableScroll>
            </Panel>
            <Panel title="Payment links">
              <TableScroll>
                <SortableDataTable
                  rows={b.recentLinks}
                  columns={linkColumns}
                  rowKey="id"
                  caption="Payment links"
                  emptyMessage="No payment links sent yet."
                  defaultSort={{ key: 'createdAt', direction: 'desc' }}
                />
              </TableScroll>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <div className="pt-4">
            <Panel
              title="Activity"
              description="Changes by the business and by the Brixx team. Open one to see before and after."
              action={<PanelLink to={`/audit?tenantId=${b.id}`}>Full log</PanelLink>}
            >
              {b.activity.length === 0 ? (
                <PanelEmpty>Nothing recorded yet.</PanelEmpty>
              ) : (
                <div className="border-t px-5 py-4">
                  <Timeline
                    label="Activity"
                    now={Date.now()}
                    timeZone="Africa/Accra"
                    locale="en-GB"
                    events={b.activity.map((row) => ({
                      id: row.id,
                      at: row.createdAt,
                      actor: row.actorName,
                      title: actionWords(row.action),
                      meta: row.action,
                      tone: row.byBrixx ? 'success' : 'neutral',
                      detail:
                        row.before !== null || row.after !== null ? (
                          <JsonViewer
                            data={{ before: row.before, after: row.after }}
                            rootName="change"
                            defaultExpandDepth={2}
                            searchable={false}
                            showPath={false}
                            maxHeight={240}
                            label="Before and after"
                          />
                        ) : undefined,
                    }))}
                  />
                </div>
              )}
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <div className="pt-4">
            <Notes business={b} />
          </div>
        </TabsContent>
      </Tabs>

      <ReasonDialog
        open={dialog?.kind === 'suspend'}
        onOpenChange={(open) => !open && close()}
        title={`Suspend ${b.name}?`}
        description="Their dashboard, tablets and online store stop at once. Nothing is deleted, and an Admin can restore them."
        action="Suspend business"
        danger
        ok={`${b.name} is suspended`}
        send={(reason) =>
          call(
            api.POST('/api/platform/businesses/{tenantId}/suspend', {
              params: { path: { tenantId: b.id } },
              body: { reason },
            }),
          )
        }
      />
      <ReasonDialog
        open={dialog?.kind === 'restore'}
        onOpenChange={(open) => !open && close()}
        title={`Restore ${b.name}?`}
        description="Their dashboard, tablets and store work again straight away."
        action="Restore business"
        ok={`${b.name} is open again`}
        send={(reason) =>
          call(
            api.POST('/api/platform/businesses/{tenantId}/restore', {
              params: { path: { tenantId: b.id } },
              body: { reason },
            }),
          )
        }
      />
      <ReasonDialog
        open={dialog?.kind === 'tablet'}
        onOpenChange={(open) => !open && close()}
        title={`Sign out ${dialog?.kind === 'tablet' ? dialog.tablet.name : 'the tablet'}?`}
        description={
          dialog?.kind === 'tablet' && dialog.tablet.pendingChanges > 0
            ? `It still has ${dialog.tablet.pendingChanges} changes that haven’t uploaded. They stay on the tablet and are lost if it’s reset.`
            : 'Its login stops working at once. Setting it up again makes it a new tablet.'
        }
        action="Sign tablet out"
        danger
        ok="Tablet signed out"
        send={(reason) =>
          dialog?.kind === 'tablet'
            ? call(
                api.POST('/api/platform/businesses/{tenantId}/tablets/{deviceId}/sign-out', {
                  params: { path: { tenantId: b.id, deviceId: dialog.tablet.id } },
                  body: { reason },
                }),
              )
            : Promise.resolve()
        }
      />
      <ReasonDialog
        open={dialog?.kind === 'pin'}
        onOpenChange={(open) => !open && close()}
        title={`New PIN for ${dialog?.kind === 'pin' ? dialog.person.name : 'them'}`}
        description="Type the PIN they choose while they’re on the phone. It’s never shown again; ask them to change it on the tablet later."
        action="Set PIN"
        ok="PIN set and any lockout cleared"
        ready={pin.length === 6 && !pinProblem(pin) && again === pin}
        send={(reason) =>
          dialog?.kind === 'pin'
            ? call(
                api.POST('/api/platform/businesses/{tenantId}/staff/{staffId}/pin', {
                  params: { path: { tenantId: b.id, staffId: dialog.person.id } },
                  body: { pin, reason },
                }),
              )
            : Promise.resolve()
        }
      >
        <PinFields pin={pin} again={again} onPin={setPin} onAgain={setAgain} />
      </ReasonDialog>
    </Page>
  );
}
