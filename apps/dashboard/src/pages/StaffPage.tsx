import { pinProblem } from '@brixx/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/arc/alert/alert';
import { Avatar } from '@/components/arc/avatar/avatar';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { ConfirmMorph } from '@/components/arc/confirm-morph/confirm-morph';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Input } from '@/components/arc/input/input';
import { RadioGroup } from '@/components/arc/radio-group/radio-group';
import { Switch } from '@/components/arc/switch/switch';
import { PlainField } from '@/components/app/money-field';
import { Panel, PanelRows } from '@/components/app/panel';
import { SwitchRow } from '@/components/app/setting-row';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ago } from '../lib/money';
import { saveInPlace } from '../lib/save-in-place';
import { useSession } from '../lib/session';
import {
  addStaff,
  fetchTablets,
  fetchTeam,
  refreshTeam,
  resetPin,
  setRevenueVisibility,
  signOutTablet,
  updateStaff,
  type RevenueByRole,
  type Tablet,
  type TeamMember,
} from '../lib/team';
import { alertTone, tabletAlertWords } from '../lib/tablet-alerts';
import { ROLE_WORDS } from '../lib/words';
import { useMe } from '../shell/Shell';
import { Page } from '../ui/Page';

type StaffRole = 'MANAGER' | 'STAFF' | 'RIDER';

