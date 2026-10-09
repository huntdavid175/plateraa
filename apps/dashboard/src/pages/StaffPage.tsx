import { pinProblem } from '@plateraa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  FieldLabel,
  PillFilter,
  Spinner,
  Tag,
  TextInput,
  Toggle,
} from '../ui/controls';
import { Dialog } from '../ui/Dialog';
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
      actions={
        <Button small onClick={() => setAdding(true)}>
          + Add staff
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl">
        {team.isPending && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}
        {team.isError && <ErrorNote>{team.error.message}</ErrorNote>}
        {team.data && (
          <>
            <Card className="mb-6 overflow-hidden">
              {team.data.staff.map((member) => (
                <StaffRow
                  key={member.id}
                  member={member}
                  canEdit={canEdit(me.role, member)}
                  onEdit={() => setEditing(member)}
                />
              ))}
            </Card>
            {isOwner && <RevenueCard byRole={team.data.revenueByRole} />}
          </>
        )}
        {tablets.data && <TabletsCard tablets={tablets.data} />}
      </div>

      {adding && <AddStaffDialog isOwner={isOwner} onClose={() => setAdding(false)} />}
      {editing && (
        <EditStaffDialog member={editing} isOwner={isOwner} onClose={() => setEditing(null)} />
      )}
    </Page>
  );
}

/** Managers look after staff and riders; only the owner changes managers, and nobody the owner. */
function canEdit(myRole: string, member: TeamMember): boolean {
  if (member.role === 'OWNER') return member.you;
  return myRole === 'OWNER' || member.role === 'STAFF' || member.role === 'RIDER';
}

