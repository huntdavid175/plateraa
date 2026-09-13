import {
  STOREFRONT_THEMES,
  STOREFRONT_THEME_COLOURS,
  VENDOR_TYPES,
  type StorefrontTheme,
  type VendorType,
} from '@plateraa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import qrcode from 'qrcode-generator';
import { useMemo, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { ulid } from 'ulid';
import { amountText, cedis, parseAmount } from '../lib/money';
import { PHOTO_SIZES, storePhotoPath } from '../lib/photos';
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
import {
  fetchStorefront,
  refreshStorefront,
  saveStorefront,
  type SaveStorefront,
  type Storefront,
} from '../lib/storefront';
import { setDark, useDark } from '../lib/theme';
import { VENDOR_TYPE_WORDS, phoneWords } from '../lib/words';
import { fetchZones, refreshZones, removeZone, saveZone, type Zone } from '../lib/zones';
import { useMe } from '../shell/Shell';
import {
  Button,
  ErrorNote,
  FieldLabel,
  Section,
  Spinner,
  TextInput,
  Toggle,
  cx,
} from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { Page } from '../ui/Page';
import { PhotoPicker } from '../ui/PhotoPicker';

const IDLE_CHOICES = [60, 180, 300, 600, 900];

export function SettingsPage() {
  const me = useMe();
  const { tenantId } = useSession();
  const isOwner = me.capabilities.includes('settings.manage');
  const setsUpMenu = me.capabilities.includes('catalog.manage');
  const runsStore = me.capabilities.includes('storefront.manage');
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
      {runsStore && <OnlineStoreSection />}
      {setsUpMenu && <DeliverySection />}
      {settings.data && <PaymentsSection settings={settings.data} />}
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

function SwitchRow({
  title,
  detail,
  on,
  onChange,
  disabled,
}: {
  title: string;
  detail: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{detail}</p>
      </div>
      <Toggle on={on} onChange={onChange} label={title} disabled={disabled} />
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
  const saving = useMutation({ mutationFn: saveOrderSettings, onSuccess: refreshSettings });
  // Show the change straight away; it goes back if saving fails.
  const shown = saving.isPending && saving.variables ? saving.variables : orders;
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

/**
 * The online store (plan.md §4.0), for the owner and managers: its link and QR code to share, its
 * switches, its colour, and what its page says about the business.
 */
function OnlineStoreSection() {
  const { tenantId } = useSession();
  const store = useQuery({ queryKey: ['storefront', tenantId], queryFn: fetchStorefront });
  if (!store.data) {
    return (
      <Section title="Online store">
        {store.isError ? (
          <div className="p-4">
            <ErrorNote>{store.error.message}</ErrorNote>
          </div>
        ) : (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
      </Section>
    );
  }
  return <OnlineStore store={store.data} />;
}

function OnlineStore({ store }: { store: Storefront }) {
  const saving = useMutation({ mutationFn: saveStorefront, onSuccess: refreshStorefront });
  const saved: SaveStorefront = {
    enabled: store.enabled,
    takingOrders: store.takingOrders,
    cashOnPickup: store.cashOnPickup,
    acceptFirst: store.acceptFirst,
    theme: store.theme,
    area: store.area ?? '',
    phone: store.phone ? phoneWords(store.phone) : '',
    hours: store.hours ?? '',
  };
  // Switches show the change straight away; it goes back if saving fails.
  const shown = saving.isPending && saving.variables ? saving.variables : saved;
  const set = (patch: Partial<SaveStorefront>) => saving.mutate({ ...shown, ...patch });
  const [showQr, setShowQr] = useState(false);

  return (
    <>
      <Section title="Online store">
        <SwitchRow
          title="Online store"
          detail="Customers order and pay from your own link. Share it on WhatsApp and Instagram."
          on={shown.enabled}
          onChange={(on) => set({ enabled: on })}
        />
        {shown.enabled && (
          <>
            <StoreLink url={store.url} onQr={() => setShowQr(true)} />
            <SwitchRow
              title="Taking orders now"
              detail="Switch it off when you’re closed or too busy. The menu still shows, but nobody can order."
              on={shown.takingOrders}
              onChange={(on) => set({ takingOrders: on })}
            />
            <SwitchRow
              title="Cash when they collect"
              detail="Customers picking up may pay you in cash when they come. Their order is cooked before it’s paid."
              on={shown.cashOnPickup}
              onChange={(on) => set({ cashOnPickup: on })}
            />
            <SwitchRow
              title="Accept orders first"
              detail="Online orders wait on the tablet until someone taps Accept. When it’s off, a paid order goes straight to the kitchen."
              on={shown.acceptFirst}
              onChange={(on) => set({ acceptFirst: on })}
            />
            <ThemeRow theme={shown.theme} onChange={(theme) => set({ theme })} />
            <StorePhotos store={store} />
            <StoreDetails
              saved={saved}
              busy={saving.isPending}
              onSave={(details) => saving.mutate({ ...shown, ...details })}
            />
          </>
        )}
        {saving.error && (
          <div className="p-4">
            <ErrorNote>{saving.error.message}</ErrorNote>
          </div>
        )}
      </Section>
      {shown.enabled && (!store.moolreConnected || store.deliveryZones === 0) && (
        <div className="-mt-3 mb-5 space-y-1 px-1 text-xs text-muted">
          {!store.moolreConnected && (
            <p className="text-amber">
              {shown.cashOnPickup
                ? 'Until the owner connects the Moolre account, customers can only pay cash when they collect.'
                : 'Until the owner connects the Moolre account, nobody can pay, so the store can’t take orders.'}
            </p>
          )}
          {store.deliveryZones === 0 && (
            <p>Delivery shows on the store once you add delivery zones.</p>
          )}
        </div>
      )}
      {showQr && <QrDialog url={store.url} onClose={() => setShowQr(false)} />}
    </>
  );
}

function StoreLink({ url, onQr }: { url: string; onQr: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Your store’s link</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 block truncate font-mono text-xs text-brand"
        >
          {url}
        </a>
      </div>
      <Button variant="secondary" small onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <Button variant="secondary" small onClick={onQr}>
        QR code
      </Button>
    </div>
  );
}

function ThemeRow({
  theme,
  onChange,
}: {
  theme: StorefrontTheme;
  onChange: (theme: StorefrontTheme) => void;
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm font-medium">Colour</p>
      <p className="mt-0.5 text-xs text-muted">For the buttons on your store’s page.</p>
      <div className="mt-3 flex flex-wrap gap-3" role="radiogroup" aria-label="Store colour">
        {STOREFRONT_THEMES.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={theme === key}
            aria-label={STOREFRONT_THEME_COLOURS[key].name}
            title={STOREFRONT_THEME_COLOURS[key].name}
            onClick={() => onChange(key)}
            className={cx(
              'h-9 w-9 rounded-full transition',
              theme === key && 'ring-2 ring-text ring-offset-2 ring-offset-surface',
            )}
            style={{ backgroundColor: STOREFRONT_THEME_COLOURS[key].brand }}
          />
        ))}
      </div>
    </div>
  );
}

/** The cover picture across the top of the store's page, and the logo beside its name. */
function StorePhotos({ store }: { store: Storefront }) {
  if (!store.photosReady) {
    return <p className="px-5 py-4 text-xs text-muted">Photos can’t be added just yet.</p>;
  }
  return (
    <div className="space-y-4 px-5 py-4">
      <PhotoPicker
        path={storePhotoPath('cover')}
        url={store.coverUrl}
        longest={PHOTO_SIZES.cover}
        shape="wide"
        label="Cover picture"
        hint="Across the top of your store’s page. A wide photo works best."
        onSaved={refreshStorefront}
      />
      <PhotoPicker
        path={storePhotoPath('logo')}
        url={store.logoUrl}
        longest={PHOTO_SIZES.logo}
        label="Logo"
        hint="Beside your business name. Without one, your initials show."
        onSaved={refreshStorefront}
      />
    </div>
  );
}

/** What the store's page says about the business. Blank means it isn't shown. */
function StoreDetails({
  saved,
  busy,
  onSave,
}: {
  saved: SaveStorefront;
  busy: boolean;
  onSave: (details: Pick<SaveStorefront, 'area' | 'phone' | 'hours'>) => void;
}) {
  const [area, setArea] = useState(saved.area);
  const [phone, setPhone] = useState(saved.phone);
  const [hours, setHours] = useState(saved.hours);
  const changed = area !== saved.area || phone !== saved.phone || hours !== saved.hours;
  return (
    <div className="space-y-4 px-5 py-4">
      <p className="text-sm font-medium">On your store’s page</p>
      <div>
        <FieldLabel htmlFor="store-area">Area</FieldLabel>
        <TextInput
          id="store-area"
          maxLength={80}
          placeholder="e.g. Osu, Accra"
          value={area}
          onChange={(event) => setArea(event.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="store-phone">Phone for customers</FieldLabel>
        <TextInput
          id="store-phone"
          inputMode="tel"
          maxLength={20}
          placeholder="024 000 0000"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="store-hours">Opening hours</FieldLabel>
        <TextInput
          id="store-hours"
          maxLength={120}
          placeholder="e.g. Mon–Sat 7am–9pm"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
        />
      </div>
      {changed && (
        <Button
          small
          busy={busy}
          onClick={() => onSave({ area: area.trim(), phone: phone.trim(), hours: hours.trim() })}
        >
          Save
        </Button>
      )}
    </div>
  );
}

/** The store's link as a QR code: to print for the counter, or put on a post. */
function QrDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const qr = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(url);
    code.make();
    return code;
  }, [url]);
  return (
    <Dialog title="Your store’s QR code" onClose={onClose}>
      <p className="text-sm text-muted">
        Print it for the counter, or put it on your posts. Scanning it opens your store.
      </p>
      <div
        className="mx-auto my-5 w-56 rounded-xl bg-white p-3"
        // The library's own SVG, made from the store's link.
        dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ margin: 0, scalable: true }) }}
      />
      <p className="text-center font-mono text-xs break-all text-muted">{url}</p>
      <div className="mt-6 flex gap-2">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <a
          href={qr.createDataURL(10, 4)}
          download="store-qr-code.gif"
          className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-fg"
        >
          Download
        </a>
      </div>
    </Dialog>
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
    onSuccess: done,
  });
  const removing = useMutation({ mutationFn: () => removeZone(id), onSuccess: done });

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
