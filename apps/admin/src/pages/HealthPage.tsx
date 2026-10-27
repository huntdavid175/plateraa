import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { BarChart } from '@/components/arc/bar-chart/bar-chart';
import { LineChart } from '@/components/arc/line-chart/line-chart';
import { MetricCard } from '@/components/arc/metric-card/metric-card';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import {
  SortableDataTable,
  type DataColumn,
} from '@/components/arc/sortable-data-table/sortable-data-table';
import { Loading, ShareDonut, TableScroll, TabletBadge } from '@/components/app/admin';
import { Panel, PanelEmpty, PanelLine, PanelRows } from '@/components/app/panel';
import { api, call, type Health, type Tablet } from '@/lib/api';
import { ago, cedis, localPhone, NBSP, sentence, shortDay, stamp } from '@/lib/format';
import { Page } from '@/ui/Page';

const LINK_COLOURS: Record<string, string> = {
  PAID: 'var(--success)',
  FAILED: 'var(--danger)',
  SENT: 'var(--warning)',
  QUEUED: 'var(--text-muted)',
  EXPIRED: 'var(--border-strong)',
};

const TABLET_COLUMNS: DataColumn<Tablet>[] = [
  {
    key: 'businessName',
    label: 'Business and tablet',
    sortable: true,
    render: (_, t) => (
      <span className="flex min-w-44 flex-col">
        <Link
          to={`/businesses/${t.tenantId}?tab=tablets`}
          className="font-medium hover:text-accent-strong hover:underline"
        >
          {t.businessName}
        </Link>
        <span className="text-xs text-muted-foreground">
          {t.name} · code {t.code}
        </span>
      </span>
    ),
  },
  { key: 'alerts', label: 'State', render: (_, t) => <TabletBadge tablet={t} /> },
  { key: 'lastSeenAt', label: 'Last in touch', sortable: true, render: (v) => ago(v as string) },
  { key: 'lastSyncedAt', label: 'Last full sync', sortable: true, render: (v) => ago(v as string) },
  { key: 'pendingChanges', label: 'Waiting', sortable: true, numeric: true },
  { key: 'appVersion', label: 'App', sortable: true, render: (v) => (v as string) ?? '—' },
];

