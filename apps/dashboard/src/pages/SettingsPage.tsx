import { VENDOR_TYPES, type VendorType } from '@plateraa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ulid } from 'ulid';
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
import { setDark, useDark } from '../lib/theme';
import { VENDOR_TYPE_WORDS } from '../lib/words';
import { fetchZones, refreshZones, removeZone, saveZone, type Zone } from '../lib/zones';
import { useMe } from '../shell/Shell';
import {
  Button,
  ErrorNote,
  FieldLabel,
  Section,
  Spinner,
  SwitchRow,
  TextInput,
  Toggle,
} from '../ui/controls';
import { Dialog } from '../ui/Dialog';
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
      {isOwner && settings.isPending && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {settings.isError && <ErrorNote>{settings.error.message}</ErrorNote>}
      {settings.data && <BusinessSection business={settings.data.business} />}
      {!isOwner && (
        <Section title="Business">
          <Row label="Business name" value={me.businessName} />
          <Row label="Type" value={VENDOR_TYPE_WORDS[me.vendorType]} />
        </Section>
      )}

      <Section title="Appearance">
        <DarkModeRow />
      </Section>

      {settings.data && <OrdersSection orders={settings.data.orders} />}
      {setsUpMenu && <DeliverySection />}
      {settings.data && <PaymentsSection settings={settings.data} />}
      {isOwner && <SetupGuideSection />}
      {!isOwner && (
        <p className="px-1 text-xs text-muted">
          Only the owner changes how orders and payments work.
        </p>
      )}
    </Page>
  );
}

function Row({ label, value, action }: { label: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-right text-sm text-muted">{value}</span>
        {action}
      </div>
    </div>
  );
}

function DarkModeRow() {
  const dark = useDark();
  return (
    <SwitchRow
      title="Dark mode"
      detail="Switch between light and dark on this browser."
      on={dark}
      onChange={setDark}
    />
  );
}

