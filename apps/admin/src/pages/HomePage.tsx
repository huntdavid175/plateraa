import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { BarChart } from '@/components/arc/bar-chart/bar-chart';
import { Button } from '@/components/arc/button/button';
import { MetricCard } from '@/components/arc/metric-card/metric-card';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { Timeline } from '@/components/arc/timeline/timeline';
import { Loading } from '@/components/app/admin';
import { Panel, PanelEmpty, PanelLink, PanelRows } from '@/components/app/panel';
import { api, call, type Overview } from '@/lib/api';
import {
  actionWords,
  ago,
  change,
  dayAgo,
  longDay,
  tabletAlertWords,
  vendorType,
  NBSP,
} from '@/lib/format';
import { Page } from '@/ui/Page';

interface Need {
  key: string;
  tone: 'danger' | 'warning';
  tag: string;
  business: string;
  what: string;
  when: string;
  to: string;
}

/** Everything waiting on someone, worst first: broken tablets and links, then requests, then quiet. */
function needsOf(data: Overview): Need[] {
  return [
    ...data.tablets.map((t) => ({
      key: `t${t.id}`,
      tone: 'danger' as const,
      tag: 'Tablet',
      business: t.businessName,
      what: `${t.name}: ${tabletAlertWords(t.alerts[0]!)}`,
      when: ago(t.lastSeenAt),
      to: `/businesses/${t.tenantId}?tab=tablets`,
    })),
    ...data.failedLinks.map((l) => ({
      key: `l${l.id}`,
      tone: 'danger' as const,
      tag: 'Payment',
      business: l.businessName,
      what: `Link for ${l.orderNumber} failed${l.failure ? `: ${l.failure}` : ''}`,
      when: ago(l.createdAt),
      to: `/businesses/${l.tenantId}?tab=orders`,
    })),
    ...data.requests.map((r) => ({
      key: `r${r.id}`,
      tone: 'warning' as const,
      tag: 'Request',
      business: r.name,
      what: `${vendorType(r.vendorType)} in ${r.area ?? 'an unknown area'} asked to join`,
      when: ago(r.createdAt),
      to: `/requests?open=${r.id}`,
    })),
    ...data.quiet.map((q) => ({
      key: `q${q.id}`,
      tone: 'warning' as const,
      tag: 'Quiet',
      business: q.name,
      what: q.lastOrderOn ? `Last order ${dayAgo(q.lastOrderOn)}` : 'Approved, no orders yet',
      when: q.area ?? '',
      to: `/businesses/${q.id}`,
    })),
  ];
}

function NeedRow({ need }: { need: Need }) {
  return (
    <li>
      <Link
        to={need.to}
        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/60"
      >
        <span className="w-[4.5rem] shrink-0">
          <Badge tone={need.tone} size="sm">
            {need.tag}
          </Badge>
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{need.business}</span>
          <span className="truncate text-xs text-muted-foreground">{need.what}</span>
        </span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{need.when}</span>
        <ChevronRight size={14} strokeWidth={1.75} className="text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function HomePage() {
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: () => call<Overview>(api.GET('/api/platform/overview')),
    refetchInterval: 60_000,
  });
  const data = overview.data;

  if (overview.error) {
    return (
      <Page title="Home">
        <Alert tone="danger" title="Today couldn’t load">
          <p className="mb-3">{overview.error.message}</p>
          <Button variant="secondary" size="sm" onClick={() => overview.refetch()}>
            Try again
          </Button>
        </Alert>
      </Page>
    );
  }

  const needs = data ? needsOf(data) : [];
  const nowHour = Number(
    new Date().toLocaleString('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Africa/Accra',
    }),
  );

  let urgent: ReactNode = null;
  if (data && (data.tablets.length || data.failedLinks.length)) {
    const parts = [
      data.tablets.length
        ? `${data.tablets.length} tablet${data.tablets.length === 1 ? ' needs' : 's need'} help`
        : '',
      data.failedLinks.length
        ? `${data.failedLinks.length} payment link${data.failedLinks.length === 1 ? '' : 's'} failed`
        : '',
    ].filter(Boolean);
    urgent = (
      <Alert tone="danger" title={parts.join(' · ')}>
        Their sales may not be reaching Brixx. Call the vendor, then check{' '}
        <Link to="/health" className="font-medium underline underline-offset-2">
          Health
        </Link>
        .
      </Alert>
    );
  }

  return (
    <Page
      title="Home"
      subtitle={data ? `${longDay(data.today)}, across every business on Brixx` : undefined}
    >
      <div className="flex flex-col gap-4 md:gap-6">
        {urgent}

        <section
          aria-label="Today in numbers"
          className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"
        >
          {data ? (
            <>
              <MetricCard
                label="Orders today"
                value={data.ordersToday}
                context="vs this time last week"
                change={change(data.ordersToday, data.ordersSameTimeLastWeek)}
              />
              <MetricCard
                label="Worth, in cedis"
                value={Math.round(data.valueToday / 100)}
                context="orders that went ahead"
              />
              <MetricCard
                label="Businesses trading"
                value={data.activeBusinessesToday}
                suffix={`${NBSP}of ${data.businesses.active}`}
                context="took an order today"
              />
              <MetricCard
                label="Requests waiting"
                value={data.requests.length}
                context={
                  data.requests[0]
                    ? `oldest asked ${ago(data.requests[0].createdAt)}`
                    : 'none waiting'
                }
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

        <div className="grid gap-4 md:gap-6 lg:grid-cols-5">
          <Panel
            title="Needs someone"
            description={data ? `${needs.length} to sort, worst first` : undefined}
            className="lg:col-span-3"
          >
            {!data ? (
              <Loading lines={6} />
            ) : needs.length === 0 ? (
              <PanelEmpty>
                Nothing needs anyone. Every tablet is syncing and no one is waiting.
              </PanelEmpty>
            ) : (
              <PanelRows>
                {needs.map((need) => (
                  <NeedRow key={need.key} need={need} />
                ))}
              </PanelRows>
            )}
          </Panel>

          <Panel title="Orders by hour" className="lg:col-span-2">
            <div className="border-t px-5 py-4">
              {data ? (
                <BarChart
                  label="Orders by hour, Ghana time"
                  period={longDay(data.today)}
                  unit="orders"
                  averageLabel="Average an hour"
                  valueLabel="Orders"
                  categoryLabel="Hour"
                  height={180}
                  data={data.byHour.slice(6, Math.max(nowHour + 1, 18)).map((value, i) => {
                    const hour = String(i + 6).padStart(2, '0');
                    return {
                      key: hour,
                      label: `${hour}:00`,
                      axisLabel: (i + 6) % 3 === 0 ? hour : undefined,
                      value,
                    };
                  })}
                />
              ) : (
                <Skeleton lines={6} />
              )}
            </div>
          </Panel>
        </div>

        <Panel
          title="Latest from the team"
          action={<PanelLink to="/audit?who=brixx">Audit log</PanelLink>}
        >
          <div className="border-t px-5 py-4">
            {!data ? (
              <Skeleton lines={4} />
            ) : data.recentActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet. Approvals, PIN resets and suspensions show here.
              </p>
            ) : (
              <Timeline
                label="Latest actions by the Brixx team"
                now={Date.now()}
                timeZone="Africa/Accra"
                locale="en-GB"
                events={data.recentActions.map((row) => ({
                  id: row.id,
                  at: row.createdAt,
                  actor: row.actorName.replace(' (Brixx)', ''),
                  title: `${actionWords(row.action)} at ${row.businessName}`,
                }))}
              />
            )}
          </div>
        </Panel>
      </div>
    </Page>
  );
}