const FAILED_COLUMNS: DataColumn<Health['links']['failed'][number]>[] = [
  {
    key: 'businessName',
    label: 'Business',
    sortable: true,
    render: (_, l) => (
      <Link
        to={`/businesses/${l.tenantId}?tab=orders`}
        className="font-medium hover:text-accent-strong hover:underline"
      >
        {l.businessName}
      </Link>
    ),
  },
  {
    key: 'orderNumber',
    label: 'Order',
    render: (v) => <span className="font-mono">{v as string}</span>,
  },
  { key: 'createdAt', label: 'When', sortable: true, render: (v) => stamp(v as string) },
  {
    key: 'phone',
    label: 'To',
    render: (v) => <span className="font-mono">{localPhone(v as string)}</span>,
  },
  { key: 'failure', label: 'Why', render: (v) => (v as string) ?? 'No reason given' },
  { key: 'amount', label: 'Amount', numeric: true, render: (v) => cedis(v as number) },
];

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/** Is everything working? The server, tablets, sync, payment links and the payment provider. */
export function HealthPage() {
  const [which, setWhich] = useState('problems');
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => call<Health>(api.GET('/api/platform/health')),
    refetchInterval: 60_000,
  });
  const h = health.data;

  if (health.error) {
    return (
      <Page title="Health">
        <Alert tone="danger" title="Health couldn’t load">
          {health.error.message}
        </Alert>
      </Page>
    );
  }

  const troubled = h?.tablets.filter((t) => t.alerts.length > 0) ?? [];
  const sent24 = h?.links.byStatus.reduce((sum, s) => sum + s.count, 0) ?? 0;
  const paid24 = h?.links.byStatus.find((s) => s.status === 'PAID')?.count ?? 0;
  const failed24 = h?.links.byStatus.find((s) => s.status === 'FAILED')?.count ?? 0;
  const providerQuiet = Boolean(
    h &&
    sent24 > 0 &&
    (!h.provider.lastAt || Date.now() - Date.parse(h.provider.lastAt) > 6 * 3_600_000),
  );
  const latest = h?.versions[0]?.version;

  return (
    <Page
      title="Health"
      subtitle="The server, tablets, sync and payments across every business. Refreshes every minute."
    >
      <div className="flex flex-col gap-4 md:gap-6">
        {h && troubled.length === 0 && failed24 === 0 && !providerQuiet && (
          <Alert tone="success" title="Everything is working">
            All {h.tabletCounts.total} tablets are syncing and no payment link has failed today.
          </Alert>
        )}
        {providerQuiet && (
          <Alert tone="warning" title="The payment provider has gone quiet">
            Links were sent today, but Moolre hasn’t called back for over 6 hours. Payments may not
            be confirming: check Moolre’s status and Render’s logs.
          </Alert>
        )}

        <section
          aria-label="Health in numbers"
          className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"
        >
          {h ? (
            <>
              <MetricCard
                label="Tablets online now"
                value={h.tabletCounts.online}
                suffix={`${NBSP}of ${h.tabletCounts.total}`}
                context={`${troubled.length} need help`}
              />
              <MetricCard
                label="Changes waiting"
                value={h.tabletCounts.waitingChanges}
                context="not yet uploaded, all tablets"
              />
              <MetricCard
                label="Links paid today"
                value={sent24 ? Math.round((paid24 / sent24) * 100) : 0}
                suffix="%"
                context={`${paid24} of ${sent24} sent · ${failed24} failed`}
              />
              <MetricCard
                label="Database"
                value={h.server.databaseMs}
                suffix={`${NBSP}ms`}
                context="one round trip from the API"
              />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-(--radius-surface) border bg-card p-5">
                <Skeleton lines={2} />
              </div>
            ))
          )}
        </section>

        <Panel
          title="Tablets"
          description="A stuck tablet keeps uploading without finishing. Ask them to check the Wi-Fi and reopen the app; sign it out only if it’s lost."
          action={
            h && (
              <SegmentedControl
                label="Which tablets"
                value={which}
                onValueChange={setWhich}
                options={[
                  { value: 'problems', label: `Need help (${troubled.length})` },
                  { value: 'all', label: `All (${h.tablets.length})` },
                ]}
              />
            )
          }
        >
          {!h ? (
            <Loading lines={6} />
          ) : (which === 'problems' ? troubled : h.tablets).length === 0 ? (
            <PanelEmpty>Every tablet is syncing.</PanelEmpty>
          ) : (
            <TableScroll>
              <SortableDataTable
                rows={which === 'problems' ? troubled : h.tablets}
                columns={TABLET_COLUMNS}
                rowKey="id"
                caption="Tablets"
                defaultSort={{ key: 'pendingChanges', direction: 'desc' }}
              />
            </TableScroll>
          )}
        </Panel>

        <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-5">
          <Panel
            title="Sync, last 24 hours"
            description={
              h
                ? `${h.sync.applied.toLocaleString('en-GH')} changes went through, ${h.sync.rejected} refused`
                : undefined
            }
            className="lg:col-span-3"
          >
            <div className="border-t px-5 py-4">
              {h ? (
                <BarChart
                  label="Changes from tablets each hour"
                  period="Last 24 hours, Ghana time"
                  unit="changes"
                  averageLabel="Average an hour"
                  valueLabel="Changes"
                  categoryLabel="Hour"
                  height={180}
                  data={h.sync.byHour.map((row, i) => ({
                    key: `${i}-${row.hour}`,
                    label: `${row.hour}: ${row.applied} went through, ${row.rejected} refused`,
                    axisLabel: i % 4 === 0 ? row.hour.slice(0, 2) : undefined,
                    value: row.applied + row.rejected,
                  }))}
                />
              ) : (
                <Skeleton lines={6} />
              )}
            </div>
          </Panel>

          <Panel title="Tablets by last contact" className="lg:col-span-2">
            <div className="border-t px-5 py-4">
              {h ? (
                <ShareDonut
                  label="Tablets by when they were last in touch"
                  totalLabel="Tablets"
                  unit="tablets"
                  emptyLabel="No tablets yet"
                  data={[
                    {
                      key: 'online',
                      label: 'Online now',
                      value: h.tabletCounts.online,
                      color: 'var(--success)',
                    },
                    {
                      key: 'today',
                      label: 'Earlier today',
                      value: h.tabletCounts.today,
                      color: 'var(--warning)',
                    },
                    {
                      key: 'quiet',
                      label: 'Over a day ago',
                      value: h.tabletCounts.quiet,
                      color: 'var(--danger)',
                    },
                  ]}
                />
              ) : (
                <Skeleton lines={5} />
              )}
            </div>
            {h && (
              <div className="border-t px-5 py-4">
                <p className="mb-2 text-xs text-muted-foreground">App versions in use</p>
                <div className="flex flex-wrap gap-1.5">
                  {h.versions.map((v) => (
                    <Badge key={v.version} tone={v.version === latest ? 'success' : 'warning'}>
                      {v.version} · {v.tablets}
                    </Badge>
                  ))}
                  {h.tabletCounts.signedOut > 0 && (
                    <Badge>{h.tabletCounts.signedOut} signed out</Badge>
                  )}
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-5">
          <Panel
            title="Payment links, last 7 days"
            description={
              h?.links.medianMinutesToPay != null
                ? `Half of paid links are paid within ${h.links.medianMinutesToPay} minutes of being made`
                : 'Sent, paid and failed each day'
            }
            className="lg:col-span-3"
          >
            <div className="border-t px-5 py-4">
              {h ? (
                <LineChart
                  label="Payment links each day"
                  height={220}
                  categoryLabel="Day"
                  series={[
                    { key: 'sent', label: 'Sent' },
                    { key: 'paid', label: 'Paid', color: 'var(--success)', area: false },
                    { key: 'failed', label: 'Failed', color: 'var(--danger)', area: false },
                  ]}
                  data={h.links.byDay.map((d) => ({
                    key: d.date,
                    label: shortDay(d.date),
                    axisLabel: shortDay(d.date),
                    values: { sent: d.sent, paid: d.paid, failed: d.failed },
                  }))}
                />
              ) : (
                <Skeleton lines={6} />
              )}
            </div>
          </Panel>
          <Panel
            title="Payment links today"
            description="Sent in the last 24 hours"
            className="lg:col-span-2"
          >
            <div className="border-t px-5 py-4">
              {h ? (
                <ShareDonut
                  label="Payment links in the last 24 hours"
                  totalLabel="Links"
                  unit="links"
                  emptyLabel="No payment links today"
                  data={h.links.byStatus.map((s) => ({
                    key: s.status,
                    label: sentence(s.status),
                    value: s.count,
                    color: LINK_COLOURS[s.status],
                  }))}
                />
              ) : (
                <Skeleton lines={5} />
              )}
            </div>
          </Panel>
        </div>

        <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-3">
          <Panel
            title="Payment provider"
            description="Moolre’s calls to tell us a payment went through"
          >
            {h ? (
              <PanelRows>
                <PanelLine label="Calls, last 24 hours" value={h.provider.callbacks} />
                <PanelLine
                  label="Last call"
                  value={h.provider.lastAt ? ago(h.provider.lastAt) : 'Never'}
                  tone={providerQuiet ? 'text-warning' : undefined}
                />
                <PanelLine
                  label="Median time to pay"
                  value={
                    h.links.medianMinutesToPay != null ? `${h.links.medianMinutesToPay} min` : '—'
                  }
                />
              </PanelRows>
            ) : (
              <Loading lines={3} />
            )}
          </Panel>

          <Panel
            title="Stores without payments"
            description="Online store on, but no payment account: customers can only pay cash on pickup."
          >
            {!h ? (
              <Loading lines={3} />
            ) : h.storesWithoutPayments.length === 0 ? (
              <PanelEmpty>None. Every open store can take payments.</PanelEmpty>
            ) : (
              <PanelRows>
                {h.storesWithoutPayments.map((s) => (
                  <PanelLine
                    key={s.id}
                    label={s.name}
                    note={s.area ?? undefined}
                    value="Call them"
                    to={`/businesses/${s.id}`}
                  />
                ))}
              </PanelRows>
            )}
          </Panel>

          <Panel
            title="Changes the server refused"
            description="Today. Usually a price that changed under the tablet."
          >
            {!h ? (
              <Loading lines={3} />
            ) : h.refusals.length === 0 ? (
              <PanelEmpty>None. Every tablet’s changes went through.</PanelEmpty>
            ) : (
              <PanelRows>
                {h.refusals.map((r) => (
                  <PanelLine
                    key={r.type}
                    label={<span className="font-mono">{r.type}</span>}
                    note={`${r.businesses} business${r.businesses === 1 ? '' : 'es'} · last ${ago(r.lastAt)}`}
                    value={`${r.count}×`}
                  />
                ))}
              </PanelRows>
            )}
          </Panel>
        </div>

        <Panel title="Failed payment links" description="The last 7 days">
          {!h ? (
            <Loading />
          ) : (
            <TableScroll>
              <SortableDataTable
                rows={h.links.failed}
                columns={FAILED_COLUMNS}
                rowKey="id"
                caption="Failed payment links"
                emptyMessage="No payment link has failed this week."
                defaultSort={{ key: 'createdAt', direction: 'desc' }}
              />
            </TableScroll>
          )}
        </Panel>

        <Panel title="Server">
          {h ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t px-5 py-4 md:grid-cols-4">
              <Fact label="Running build">
                <span className="font-mono">{h.server.commit ?? 'local'}</span>
              </Fact>
              <Fact label="Started">{ago(h.server.startedAt)}</Fact>
              <Fact label="Database round trip">{h.server.databaseMs} ms</Fact>
              <Fact label="Node">{h.server.nodeVersion}</Fact>
            </dl>
          ) : (
            <Loading lines={2} />
          )}
        </Panel>
      </div>
    </Page>
  );
}
