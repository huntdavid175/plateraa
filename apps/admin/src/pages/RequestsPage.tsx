import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, MessageCircle, Phone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Avatar } from '@/components/arc/avatar/avatar';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { CopyButton } from '@/components/arc/copy-button/copy-button';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { Textarea } from '@/components/arc/textarea/textarea';
import { Timeline } from '@/components/arc/timeline/timeline';
import { ButtonLink, Loading, ReasonDialog } from '@/components/app/admin';
import { Panel, PanelEmpty } from '@/components/app/panel';
import { api, call, type Request, type RequestDetail } from '@/lib/api';
import { actionWords, ago, localPhone, orderWay, stamp, vendorType } from '@/lib/format';
import { refreshAll, useCan } from '@/lib/query';
import { cn } from '@/lib/utils';
import { BusinessStatus } from '@/shell/Shell';
import { Page } from '@/ui/Page';

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;
const ROLE_WORDS: Record<string, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
  RIDER: 'Rider',
};

const CHECKS = [
  'The business is real and trading: ask where it is and what it sells.',
  'The phone number is theirs: you reached them on it.',
  'It isn’t already on Brixx under another name (see possible duplicates).',
  'They know what happens next: you’ll help them set up the menu, PINs and tablet.',
];

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function CallNotes({ request }: { request: RequestDetail }) {
  const can = useCan();
  const [body, setBody] = useState('');
  const add = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/platform/businesses/{tenantId}/notes', {
          params: { path: { tenantId: request.id } },
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
    <Panel
      title="Call notes"
      description="What happened on each call. The vendor never sees these."
    >
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
            placeholder="Called at 10:15, no answer. Sent a WhatsApp."
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={2}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={add.isPending} disabled={!body.trim()}>
              Add note
            </Button>
          </div>
        </form>
      )}
      {request.notes.length === 0 ? (
        <PanelEmpty>No calls noted yet.</PanelEmpty>
      ) : (
        <div className="border-t px-5 py-4">
          <Timeline
            label="Call notes"
            now={Date.now()}
            timeZone="Africa/Accra"
            locale="en-GB"
            events={request.notes.map((note) => ({
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

function RequestView({ id }: { id: string }) {
  const can = useCan();
  const [declining, setDeclining] = useState(false);
  const detail = useQuery({
    queryKey: ['request', id],
    queryFn: () =>
      call<RequestDetail>(
        api.GET('/api/platform/requests/{tenantId}', { params: { path: { tenantId: id } } }),
      ),
  });
  const r = detail.data;
  const approve = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/platform/requests/{tenantId}/approve', {
          params: { path: { tenantId: id } },
        }),
      ),
    meta: {
      ok: `${r?.name ?? 'The business'} is in. Their dashboard opens the next time they sign in.`,
    },
    onSuccess: () => void refreshAll(),
  });

  if (detail.error) {
    return (
      <Alert tone="danger" title="This request couldn’t load">
        {detail.error.message}
      </Alert>
    );
  }
  if (!r) {
    return (
      <Panel title="Loading">
        <Loading lines={10} />
      </Panel>
    );
  }

  const phone = localPhone(r.contactPhone);
  const waiting = r.status === 'PENDING';

  return (
    <div className="flex min-w-0 flex-col gap-4 md:gap-6">
      <Panel
        title={r.name}
        description={`${vendorType(r.vendorType)} in ${r.area ?? 'an area they didn’t give'} · asked ${ago(r.createdAt)}`}
        action={<BusinessStatus status={r.status} />}
      >
        {r.lookalikes.length > 0 && (
          <div className="border-t px-5 py-4">
            <Alert tone="warning" title={`This may already be on Brixx (${r.lookalikes.length})`}>
              <ul className="mt-2 flex flex-col gap-2">
                {r.lookalikes.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/businesses/${l.id}`}
                      className="font-medium underline underline-offset-2"
                    >
                      {l.name}
                    </Link>
                    <span className="text-xs">
                      {l.area ?? 'no area'} · joined {stamp(l.createdAt)}
                    </span>
                    <BusinessStatus status={l.status} />
                    {l.reasons.map((reason) => (
                      <Badge key={reason} size="sm" tone="warning">
                        {reason}
                      </Badge>
                    ))}
                  </li>
                ))}
              </ul>
            </Alert>
          </div>
        )}

        {r.status === 'DECLINED' && (
          <div className="border-t px-5 py-4">
            <Alert
              tone="warning"
              title={`Declined ${r.statusChangedAt ? stamp(r.statusChangedAt) : ''}`}
            >
              {r.statusReason}
            </Alert>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t px-5 py-4">
          {r.contactPhone && (
            <>
              <ButtonLink href={`tel:${r.contactPhone}`}>
                <Phone {...ICON} /> Call {phone}
              </ButtonLink>
              <ButtonLink
                href={`https://wa.me/${r.contactPhone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle {...ICON} /> WhatsApp
              </ButtonLink>
              <CopyButton value={phone} label="Copy number" iconOnly variant="plain" />
            </>
          )}
          {can('requests.decide') && r.status !== 'ACTIVE' && (
            <div className="ml-auto flex gap-2">
              {waiting && (
                <Button variant="secondary" onClick={() => setDeclining(true)}>
                  Decline
                </Button>
              )}
              <Button loading={approve.isPending} onClick={() => approve.mutate()}>
                {waiting ? 'Approve' : 'Approve after all'}
              </Button>
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <Panel title="The business">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t px-5 py-4">
            <Fact label="Kind">{vendorType(r.vendorType)}</Fact>
            <Fact label="Area">{r.area ?? '—'}</Fact>
            <Fact label="Phone or WhatsApp">
              <span className="font-mono">{phone}</span>
            </Fact>
            <Fact label="Asked">{stamp(r.createdAt)}</Fact>
            <Fact label="Takes orders today by">
              <span className="mt-1 flex flex-wrap gap-1.5">
                {r.orderWays.length
                  ? r.orderWays.map((way) => (
                      <Badge key={way} size="sm">
                        {orderWay(way)}
                      </Badge>
                    ))
                  : '—'}
              </span>
            </Fact>
            <Fact label="Store address, once approved">
              <span className="font-mono text-text-secondary">/{r.slug}</span>
            </Fact>
            <Fact label="In the same area">
              {r.area
                ? `${r.nearby.open} open business${r.nearby.open === 1 ? '' : 'es'}, ${r.nearby.waiting} other request${r.nearby.waiting === 1 ? '' : 's'}`
                : '—'}
            </Fact>
            <Fact label="Time zone">{r.timezone}</Fact>
          </dl>
        </Panel>

        <Panel title="The owner">
          <div className="flex items-center gap-3 border-t px-5 py-4">
            <Avatar name={r.owner.name ?? r.name} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-medium">{r.owner.name ?? '—'}</p>
              <p className="truncate text-sm text-muted-foreground">
                {r.owner.email ?? 'No email'}
              </p>
            </div>
            <span className="ml-auto">
              {r.owner.emailVerified ? (
                <Badge tone="success">Email confirmed</Badge>
              ) : (
                <Badge>Email not confirmed</Badge>
              )}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t px-5 py-4">
            <Fact label="Made their login">
              {r.owner.signedUpAt ? stamp(r.owner.signedUpAt) : '—'}
            </Fact>
            <Fact label="Last signed in">{ago(r.owner.lastSignInAt)}</Fact>
          </dl>
          <div className="border-t px-5 py-4">
            <p className="text-xs text-muted-foreground">Other businesses on this login</p>
            {r.owner.otherBusinesses.length === 0 ? (
              <p className="mt-1 text-sm">None. This is their first.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {r.owner.otherBusinesses.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 text-sm">
                    <Link
                      to={`/businesses/${b.id}`}
                      className="font-medium hover:text-accent-strong hover:underline"
                    >
                      {b.name}
                    </Link>
                    <Badge size="sm">{ROLE_WORDS[b.role]}</Badge>
                    <BusinessStatus status={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        {waiting ? (
          <Panel title="Before you approve" description="Check these on the call.">
            <ul className="flex flex-col divide-y border-t">
              {CHECKS.map((check) => (
                <li key={check} className="flex gap-3 px-5 py-3 text-sm">
                  <Check
                    size={16}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 text-success"
                    aria-hidden
                  />
                  {check}
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Panel title="History">
            <div className="border-t px-5 py-4">
              <Timeline
                label="History"
                now={Date.now()}
                timeZone="Africa/Accra"
                locale="en-GB"
                events={r.activity.map((row) => ({
                  id: row.id,
                  at: row.createdAt,
                  actor: row.actorName,
                  title: actionWords(row.action),
                }))}
              />
            </div>
          </Panel>
        )}
        <CallNotes request={r} />
      </div>

      <ReasonDialog
        open={declining}
        onOpenChange={setDeclining}
        title={`Decline ${r.name}?`}
        description="Their dashboard keeps saying the request is waiting. You can still approve it later from here."
        action="Decline request"
        danger
        ok={`${r.name} declined`}
        send={(reason) =>
          call(
            api.POST('/api/platform/requests/{tenantId}/decline', {
              params: { path: { tenantId: r.id } },
              body: { reason },
            }),
          )
        }
      />
    </div>
  );
}

export function RequestsPage() {
  const [params, setParams] = useSearchParams();
  const show = params.get('show') === 'declined' ? 'declined' : 'waiting';
  const requests = useQuery({
    queryKey: ['requests'],
    queryFn: () => call<Request[]>(api.GET('/api/platform/requests')),
  });
  const rows = (requests.data ?? []).filter((r) =>
    show === 'waiting' ? r.status === 'PENDING' : r.status === 'DECLINED',
  );
  const waiting = (requests.data ?? []).filter((r) => r.status === 'PENDING').length;
  const open = rows.find((r) => r.id === params.get('open')) ?? rows[0] ?? null;

  const choose = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('open', id);
    setParams(next, { replace: true });
  };

  return (
    <Page
      title="Requests"
      subtitle="Businesses asking to join Brixx, oldest first. Call each one before you decide."
    >
      {requests.error ? (
        <Alert tone="danger" title="Requests couldn’t load">
          {requests.error.message}
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <SegmentedControl
            label="Which requests"
            value={show}
            onValueChange={(value) =>
              setParams(value === 'declined' ? { show: 'declined' } : {}, { replace: true })
            }
            options={[
              { value: 'waiting', label: `Waiting (${waiting})` },
              { value: 'declined', label: 'Declined, last 30 days' },
            ]}
          />
          {requests.data && rows.length === 0 ? (
            <div className="rounded-(--radius-surface) border bg-card">
              <EmptyState
                title={show === 'waiting' ? 'No one is waiting' : 'Nothing declined lately'}
                description={
                  show === 'waiting'
                    ? 'New sign-ups land here as soon as they send their business details.'
                    : 'Declined requests stay here for 30 days, in case you change your mind.'
                }
              />
            </div>
          ) : (
            <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-[minmax(240px,300px)_1fr]">
              <Panel
                title={show === 'waiting' ? 'Waiting' : 'Declined'}
                className="lg:sticky lg:top-4"
              >
                {!requests.data ? (
                  <Loading />
                ) : (
                  <ul className="flex flex-col divide-y border-t">
                    {rows.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => choose(r.id)}
                          aria-current={open?.id === r.id}
                          className={cn(
                            'flex w-full items-center gap-3 px-5 py-3 text-left transition-colors',
                            open?.id === r.id ? 'bg-muted' : 'hover:bg-muted/60',
                          )}
                        >
                          <Avatar name={r.name} size="sm" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium">{r.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {vendorType(r.vendorType)} · {r.area ?? '—'}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {ago(r.createdAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              {open ? (
                <RequestView key={open.id} id={open.id} />
              ) : (
                <Panel title="Loading">
                  <div className="border-t px-5 py-4">
                    <Skeleton lines={8} />
                  </div>
                </Panel>
              )}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
