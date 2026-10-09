import { VENDOR_TYPES, type VendorType } from '@plateraa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ulid } from 'ulid';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Input } from '@/components/arc/input/input';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Select } from '@/components/arc/select/select';
import { Switch } from '@/components/arc/switch/switch';
import { MoneyField } from '@/components/app/money-field';
import { Panel, PanelEmpty, PanelRows } from '@/components/app/panel';
import { SettingRow, SwitchRow } from '@/components/app/setting-row';
import { Skeleton } from '@/components/ui/skeleton';
import { amountText, cedis, parseAmount } from '../lib/money';
import { saveInPlace } from '../lib/save-in-place';
import { useSession } from '../lib/session';
import {
  fetchSettings,
  refreshSettings,
  saveBusiness,
  saveMoolre,
  saveOrderSettings,
  type OrderSettings,
  type Settings,
} from '../lib/settings';
import { refreshStorefront } from '../lib/storefront';
import { setTheme, useThemeChoice, type ThemeChoice } from '../lib/theme';
import { VENDOR_TYPE_WORDS } from '../lib/words';
import { fetchZones, refreshZones, removeZone, saveZone, type Zone } from '../lib/zones';
import { useMe } from '../shell/Shell';
import { Page } from '../ui/Page';

const IDLE_CHOICES = [60, 180, 300, 600, 900];

export function SettingsPage() {
  const me = useMe();
  const { tenantId } = useSession();
  const isOwner = me.capabilities.includes('settings.manage');
  const setsUpMenu = me.capabilities.includes('catalog.manage');
  const settings = useQuery({
    queryKey: ['settings', tenantId],
    queryFn: fetchSettings,
    enabled: isOwner,
  });

  return (
    <Page title="Settings" narrow>
      <div className="flex flex-col gap-6">
        {isOwner && settings.isPending && (
          <Skeleton className="h-48 w-full rounded-(--radius-surface)" aria-busy="true" />
        )}
        {settings.isError && (
          <Alert tone="danger" title="Couldn’t load your settings">
            {settings.error.message}
          </Alert>
        )}
        {settings.data && <BusinessPanel business={settings.data.business} />}
        {!isOwner && (
          <Panel title="Business">
            <PanelRows>
              <SettingRow title="Business name">
                <span className="text-sm text-text-secondary">{me.businessName}</span>
              </SettingRow>
              <SettingRow title="Type">
                <span className="text-sm text-text-secondary">
                  {VENDOR_TYPE_WORDS[me.vendorType]}
                </span>
              </SettingRow>
            </PanelRows>
          </Panel>
        )}

        <AppearancePanel />

        {settings.data && <OrdersPanel orders={settings.data.orders} />}
        {setsUpMenu && <DeliveryPanel />}
        {settings.data && <PaymentsPanel settings={settings.data} />}
        {isOwner && <SetupGuidePanel />}
        {!isOwner && (
          <p className="text-sm text-muted-foreground">
            Only the owner changes how orders and payments work.
          </p>
        )}
      </div>
    </Page>
  );
}

function AppearancePanel() {
  const theme = useThemeChoice();
  return (
    <Panel title="Appearance">
      <PanelRows>
        <SettingRow
          title="Light or dark"
          detail="On this browser. System follows the device’s own setting."
        >
          <SegmentedControl
            label="Light or dark"
            value={theme}
            onValueChange={(value) => setTheme(value as ThemeChoice)}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        </SettingRow>
      </PanelRows>
    </Panel>
  );
}

function BusinessPanel({ business }: { business: Settings['business'] }) {
  const [name, setName] = useState(business.name);
  const [type, setType] = useState<VendorType>(business.vendorType);
  const changed = name.trim() !== business.name || type !== business.vendorType;
  const saving = useMutation({
    mutationFn: () => saveBusiness({ name: name.trim(), vendorType: type }),
    meta: { ok: 'Business details saved' },
    onSuccess: refreshSettings,
  });

  return (
    <Panel title="Business">
      <div className="flex flex-col gap-4 border-t p-5">
        <Input
          label="Business name"
          description="On receipts, and in the payment link texts."
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Select
          label="Type"
          value={type}
          onValueChange={(value) => setType(value as VendorType)}
          options={VENDOR_TYPES.map((value) => ({ value, label: VENDOR_TYPE_WORDS[value] }))}
        />
        {saving.error && (
          <Alert tone="danger" title="Couldn’t save">
            {saving.error.message}
          </Alert>
        )}
        {changed && (
          <Button
            className="self-start"
            loading={saving.isPending}
            disabled={name.trim().length < 2}
            onClick={() => saving.mutate()}
          >
            Save
          </Button>
        )}
      </div>
    </Panel>
  );
}

