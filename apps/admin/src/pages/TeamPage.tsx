import { useMutation, useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/arc/alert/alert';
import { Avatar } from '@/components/arc/avatar/avatar';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Input } from '@/components/arc/input/input';
import { PasswordField } from '@/components/arc/password-field/password-field';
import { Select } from '@/components/arc/select/select';
import {
  SortableDataTable,
  type DataColumn,
} from '@/components/arc/sortable-data-table/sortable-data-table';
import { Switch } from '@/components/arc/switch/switch';
import { Loading, TableScroll } from '@/components/app/admin';
import { Panel } from '@/components/app/panel';
import { api, call, type TeamMember } from '@/lib/api';
import { ago, stamp } from '@/lib/format';
import { refreshAll, useCan, useMe } from '@/lib/query';
import { Page } from '@/ui/Page';

type Role = TeamMember['role'];

const ROLES: { value: Role; label: string; what: string }[] = [
  {
    value: 'SUPPORT',
    label: 'Customer service',
    what: 'Sees everything, approves sign-ups, resets PINs, signs tablets out and writes notes.',
  },
  {
    value: 'ADMIN',
    label: 'Admin',
    what: 'All of that, plus suspending businesses, downloading the audit log and managing this team.',
  },
];
const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)!.label;

function AddDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('SUPPORT');
  const [newLogin, setNewLogin] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const add = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/platform/team', {
          body: newLogin ? { email, role, name, password } : { email, role },
        }),
      ),
    meta: { ok: `${email} is on the team`, quiet: true },
    onSuccess: () => {
      void refreshAll();
      onOpenChange(false);
      setEmail('');
      setName('');
      setPassword('');
      setNewLogin(false);
    },
    onError: (error) => {
      if (error.message.startsWith('There is no Brixx login')) setNewLogin(true);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add someone to the team"
        description="They sign in to this console with their Brixx email login."
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Select
            label="Role"
            description={ROLES.find((r) => r.value === role)!.what}
            value={role}
            onValueChange={(value) => setRole(value as Role)}
            options={ROLES.map(({ value, label }) => ({ value, label }))}
          />
          {newLogin ? (
            <>
              <Input
                label="Their name"
                required
                minLength={2}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <PasswordField
                label="Starting password"
                description="At least 8 characters. Send it to them privately."
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </>
          ) : (
            <button
              type="button"
              className="self-start text-sm font-medium text-accent-strong"
              onClick={() => setNewLogin(true)}
            >
              They don’t have a Brixx login yet
            </button>
          )}
          {add.error && (
            <Alert tone={newLogin ? 'warning' : 'danger'} title="Not added yet">
              {add.error.message}
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={add.isPending}>
              Add to team
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamPage() {
  const can = useCan();
  const me = useMe().data;
  const [adding, setAdding] = useState(false);
  const team = useQuery({
    queryKey: ['team'],
    queryFn: () => call<TeamMember[]>(api.GET('/api/platform/team')),
  });
  const update = useMutation({
    mutationFn: (input: { userId: string; role: Role; active: boolean }) =>
      call(
        api.PUT('/api/platform/team/{userId}', {
          params: { path: { userId: input.userId } },
          body: { role: input.role, active: input.active },
        }),
      ),
    meta: { ok: 'Saved' },
    onSettled: () => void refreshAll(),
  });
  const manage = can('team.manage');

  const columns: DataColumn<TeamMember>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (_, m) => (
        <span className="flex items-center gap-3">
          <Avatar name={m.name} size="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">
              {m.name}
              {m.userId === me?.id && (
                <span className="ml-1.5 text-xs text-muted-foreground">you</span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{m.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (_, m) =>
        manage && m.userId !== me?.id ? (
          <div className="w-48 [&_label]:sr-only">
            <Select
              label={`${m.name}’s role`}
              value={m.role}
              onValueChange={(value) =>
                update.mutate({ userId: m.userId, role: value as Role, active: m.active })
              }
              options={ROLES.map(({ value, label }) => ({ value, label }))}
            />
          </div>
        ) : (
          <Badge tone={m.role === 'ADMIN' ? 'info' : 'neutral'}>{roleLabel(m.role)}</Badge>
        ),
    },
    {
      key: 'lastSignInAt',
      label: 'Last signed in',
      sortable: true,
      render: (v) => ago(v as string),
    },
    {
      key: 'createdAt',
      label: 'Added',
      sortable: true,
      render: (_, m) => (
        <span className="flex flex-col">
          {stamp(m.createdAt)}
          {m.addedByName && (
            <span className="text-xs text-muted-foreground">by {m.addedByName}</span>
          )}
        </span>
      ),
    },
    {
      key: 'active',
      label: 'On the team',
      render: (_, m) =>
        manage && m.userId !== me?.id ? (
          <Switch
            aria-label={`${m.name} is on the team`}
            checked={m.active}
            onCheckedChange={(active) => update.mutate({ userId: m.userId, role: m.role, active })}
          />
        ) : m.active ? (
          <Badge tone="success">Yes</Badge>
        ) : (
          <Badge>No</Badge>
        ),
    },
  ];

  return (
    <Page
      title="Team"
      subtitle="Who at Brixx can open this console, and as what."
      actions={
        manage && (
          <Button onClick={() => setAdding(true)}>
            <UserPlus size={16} strokeWidth={1.75} aria-hidden /> Add someone
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4 md:gap-6">
        {team.error ? (
          <Alert tone="danger" title="The team couldn’t load">
            {team.error.message}
          </Alert>
        ) : (
          <Panel title="The Brixx team">
            {!team.data ? (
              <Loading />
            ) : (
              <TableScroll>
                <SortableDataTable
                  rows={team.data}
                  columns={columns}
                  rowKey="userId"
                  caption="The Brixx team"
                />
              </TableScroll>
            )}
          </Panel>
        )}
        <div className="grid gap-4 md:gap-6 sm:grid-cols-2">
          {ROLES.map((r) => (
            <Panel key={r.value} title={r.label}>
              <p className="border-t px-5 py-4 text-sm text-text-secondary">{r.what}</p>
            </Panel>
          ))}
        </div>
      </div>
      <AddDialog open={adding} onOpenChange={setAdding} />
    </Page>
  );
}
