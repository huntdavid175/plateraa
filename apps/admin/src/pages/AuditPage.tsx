import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { DateRangePicker } from '@/components/arc/date-range-picker/date-range-picker';
import { JsonViewer } from '@/components/arc/json-viewer/json-viewer';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Select } from '@/components/arc/select/select';
import { Timeline } from '@/components/arc/timeline/timeline';
import { Loading } from '@/components/app/admin';
import { Panel, PanelEmpty } from '@/components/app/panel';
import { api, call, downloadAuditCsv, type AuditRow, type BusinessRow } from '@/lib/api';
import { actionWords } from '@/lib/format';
import { useCan } from '@/lib/query';
import { toast } from '@/ui/Toast';
import { Page } from '@/ui/Page';

const PAGE = 100;

const KINDS = [
  { value: 'all', label: 'Any change' },
  { value: 'tenant.', label: 'Approvals and suspensions' },
  { value: 'staff.', label: 'Staff and PINs' },
  { value: 'device.', label: 'Tablets' },
  { value: 'refund.', label: 'Refunds' },
  { value: 'payment', label: 'Payments and links' },
  { value: 'shift.', label: 'Drawers' },
  { value: 'item.', label: 'Menu' },
  { value: 'stock.', label: 'Stock' },
  { value: 'settings.', label: 'Settings' },
];

/** A local date as YYYY-MM-DD, the way the API takes a day. */
const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayOf = (text: string | null) => (text ? new Date(`${text}T12:00:00`) : null);

/** Who changed what, at every business: vendors' own changes and the Brixx team's. */
export function AuditPage() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const filter = {
    who: (params.get('who') as 'all' | 'brixx' | 'vendor' | null) ?? 'all',
    tenantId: params.get('tenantId') ?? undefined,
    action: params.get('action') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  };
  const [exporting, setExporting] = useState(false);

  const set = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const businesses = useQuery({
    queryKey: ['businesses', 'ALL', ''],
    queryFn: () =>
      call<BusinessRow[]>(
        api.GET('/api/platform/businesses', { params: { query: { filter: 'ALL', limit: 500 } } }),
      ),
  });

  const log = useInfiniteQuery({
    queryKey: ['audit', filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call<AuditRow[]>(
        api.GET('/api/platform/audit', {
          params: { query: { ...filter, before: pageParam, limit: PAGE } },
        }),
      ),
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1]!.id : undefined),
  });
  const rows = log.data?.pages.flat() ?? [];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const query: Record<string, string> = { who: filter.who };
      for (const key of ['tenantId', 'action', 'from', 'to'] as const) {
        if (filter[key]) query[key] = filter[key]!;
      }
      await downloadAuditCsv(query);
    } catch (error) {
      toast.problem(error instanceof Error ? error.message : 'The download didn’t work.');
    } finally {
      setExporting(false);
    }
  };

  const from = dayOf(filter.from ?? null);
  const to = dayOf(filter.to ?? null);

  return (
    <Page
      title="Audit log"
      subtitle="Every change to money, prices, stock and access, and every action by the Brixx team."
      actions={
        can('audit.export') && (
          <Button variant="secondary" loading={exporting} onClick={() => void exportCsv()}>
            <Download size={16} strokeWidth={1.75} aria-hidden /> Download CSV
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-wrap items-end gap-3">
          <SegmentedControl
            label="Whose changes"
            value={filter.who}
            onValueChange={(value) => set({ who: value === 'all' ? undefined : value })}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'brixx', label: 'Brixx team' },
              { value: 'vendor', label: 'Vendors' },
            ]}
          />
          <div className="w-full sm:w-60">
            <Select
              label="Business"
              value={filter.tenantId ?? 'all'}
              onValueChange={(value) => set({ tenantId: value === 'all' ? undefined : value })}
              options={[
                { value: 'all', label: 'Every business' },
                ...(businesses.data ?? [])
                  .slice()
                  .sort((x, y) => x.name.localeCompare(y.name))
                  .map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          </div>
          <div className="w-full sm:w-60">
            <Select
              label="Kind of change"
              value={filter.action ?? 'all'}
              onValueChange={(value) => set({ action: value === 'all' ? undefined : value })}
              options={KINDS}
            />
          </div>
          <DateRangePicker
            label="Days"
            placeholder="Any day"
            value={from && to ? { start: from, end: to } : null}
            onChange={(range) => set({ from: isoDay(range.start), to: isoDay(range.end) })}
            maxDate={new Date()}
            weekStartsOn={1}
            locale="en-GB"
          />
          {(filter.from || filter.to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => set({ from: undefined, to: undefined })}
            >
              Any day
            </Button>
          )}
        </div>

        {log.error ? (
          <Alert tone="danger" title="The audit log couldn’t load">
            {log.error.message}
          </Alert>
        ) : (
          <Panel
            title="Changes"
            description={
              log.data
                ? `${rows.length}${log.hasNextPage ? '+' : ''} shown, newest first. Open one for before and after.`
                : undefined
            }
          >
            {!log.data ? (
              <Loading lines={10} />
            ) : rows.length === 0 ? (
              <PanelEmpty>Nothing recorded for these filters.</PanelEmpty>
            ) : (
              <div className="flex flex-col gap-4 border-t px-5 py-4">
                <Timeline
                  label="Audit log"
                  now={Date.now()}
                  timeZone="Africa/Accra"
                  locale="en-GB"
                  scrollToNew={false}
                  events={rows.map((row) => ({
                    id: row.id,
                    at: row.createdAt,
                    actor: row.actorName,
                    title: `${actionWords(row.action)} at ${row.businessName}`,
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
                          maxHeight={260}
                          label="Before and after"
                        />
                      ) : undefined,
                  }))}
                />
                {log.hasNextPage && (
                  <Button
                    variant="secondary"
                    className="self-start"
                    loading={log.isFetchingNextPage}
                    onClick={() => void log.fetchNextPage()}
                  >
                    Show older
                  </Button>
                )}
              </div>
            )}
          </Panel>
        )}
      </div>
    </Page>
  );
}