function OrdersPanel({ orders }: { orders: OrderSettings }) {
  const { tenantId } = useSession();
  const saving = useMutation({
    mutationFn: saveOrderSettings,
    meta: { ok: 'Settings saved' },
    // Switches move at once and stay put; they go back if saving fails.
    ...saveInPlace(['settings', tenantId], (settings: Settings, next: OrderSettings) => ({
      ...settings,
      orders: next,
    })),
    onSettled: refreshSettings,
  });
  const shown = orders;
  const set = (patch: Partial<OrderSettings>) => saving.mutate({ ...shown, ...patch });
  const idleChoices = [...new Set([...IDLE_CHOICES, shown.idleLockSeconds])].sort((a, b) => a - b);

  return (
    <Panel title="Orders">
      <PanelRows>
        <SwitchRow
          title="Dine-in"
          detail="Customers can eat here. The tablet offers Dine-in beside Pickup and Delivery."
          on={shown.offersDineIn}
          onChange={(on) => set({ offersDineIn: on })}
        />
        <SwitchRow
          title="Pay before prep"
          detail="Orders don’t go to the kitchen until they’re paid. The payment that clears one sends it straight there."
          on={shown.requirePaymentBeforePrep}
          onChange={(on) => set({ requirePaymentBeforePrep: on })}
        />
        <SwitchRow
          title="Count portions each morning"
          detail="Staff add how many portions are ready on the tablet’s Stock tab. Sales count down, and an item sells out by itself at zero."
          on={shown.countPortions}
          onChange={(on) => set({ countPortions: on })}
        />
        <SettingRow
          title="Lock an idle tablet after"
          detail="Then the next person unlocks it with their PIN."
        >
          <Select
            label="Minutes"
            className="w-28"
            value={String(shown.idleLockSeconds)}
            onValueChange={(value) => set({ idleLockSeconds: Number(value) })}
            options={idleChoices.map((seconds) => ({
              value: String(seconds),
              label: `${Math.round(seconds / 60)} min`,
            }))}
          />
        </SettingRow>
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

/** Delivery zones: the tablet fills in a zone's fee when it's picked for a delivery. */
function DeliveryPanel() {
  const { tenantId } = useSession();
  const zones = useQuery({ queryKey: ['zones', tenantId], queryFn: fetchZones });
  const [editing, setEditing] = useState<Zone | 'new' | null>(null);

  return (
    <Panel
      title="Delivery zones"
      description="Each area you deliver to, with its fee. The tablet fills in the fee when someone picks the zone."
      action={
        zones.data && (
          <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            Add zone
          </Button>
        )
      }
    >
      {zones.isPending && (
        <div className="border-t p-5">
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {zones.isError && (
        <div className="border-t p-5">
          <Alert tone="danger" title="Couldn’t load the zones">
            {zones.error.message}
          </Alert>
        </div>
      )}
      {zones.data?.length === 0 && <PanelEmpty>No zones yet.</PanelEmpty>}
      {zones.data && zones.data.length > 0 && (
        <PanelRows>
          {zones.data.map((zone) => (
            <SettingRow
              key={zone.id}
              title={zone.name}
              detail={zone.active ? undefined : 'Off the tablet'}
            >
              <span className="flex items-center gap-3">
                <span className="font-mono text-sm">{cedis(zone.fee)}</span>
                <Button variant="ghost" size="sm" onClick={() => setEditing(zone)}>
                  Edit
                </Button>
              </span>
            </SettingRow>
          ))}
        </PanelRows>
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <ZoneForm zone={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
        )}
      </Dialog>
    </Panel>
  );
}

function ZoneForm({ zone, onClose }: { zone: Zone | null; onClose: () => void }) {
  // Made once, when the dialog opens, so pressing Save again after a lost reply adds it once.
  const [id] = useState(() => zone?.id ?? ulid());
  const [name, setName] = useState(zone?.name ?? '');
  const [feeText, setFeeText] = useState(zone ? amountText(zone.fee) : '');
  const [active, setActive] = useState(zone?.active ?? true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fee = parseAmount(feeText);
  const ready = name.trim().length > 0 && fee !== null;
  const done = () => {
    refreshZones();
    refreshStorefront();
    onClose();
  };
  const saving = useMutation({
    mutationFn: () => saveZone(id, { name: name.trim(), fee: fee!, active }),
    meta: { ok: 'Delivery zone saved' },
    onSuccess: done,
  });
  const removing = useMutation({
    meta: { ok: 'Delivery zone removed' },
    mutationFn: () => removeZone(id),
    onSuccess: done,
  });
  const error = saving.error ?? removing.error;

  return (
    <DialogContent title={zone ? `Edit ${zone.name}` : 'Add a delivery zone'}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) saving.mutate();
        }}
      >
        <Input
          label="Area"
          maxLength={40}
          autoFocus
          placeholder="For example: Osu"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <MoneyField
          label="Delivery fee"
          description={
            feeText.trim() !== '' && fee === null
              ? 'Type the fee as an amount, like 15 or 15.50.'
              : 'Staff can still change it on the tablet for one order.'
          }
          value={feeText}
          onChange={setFeeText}
        />
        <div className="flex items-center justify-between gap-4 rounded-(--radius-panel) border px-4 py-3">
          <div>
            <p className="text-sm font-medium" id="zone-on">
              On the tablet
            </p>
            <p className="text-xs text-muted-foreground">
              Switch it off for a while without losing it.
            </p>
          </div>
          <Switch aria-labelledby="zone-on" checked={active} onCheckedChange={setActive} />
        </div>
        {error && (
          <Alert tone="danger" title="Couldn’t save">
            {error.message}
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {zone ? (
            // Two presses: the first asks, the second removes it.
            <Button
              variant="danger"
              loading={removing.isPending}
              onClick={() => (confirmRemove ? removing.mutate() : setConfirmRemove(true))}
            >
              {confirmRemove ? 'Yes, the tablet stops offering it' : 'Remove'}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready} loading={saving.isPending}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}

/**
 * The vendor's own Moolre account. Bolt Food and Chowdeck commissions are kept on the server but
 * not shown until their APIs connect.
 */
function PaymentsPanel({ settings }: { settings: Settings }) {
  const [connecting, setConnecting] = useState(false);
  const { moolre } = settings;
  return (
    <Panel
      title="Payments"
      description={
        moolre.connected
          ? 'Money paid online and by payment link goes straight into your own Moolre account.'
          : 'Without a Moolre account, payment links can’t go out, so customers can only pay cash.'
      }
    >
      <PanelRows>
        <SettingRow
          title="Moolre account"
          detail={
            moolre.connected ? (
              <Badge tone="success" size="sm">
                Connected, ending {moolre.accountEnding}
              </Badge>
            ) : (
              <Badge tone="warning" size="sm">
                Not connected
              </Badge>
            )
          }
        >
          <Button
            variant={moolre.connected ? 'secondary' : 'primary'}
            onClick={() => setConnecting(true)}
          >
            {moolre.connected ? 'Change' : 'Connect'}
          </Button>
        </SettingRow>
      </PanelRows>
      <Dialog open={connecting} onOpenChange={setConnecting}>
        {connecting && <MoolreForm current={moolre} onClose={() => setConnecting(false)} />}
      </Dialog>
    </Panel>
  );
}

function MoolreForm({ current, onClose }: { current: Settings['moolre']; onClose: () => void }) {
  const [apiUser, setApiUser] = useState(current.apiUser ?? '');
  const [publicKey, setPublicKey] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [email, setEmail] = useState(current.email ?? '');
  const ready =
    apiUser.trim() &&
    publicKey.trim().length >= 8 &&
    /^\d{6,20}$/.test(accountNumber.trim()) &&
    email.includes('@');
  const saving = useMutation({
    meta: { ok: 'Moolre account saved' },
    mutationFn: () =>
      saveMoolre({
        apiUser: apiUser.trim(),
        publicKey: publicKey.trim(),
        accountNumber: accountNumber.trim(),
        email: email.trim(),
      }),
    onSuccess: () => {
      refreshSettings();
      refreshStorefront();
      onClose();
    },
  });

  return (
    <DialogContent
      title="Your Moolre account"
      description="Payment-link money goes straight into this account; it never passes through Plateraa. Find these on app.moolre.com. Only the public key is needed, never the private one."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) saving.mutate();
        }}
      >
        <Input
          label="Username"
          autoComplete="off"
          autoFocus
          value={apiUser}
          onChange={(event) => setApiUser(event.target.value)}
        />
        <Input
          label="Public key"
          type="password"
          autoComplete="off"
          placeholder={current.connected ? 'Type it again to change the account' : undefined}
          value={publicKey}
          onChange={(event) => setPublicKey(event.target.value)}
        />
        <Input
          label="Moolre account number"
          inputMode="numeric"
          autoComplete="off"
          placeholder={current.accountEnding ? `Ends ${current.accountEnding}` : undefined}
          value={accountNumber}
          onChange={(event) => setAccountNumber(event.target.value)}
        />
        <Input
          label="Email on the account"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {saving.isPending && (
          <p className="text-sm text-muted-foreground" role="status">
            Asking Moolre whether it knows this account…
          </p>
        )}
        {saving.error && (
          <Alert tone="danger" title="Moolre didn’t accept it">
            {saving.error.message}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready} loading={saving.isPending}>
            Check and save
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

/** The onboarding again, from the menu step, for an owner who skipped parts of it. */
function SetupGuidePanel() {
  const navigate = useNavigate();
  return (
    <Panel title="Setup guide">
      <PanelRows>
        <SettingRow
          title="Go through setup again"
          detail="A starter menu and its prices, staff PINs, Moolre and the tablet, one step at a time."
        >
          <Button
            variant="secondary"
            onClick={() => navigate('/setup', { state: { back: '/settings' } })}
          >
            Open
          </Button>
        </SettingRow>
      </PanelRows>
    </Panel>
  );
}