function StaffRow({
  member,
  canEdit: editable,
  onEdit,
}: {
  member: TeamMember;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tile text-sm font-bold text-muted-foreground">
        {member.displayName.trim().charAt(0).toUpperCase() || '?'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.displayName}
          {member.you && <span className="text-muted-foreground"> (you)</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Tag>{ROLE_WORDS[member.role]}</Tag>
          {!member.active && <Badge tone="neutral">Switched off</Badge>}
          {member.active && member.pinLocked && <Badge tone="amber">PIN locked</Badge>}
          {member.active && !member.hasPin && <Badge tone="amber">No PIN yet</Badge>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={
            member.active ? 'h-2 w-2 rounded-full bg-green' : 'h-2 w-2 rounded-full bg-tile'
          }
        />
        {editable && (
          <button
            type="button"
            onClick={onEdit}
            className="text-sm text-muted-foreground hover:text-text"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

function RevenueCard({ byRole }: { byRole: RevenueByRole }) {
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
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <p className="text-sm font-semibold">Who sees sales totals</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Sales totals, profit and margins, on the dashboard and the tablet. A person can be set
          differently from their role under Edit.
        </p>
      </div>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <span className="text-sm">Owner</span>
        <Toggle on onChange={() => undefined} label="Owner sees sales totals" disabled />
      </div>
      {(['MANAGER', 'STAFF', 'RIDER'] as const).map((role) => (
        <div
          key={role}
          className="flex items-center justify-between border-b border-border px-5 py-4 last:border-b-0"
        >
          <span className="text-sm">{ROLE_WORDS[role]}</span>
          <Toggle
            on={shown[role]}
            onChange={(on) => set(role, on)}
            label={`${ROLE_WORDS[role]} sees sales totals`}
          />
        </div>
      ))}
      {saving.error && (
        <div className="p-4">
          <ErrorNote>{saving.error.message}</ErrorNote>
        </div>
      )}
    </Card>
  );
}

function TabletsCard({ tablets }: { tablets: Tablet[] }) {
  const signingOut = useMutation({
    meta: { ok: 'Tablet signed out' },
    mutationFn: signOutTablet,
    onSuccess: refreshTeam,
  });
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <p className="text-sm font-semibold">Tablets</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          To add one: install Plateraa on the tablet, sign in with your email and pick this
          business.
        </p>
      </div>
      {tablets.length === 0 && (
        <p className="px-5 py-6 text-sm text-muted-foreground">No tablet is set up yet.</p>
      )}
      {tablets.map((tablet) => (
        <div
          key={tablet.id}
          className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {tablet.name}{' '}
              <span className="text-muted-foreground">
                · orders {tablet.code}1, {tablet.code}2…
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tablet.signedOut
                ? 'Signed out'
                : tablet.lastSeenAt
                  ? `Last online ${ago(tablet.lastSeenAt)}`
                  : 'Not online yet'}
              {!tablet.signedOut && tablet.lastSyncedAt
                ? ` · fully synced ${ago(tablet.lastSyncedAt)}`
                : ''}
            </p>
            {tablet.alerts.map((alert) => (
              <p
                key={alert.kind}
                className={`mt-1 text-xs font-medium ${alertTone(alert) === 'red' ? 'text-red' : 'text-amber'}`}
              >
                {tabletAlertWords(tablet.name, alert)}
              </p>
            ))}
          </div>
          {!tablet.signedOut && (
            <Button
              variant="ghost"
              small
              busy={signingOut.isPending && signingOut.variables === tablet.id}
              onClick={() => {
                if (
                  window.confirm(
                    `Sign out ${tablet.name}? It stops syncing at once. Anything it hasn't uploaded stays on it, and it has to be set up again.`,
                  )
                ) {
                  signingOut.mutate(tablet.id);
                }
              }}
            >
              Sign out
            </Button>
          )}
        </div>
      ))}
      {signingOut.error && (
        <div className="p-4">
          <ErrorNote>{signingOut.error.message}</ErrorNote>
        </div>
      )}
    </Card>
  );
}

function PinFields({
  pin,
  again,
  onPin,
  onAgain,
  label,
}: {
  pin: string;
  again: string;
  onPin: (value: string) => void;
  onAgain: (value: string) => void;
  label: string;
}) {
  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel htmlFor="pin">{label}</FieldLabel>
        <TextInput
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          className="font-mono tracking-widest"
          value={pin}
          onChange={(event) => onPin(digits(event.target.value))}
        />
      </div>
      <div>
        <FieldLabel htmlFor="pin-again">Same PIN again</FieldLabel>
        <TextInput
          id="pin-again"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          className="font-mono tracking-widest"
          value={again}
          onChange={(event) => onAgain(digits(event.target.value))}
        />
      </div>
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
  const options: { value: StaffRole; label: string }[] = [
    { value: 'STAFF', label: 'Staff' },
    { value: 'RIDER', label: 'Rider' },
    ...(isOwner ? [{ value: 'MANAGER' as const, label: 'Manager' }] : []),
  ];
  return (
    <div>
      <FieldLabel>Role</FieldLabel>
      <PillFilter label="Role" options={options} value={value} onChange={onChange} />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {value === 'MANAGER'
          ? 'Managers can also give refunds, pay out and set up the menu. They sign in to this dashboard with their own email.'
          : value === 'RIDER'
            ? 'Riders only see and update deliveries.'
            : 'Staff take orders, take cash and look after the drawer.'}
      </p>
    </div>
  );
}

function AddStaffDialog({ isOwner, onClose }: { isOwner: boolean; onClose: () => void }) {
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
    <Dialog title="Add staff" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <div>
          <FieldLabel htmlFor="staff-name">Name</FieldLabel>
          <TextInput
            id="staff-name"
            autoFocus
            maxLength={60}
            value={name}
            placeholder="As it shows on the tablet"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <RolePicker value={role} onChange={setRole} isOwner={isOwner} />
        <PinFields pin={pin} again={again} onPin={setPin} onAgain={setAgain} label="Their PIN" />
        <p className="text-xs text-muted-foreground">
          They unlock the tablet with it. Tell them in person; it isn’t shown anywhere.
        </p>
        {pin.length === 6 && problem && <p className="text-xs text-amber">{problem}</p>}
        {saving.error && <ErrorNote>{saving.error.message}</ErrorNote>}
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" full disabled={!!problem} busy={saving.isPending}>
            Add {name.trim() || 'staff'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const REVENUE_CHOICES = [
  { value: 'role', label: 'Role setting' },
  { value: 'yes', label: 'Always' },
  { value: 'no', label: 'Never' },
] as const;
type RevenueChoice = (typeof REVENUE_CHOICES)[number]['value'];

function EditStaffDialog({
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
    <Dialog title={`Edit ${member.displayName}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <div>
          <FieldLabel htmlFor="edit-name">Name</FieldLabel>
          <TextInput
            id="edit-name"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        {!isTheOwner && <RolePicker value={role} onChange={setRole} isOwner={isOwner} />}
        {!isTheOwner && !member.you && (
          <div className="flex items-center justify-between rounded-xl bg-tile px-4 py-3">
            <div>
              <p className="text-sm font-medium">Switched on</p>
              <p className="text-xs text-muted-foreground">
                Switched off, they can’t unlock a tablet or sign in.
              </p>
            </div>
            <Toggle on={active} onChange={setActive} label="Switched on" />
          </div>
        )}
        {isOwner && !isTheOwner && (
          <div>
            <FieldLabel>Sees sales totals</FieldLabel>
            <PillFilter
              label="Sees sales totals"
              options={REVENUE_CHOICES}
              value={revenue}
              onChange={setRevenue}
            />
          </div>
        )}
        <div className="border-t border-border pt-4">
          <PinFields
            pin={pin}
            again={again}
            onPin={setPin}
            onAgain={setAgain}
            label={member.hasPin ? 'New PIN (optional)' : 'PIN'}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {member.pinLocked
              ? 'Their PIN is locked after too many wrong tries. A new PIN unlocks it.'
              : 'Leave blank to keep their PIN.'}
          </p>
        </div>
        {pinTyped && pin.length === 6 && problem && <p className="text-xs text-amber">{problem}</p>}
        {saving.error && <ErrorNote>{saving.error.message}</ErrorNote>}
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" full disabled={!!problem} busy={saving.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