function BusinessSection({ business }: { business: Settings['business'] }) {
  const [name, setName] = useState(business.name);
  const [type, setType] = useState<VendorType>(business.vendorType);
  const changed = name.trim() !== business.name || type !== business.vendorType;
  const saving = useMutation({
    mutationFn: () => saveBusiness({ name: name.trim(), vendorType: type }),
    meta: { ok: 'Business details saved' },
    onSuccess: refreshSettings,
  });

  return (
    <Section title="Business">
      <div className="space-y-4 px-5 py-4">
        <div>
          <FieldLabel htmlFor="business-name">Business name</FieldLabel>
          <TextInput
            id="business-name"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <p className="mt-1 text-xs text-muted">On receipts, and in the payment link texts.</p>
        </div>
        <div>
          <FieldLabel htmlFor="business-type">Type</FieldLabel>
          <select
            id="business-type"
            value={type}
            onChange={(event) => setType(event.target.value as VendorType)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text outline-none focus:border-brand"
          >
            {VENDOR_TYPES.map((value) => (
              <option key={value} value={value}>
                {VENDOR_TYPE_WORDS[value]}
              </option>
            ))}
          </select>
        </div>
        {saving.error && <ErrorNote>{saving.error.message}</ErrorNote>}
        {changed && (
          <Button
            small
            busy={saving.isPending}
            disabled={name.trim().length < 2}
            onClick={() => saving.mutate()}
          >
            Save
          </Button>
        )}
      </div>
    </Section>
  );
}

function OrdersSection({ orders }: { orders: OrderSettings }) {
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

  return (
    <Section title="Orders">
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
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex-1">
          <p className="text-sm font-medium">Lock an idle tablet after</p>
          <p className="mt-0.5 text-xs text-muted">
            Then the next person unlocks it with their PIN.
          </p>
        </div>
        <select
          aria-label="Lock an idle tablet after"
          value={shown.idleLockSeconds}
          onChange={(event) => set({ idleLockSeconds: Number(event.target.value) })}
          className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text outline-none focus:border-brand"
        >
          {[...new Set([...IDLE_CHOICES, shown.idleLockSeconds])]
            .sort((a, b) => a - b)
            .map((seconds) => (
              <option key={seconds} value={seconds}>
                {Math.round(seconds / 60)} min
              </option>
            ))}
        </select>
      </div>
      {saving.error && (
        <div className="p-4">
          <ErrorNote>{saving.error.message}</ErrorNote>
        </div>
      )}
    </Section>
  );
}

/** Delivery zones: the tablet fills in a zone's fee when it's picked for a delivery. */
function DeliverySection() {
  const { tenantId } = useSession();
  const zones = useQuery({ queryKey: ['zones', tenantId], queryFn: fetchZones });
  const [editing, setEditing] = useState<Zone | 'new' | null>(null);

  return (
    <>
      <Section title="Delivery zones">
        {zones.isPending && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {zones.isError && (
          <div className="p-4">
            <ErrorNote>{zones.error.message}</ErrorNote>
          </div>
        )}
        {zones.data?.length === 0 && (
          <p className="px-5 py-4 text-sm text-muted">
            No zones yet. Add each area you deliver to with its fee, and the tablet fills in the fee
            when someone picks the zone.
          </p>
        )}
        {zones.data?.map((zone) => (
          <Row
            key={zone.id}
            label={zone.name}
            value={
              <>
                <span className="font-mono">{cedis(zone.fee)}</span>
                {!zone.active && <span className="block text-xs">Off the tablet</span>}
              </>
            }
            action={
              <Button variant="secondary" small onClick={() => setEditing(zone)}>
                Edit
              </Button>
            }
          />
        ))}
        {zones.data && (
          <div className="px-5 py-3">
            <Button variant="secondary" small onClick={() => setEditing('new')}>
              Add zone
            </Button>
          </div>
        )}
      </Section>
      {editing && (
        <ZoneDialog zone={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function ZoneDialog({ zone, onClose }: { zone: Zone | null; onClose: () => void }) {
  // Made once, when the dialog opens, so pressing Save again after a lost reply adds it once.
  const [id] = useState(() => zone?.id ?? ulid());
  const [name, setName] = useState(zone?.name ?? '');
  const [feeText, setFeeText] = useState(zone ? amountText(zone.fee) : '');
  const [active, setActive] = useState(zone?.active ?? true);
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

  return (
    <Dialog title={zone ? `Edit ${zone.name}` : 'Add a delivery zone'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) saving.mutate();
        }}
      >
        <div>
          <FieldLabel htmlFor="zone-name">Area</FieldLabel>
          <TextInput
            id="zone-name"
            maxLength={40}
            autoFocus
            placeholder="e.g. Osu"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <FieldLabel htmlFor="zone-fee">Delivery fee</FieldLabel>
          <div className="flex h-11 items-center gap-1 rounded-xl border border-border bg-surface px-3 focus-within:border-brand">
            <span className="font-mono text-xs text-muted">GH₵</span>
            <input
              id="zone-fee"
              inputMode="decimal"
              placeholder="0.00"
              value={feeText}
              onChange={(event) => setFeeText(event.target.value)}
              className="w-full min-w-0 bg-transparent font-mono text-sm outline-none"
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            Staff can still change it on the tablet for one order.
          </p>
        </div>
        <SwitchRowPlain
          title="On the tablet"
          detail="Switch it off for a while without losing it."
          on={active}
          onChange={setActive}
        />
        {feeText.trim() !== '' && fee === null && (
          <p className="text-xs text-amber">Type the fee as an amount, like 15 or 15.50.</p>
        )}
        {saving.error && <ErrorNote>{saving.error.message}</ErrorNote>}
        {removing.error && <ErrorNote>{removing.error.message}</ErrorNote>}
        <div className="mt-6 flex gap-2">
          {zone ? (
            <Button
              variant="ghost"
              busy={removing.isPending}
              onClick={() => {
                if (window.confirm(`Remove ${zone.name}? The tablet stops offering it.`)) {
                  removing.mutate();
                }
              }}
            >
              Remove
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button type="submit" full disabled={!ready} busy={saving.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** A switch with its words, inside a dialog (no row padding). */
function SwitchRowPlain({
  title,
  detail,
  on,
  onChange,
}: {
  title: string;
  detail: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{detail}</p>
      </div>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  );
}

/**
 * The vendor's own Moolre account. Bolt Food and Chowdeck commissions are kept on the server but
 * not shown until their APIs connect.
 */
function PaymentsSection({ settings }: { settings: Settings }) {
  const [connecting, setConnecting] = useState(false);
  const { moolre } = settings;
  return (
    <>
      <Section title="Payments">
        <Row
          label="Moolre account"
          value={
            moolre.connected ? (
              <span className="font-medium text-green">
                Connected · ending {moolre.accountEnding}
              </span>
            ) : (
              <span className="font-medium text-amber">Not connected</span>
            )
          }
          action={
            <Button variant="secondary" small onClick={() => setConnecting(true)}>
              {moolre.connected ? 'Change' : 'Connect'}
            </Button>
          }
        />
      </Section>
      {!moolre.connected && (
        <p className="-mt-3 mb-5 px-1 text-xs text-muted">
          Without a Moolre account, payment links can’t go out, so customers can only pay cash.
        </p>
      )}
      {connecting && <MoolreDialog current={moolre} onClose={() => setConnecting(false)} />}
    </>
  );
}

function MoolreDialog({ current, onClose }: { current: Settings['moolre']; onClose: () => void }) {
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

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    extra: Partial<InputHTMLAttributes<HTMLInputElement>> = {},
  ) => (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <TextInput
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...extra}
      />
    </div>
  );

  return (
    <Dialog title="Your Moolre account" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) saving.mutate();
        }}
      >
        <p className="text-sm text-muted">
          Payment-link money goes straight into this account; it never passes through Plateraa. Find
          these on app.moolre.com. Only the public key is needed, never the private one.
        </p>
        {field('moolre-user', 'Username', apiUser, setApiUser, {
          autoComplete: 'off',
          autoFocus: true,
        })}
        {field('moolre-key', 'Public key', publicKey, setPublicKey, {
          type: 'password',
          autoComplete: 'off',
          placeholder: current.connected ? 'Type it again to change the account' : undefined,
        })}
        {field('moolre-account', 'Moolre account number', accountNumber, setAccountNumber, {
          inputMode: 'numeric',
          autoComplete: 'off',
          placeholder: current.accountEnding ? `Ends ${current.accountEnding}` : undefined,
        })}
        {field('moolre-email', 'Email on the account', email, setEmail, { type: 'email' })}
        {saving.error && <ErrorNote>{saving.error.message}</ErrorNote>}
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" full disabled={!ready} busy={saving.isPending}>
            Check and save
          </Button>
        </div>
        {saving.isPending && (
          <p className="text-center text-xs text-muted">
            Asking Moolre whether it knows this account…
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** The onboarding again, from the menu step, for an owner who skipped parts of it. */
function SetupGuideSection() {
  const navigate = useNavigate();
  return (
    <Section title="Setup guide">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex-1">
          <p className="text-sm font-medium">Go through setup again</p>
          <p className="mt-0.5 text-xs text-muted">
            A starter menu and its prices, staff PINs, Moolre and the tablet, one step at a time.
          </p>
        </div>
        <Button
          variant="secondary"
          small
          onClick={() => navigate('/setup', { state: { back: '/settings' } })}
        >
          Open
        </Button>
      </div>
    </Section>
  );
}