export function StaffPage() {
  const me = useMe();
  const { tenantId } = useSession();
  const isOwner = me.role === 'OWNER';
  const team = useQuery({ queryKey: ['team', tenantId], queryFn: fetchTeam });
  const tablets = useQuery({
    queryKey: ['tablets', tenantId],
    queryFn: fetchTablets,
    enabled: me.capabilities.includes('devices.manage'),
  });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  return (
    <Page
      title="Staff"
      subtitle="Who works the tablet and the dashboard, and the tablets themselves."
      actions={
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} strokeWidth={1.75} aria-hidden />
          Add staff
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {team.isPending && (
          <Skeleton className="h-64 w-full rounded-(--radius-surface)" aria-busy="true" />
        )}
        {team.isError && (
          <Alert tone="danger" title="Couldn’t load your team">
            {team.error.message}
          </Alert>
        )}
        {team.data && (
          <>
            <section aria-label="Team">
              <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {team.data.staff.map((member) => (
                  <PersonCard
                    key={member.id}
                    member={member}
                    canEdit={canEdit(me.role, member)}
                    onEdit={() => setEditing(member)}
                  />
                ))}
              </ul>
            </section>
            {isOwner && <RevenuePanel byRole={team.data.revenueByRole} />}
          </>
        )}
        {tablets.data && <TabletsPanel tablets={tablets.data} />}
      </div>

      <Dialog
        open={adding || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
      >
        {adding && <AddStaff isOwner={isOwner} onClose={() => setAdding(false)} />}
        {editing && (
          <EditStaff member={editing} isOwner={isOwner} onClose={() => setEditing(null)} />
        )}
      </Dialog>
    </Page>
  );
}

/** Managers look after staff and riders; only the owner changes managers, and nobody the owner. */
function canEdit(myRole: string, member: TeamMember): boolean {
  if (member.role === 'OWNER') return member.you;
  return myRole === 'OWNER' || member.role === 'STAFF' || member.role === 'RIDER';
}

/** One person as a card: their avatar, name, role and anything to sort out. */
function PersonCard({
  member,
  canEdit: editable,
  onEdit,
}: {
  member: TeamMember;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <li
      className={cn(
        'flex flex-col gap-4 rounded-(--radius-surface) border bg-card p-4 sm:p-5',
        !member.active && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Avatar name={member.displayName} size="lg" />
        {editable && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate font-medium">
          {member.displayName}
          {member.you && <span className="font-normal text-muted-foreground"> (you)</span>}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge size="sm">{ROLE_WORDS[member.role]}</Badge>
          {!member.active && <Badge size="sm">Switched off</Badge>}
          {member.active && member.pinLocked && (
            <Badge tone="warning" size="sm">
              PIN locked
            </Badge>
          )}
          {member.active && !member.hasPin && (
            <Badge tone="warning" size="sm">
              No PIN yet
            </Badge>
          )}
        </span>
      </div>
    </li>
  );
}

function RevenuePanel({ byRole }: { byRole: RevenueByRole }) {
  const { tenantId } = useSession();
  const saving = useMutation({
    mutationFn: setRevenueVisibility,
    meta: { ok: 'Saved who sees sales totals' },
    // Switches move at once and stay put; they go back if saving fails.
    ...saveInPlace(
      ['team', tenantId],
      (team: Awaited<ReturnType<typeof fetchTeam>>, next: RevenueByRole) => ({
        ...team,
        revenueByRole: next,
      }),
    ),
    onSettled: refreshTeam,
  });
  const shown = byRole;
  const set = (role: keyof RevenueByRole, on: boolean) => saving.mutate({ ...shown, [role]: on });

  return (
    <Panel
      title="Who sees sales totals"
      description="Sales totals, profit and margins, on the dashboard and the tablet. A person can be set differently from their role under Edit."
    >
      <PanelRows>
        <SwitchRow title="Owner" detail="Always." on onChange={() => undefined} disabled />
        {(['MANAGER', 'STAFF', 'RIDER'] as const).map((role) => (
          <SwitchRow
            key={role}
            title={ROLE_WORDS[role]}
            on={shown[role]}
            onChange={(on) => set(role, on)}
          />
        ))}
      </PanelRows>
      {saving.error && (
        <div className="border-t p-5">
          <Alert tone="danger" title="Couldn’t save">
            {saving.error.message}
          </Alert>
        </div>
      )}
    </Panel>
  );
}

function TabletsPanel({ tablets }: { tablets: Tablet[] }) {
  return (
    <section aria-labelledby="tablets" className="flex flex-col gap-3">
      <div>
        <h2 id="tablets" className="font-medium">
          Tablets
        </h2>
        <p className="text-sm text-muted-foreground">
          To add one: install Brixx on the tablet, sign in with your email and pick this business.
        </p>
      </div>
      {tablets.length === 0 ? (
        <p className="rounded-(--radius-surface) border bg-card p-5 text-sm text-muted-foreground">
          No tablet is set up yet.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {tablets.map((tablet) => (
            <TabletCard key={tablet.id} tablet={tablet} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Seen in the last five minutes counts as online (the tablet checks in every minute or so). */
const ONLINE_MS = 5 * 60_000;

function TabletCard({ tablet }: { tablet: Tablet }) {
  const signingOut = useMutation({
    meta: { ok: 'Tablet signed out' },
    mutationFn: signOutTablet,
    onSuccess: refreshTeam,
  });
  const online =
    !tablet.signedOut &&
    tablet.lastSeenAt !== null &&
    Date.now() - new Date(tablet.lastSeenAt).getTime() < ONLINE_MS;
  return (
    <li className="flex flex-col gap-4 rounded-(--radius-surface) border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 font-medium">
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                tablet.signedOut ? 'bg-muted-foreground' : online ? 'bg-success' : 'bg-warning',
              )}
              aria-hidden
            />
            {tablet.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {tablet.signedOut
              ? 'Signed out'
              : online
                ? 'Online now'
                : tablet.lastSeenAt
                  ? `Last online ${ago(tablet.lastSeenAt)}`
                  : 'Not online yet'}
          </span>
        </div>
        <Badge size="sm">
          Orders {tablet.code}1, {tablet.code}2…
        </Badge>
      </div>
      {!tablet.signedOut && (
        <p className="text-sm text-text-secondary">
          {tablet.lastSyncedAt
            ? `Fully synced ${ago(tablet.lastSyncedAt)}.`
            : 'Hasn’t finished a sync yet.'}
        </p>
      )}
      {tablet.alerts.map((alert) => (
        <Alert
          key={alert.kind}
          tone={alertTone(alert) === 'red' ? 'danger' : 'warning'}
          title={alertTone(alert) === 'red' ? 'Needs someone now' : 'Probably the connection'}
        >
          {tabletAlertWords(tablet.name, alert)}
        </Alert>
      ))}
      {!tablet.signedOut && (
        <div className="mt-auto">
          {/* Arc's confirm morph: the button asks in place, then signs it out. */}
          <ConfirmMorph
            label="Sign out"
            prompt={`Sign out ${tablet.name}?`}
            confirmLabel="Sign out"
            pendingLabel="Signing out"
            doneLabel="Signed out"
            onConfirm={() => signingOut.mutateAsync(tablet.id)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            It stops syncing at once. Anything it hasn’t uploaded stays on it, and it has to be set
            up again.
          </p>
        </div>
      )}
    </li>
  );
}

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

/** A new PIN, typed twice. It's never shown, so there's no "show" button either. */
function PinFields({
  pin,
  again,
  onPin,
  onAgain,
  label,
  description,
}: {
  pin: string;
  again: string;
  onPin: (value: string) => void;
  onAgain: (value: string) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <PlainField
          label={label}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(value) => onPin(digits(value))}
        />
        <PlainField
          label="Same PIN again"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={again}
          onChange={(value) => onAgain(digits(value))}
        />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

/** What's wrong with a new PIN, in words, or null. */
function pinWords(pin: string, again: string): string | null {
  if (pin.length < 6) return 'The PIN is 6 digits.';
  const problem = pinProblem(pin);
  if (problem) return `${problem}.`;
  if (pin !== again) return 'The two PINs don’t match.';
  return null;
}

function RolePicker({
  value,
  onChange,
  isOwner,
}: {
  value: StaffRole;
  onChange: (role: StaffRole) => void;
  isOwner: boolean;
}) {
  return (
    <RadioGroup
      label="Role"
      value={value}
      onValueChange={(role) => onChange(role as StaffRole)}
      options={[
        {
          value: 'STAFF',
          label: 'Staff',
          description: 'Take orders, take cash and look after the drawer.',
        },
        { value: 'RIDER', label: 'Rider', description: 'Only see and update deliveries.' },
        ...(isOwner
          ? [
              {
                value: 'MANAGER',
                label: 'Manager',
                description:
                  'Also give refunds, pay out and set up the menu. They sign in to this dashboard with their own email.',
              },
            ]
          : []),
      ]}
    />
  );
}

function AddStaff({ isOwner, onClose }: { isOwner: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('STAFF');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const problem = !name.trim() ? 'Type their name.' : pinWords(pin, again);
  const saving = useMutation({
    mutationFn: () => addStaff({ displayName: name.trim(), role, pin }),
    meta: { ok: 'Staff member added' },
    onSuccess: () => {
      refreshTeam();
      onClose();
    },
  });

  return (
    <DialogContent title="Add staff">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <Input
          label="Name"
          autoFocus
          maxLength={60}
          value={name}
          placeholder="As it shows on the tablet"
          onChange={(event) => setName(event.target.value)}
        />
        <RolePicker value={role} onChange={setRole} isOwner={isOwner} />
        <PinFields
          pin={pin}
          again={again}
          onPin={setPin}
          onAgain={setAgain}
          label="Their PIN"
          description="They unlock the tablet with it. Tell them in person; it isn’t shown anywhere."
        />
        {pin.length === 6 && problem && <p className="text-sm text-warning">{problem}</p>}
        {saving.error && (
          <Alert tone="danger" title="Couldn’t add them">
            {saving.error.message}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!!problem} loading={saving.isPending}>
            Add {name.trim() || 'staff'}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

const REVENUE_CHOICES = [
  { value: 'role', label: 'As their role is set' },
  { value: 'yes', label: 'Always' },
  { value: 'no', label: 'Never' },
] as const;
type RevenueChoice = (typeof REVENUE_CHOICES)[number]['value'];

function EditStaff({
  member,
  isOwner,
  onClose,
}: {
  member: TeamMember;
  isOwner: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(member.displayName);
  const [role, setRole] = useState<StaffRole>(member.role === 'OWNER' ? 'MANAGER' : member.role);
  const [active, setActive] = useState(member.active);
  const [revenue, setRevenue] = useState<RevenueChoice>(
    member.seesRevenue === null ? 'role' : member.seesRevenue ? 'yes' : 'no',
  );
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const isTheOwner = member.role === 'OWNER';
  const pinTyped = pin.length > 0 || again.length > 0;
  const problem = !name.trim() ? 'Type their name.' : pinTyped ? pinWords(pin, again) : null;

  const saving = useMutation({
    meta: { ok: 'Staff member saved' },
    mutationFn: async () => {
      await updateStaff(member.id, {
        displayName: name.trim(),
        ...(isTheOwner ? {} : { role, active }),
        ...(isOwner && !isTheOwner
          ? { seesRevenue: revenue === 'role' ? null : revenue === 'yes' }
          : {}),
      });
      if (pinTyped) await resetPin(member.id, pin);
    },
    onSuccess: () => {
      refreshTeam();
      onClose();
    },
  });

  return (
    <DialogContent title={`Edit ${member.displayName}`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <Input
          label="Name"
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {!isTheOwner && <RolePicker value={role} onChange={setRole} isOwner={isOwner} />}
        {!isTheOwner && !member.you && (
          <div className="flex items-center justify-between gap-4 rounded-(--radius-panel) border px-4 py-3">
            <div>
              <p className="text-sm font-medium" id="switched-on">
                Switched on
              </p>
              <p className="text-xs text-muted-foreground">
                Switched off, they can’t unlock a tablet or sign in.
              </p>
            </div>
            <Switch aria-labelledby="switched-on" checked={active} onCheckedChange={setActive} />
          </div>
        )}
        {isOwner && !isTheOwner && (
          <RadioGroup
            label="Sees sales totals"
            value={revenue}
            onValueChange={(value) => setRevenue(value as RevenueChoice)}
            options={[...REVENUE_CHOICES]}
          />
        )}
        <PinFields
          pin={pin}
          again={again}
          onPin={setPin}
          onAgain={setAgain}
          label={member.hasPin ? 'New PIN' : 'PIN'}
          description={
            member.pinLocked
              ? 'Their PIN is locked after too many wrong tries. A new PIN unlocks it.'
              : 'Leave both blank to keep their PIN.'
          }
        />
        {pinTyped && pin.length === 6 && problem && (
          <p className="text-sm text-warning">{problem}</p>
        )}
        {saving.error && (
          <Alert tone="danger" title="Couldn’t save">
            {saving.error.message}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!!problem} loading={saving.isPending}>
            Save
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
