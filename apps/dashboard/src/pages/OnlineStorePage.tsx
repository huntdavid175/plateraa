import {
  STORE_DAYS,
  STOREFRONT_LOOKS,
  STOREFRONT_THEMES,
  hoursWords,
  type StoreDay,
  type StoreHours,
  type StorefrontTheme,
} from '@plateraa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PHOTO_SIZES, storePhotoPath } from '../lib/photos';
import { saveInPlace } from '../lib/save-in-place';
import { useSession } from '../lib/session';
import {
  fetchStorefront,
  refreshStorefront,
  saveStorefront,
  type SaveStorefront,
  type Storefront,
} from '../lib/storefront';
import { phoneWords } from '../lib/words';
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
  cx,
} from '../ui/controls';
import { Dialog } from '../ui/Dialog';
import { Page } from '../ui/Page';
import { PhotoPicker } from '../ui/PhotoPicker';

/**
 * The online store (plan.md §4.0), for the owner and managers: its link and QR code to share, its
 * switches, its look, and what its page says about the business. The delivery zones and the
 * Moolre account it depends on stay in Settings.
 */
export function OnlineStorePage() {
  const { tenantId } = useSession();
  const store = useQuery({ queryKey: ['storefront', tenantId], queryFn: fetchStorefront });
  return (
    <Page title="Online store" narrow>
      {store.isPending && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {store.isError && <ErrorNote>{store.error.message}</ErrorNote>}
      {store.data && <OnlineStore store={store.data} />}
    </Page>
  );
}

function OnlineStore({ store }: { store: Storefront }) {
  const me = useMe();
  const { tenantId } = useSession();
  const isOwner = me.capabilities.includes('settings.manage');
  const saving = useMutation({
    mutationFn: saveStorefront,
    // Switches and the look change at once and stay put; they go back if saving fails. The
    // phone number waits for the reload, which returns it tidied.
    ...saveInPlace(['storefront', tenantId], (current: Storefront, next: SaveStorefront) => ({
      ...current,
      enabled: next.enabled,
      takingOrders: next.takingOrders,
      cashOnPickup: next.cashOnPickup,
      acceptFirst: next.acceptFirst,
      theme: next.theme,
      area: next.area || null,
      hours: next.hours,
    })),
    onSettled: refreshStorefront,
  });
  const saved: SaveStorefront = {
    enabled: store.enabled,
    takingOrders: store.takingOrders,
    cashOnPickup: store.cashOnPickup,
    acceptFirst: store.acceptFirst,
    theme: store.theme,
    area: store.area ?? '',
    phone: store.phone ? phoneWords(store.phone) : '',
    hours: store.hours,
  };
  const shown = saved;
  const set = (patch: Partial<SaveStorefront>) => saving.mutate({ ...shown, ...patch });
  const [showQr, setShowQr] = useState(false);
  const who = isOwner ? 'you connect your' : 'the owner connects the';

  return (
    <>
      {saving.error && (
        <div className="mb-5">
          <ErrorNote>{saving.error.message}</ErrorNote>
        </div>
      )}
      <Section title="Your store">
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
          </>
        )}
      </Section>
      {shown.enabled && (!store.moolreConnected || store.deliveryZones === 0) && (
        <div className="-mt-3 mb-5 space-y-1 px-1 text-xs text-muted">
          {!store.moolreConnected && (
            <p className="text-amber">
              {shown.cashOnPickup
                ? `Until ${who} Moolre account, customers can only pay cash when they collect.`
                : `Until ${who} Moolre account, nobody can pay, so the store can’t take orders.`}
              {isOwner && (
                <>
                  {' '}
                  <SettingsLink>Connect it in Settings</SettingsLink>.
                </>
              )}
            </p>
          )}
          {store.deliveryZones === 0 && (
            <p>
              Delivery shows on the store once you add delivery zones in{' '}
              <SettingsLink>Settings</SettingsLink>.
            </p>
          )}
        </div>
      )}

      {shown.enabled && (
        <>
          <Section title="Online orders">
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
          </Section>
          <Section title="Look">
            <ThemeRow theme={shown.theme} onChange={(theme) => set({ theme })} />
            <StorePhotos store={store} />
          </Section>
          <Section title="Opening hours">
            <OpeningHours
              saved={shown.hours}
              busy={saving.isPending}
              onSave={(hours) => saving.mutate({ ...shown, hours })}
            />
          </Section>
          <Section title="On your store’s page">
            <StoreDetails
              saved={saved}
              busy={saving.isPending}
              onSave={(details) => saving.mutate({ ...shown, ...details })}
            />
          </Section>
        </>
      )}
      {showQr && <QrDialog url={store.url} onClose={() => setShowQr(false)} />}
    </>
  );
}

function SettingsLink({ children }: { children: string }) {
  return (
    <Link to="/settings" className="font-medium underline">
      {children}
    </Link>
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
      <p className="text-sm font-medium">Page colour</p>
      <p className="mt-0.5 text-xs text-muted">
        Pick your page’s colour. The buttons get a colour that goes with it. Now:{' '}
        {STOREFRONT_LOOKS[theme].describe.toLowerCase()}.
      </p>
      <div
        className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5"
        role="radiogroup"
        aria-label="Store look"
      >
        {STOREFRONT_THEMES.map((key) => {
          const look = STOREFRONT_LOOKS[key];
          const colours = look.light;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={theme === key}
              aria-label={`${look.name}: ${look.describe}`}
              title={look.describe}
              onClick={() => onChange(key)}
              className={cx(
                'overflow-hidden rounded-xl border text-left transition',
                theme === key ? 'border-text ring-2 ring-text' : 'border-border hover:border-muted',
              )}
            >
              {/* A tiny store page: the band, a card, and a button. */}
              <span className="block p-2" style={{ backgroundColor: colours.page }}>
                <span className="block h-3 rounded" style={{ backgroundColor: colours.hero }} />
                <span className="mt-1.5 flex items-center gap-1.5">
                  <span
                    className="block h-4 flex-1 rounded"
                    style={{ backgroundColor: colours.card }}
                  />
                  <span
                    className="block h-4 w-7 rounded"
                    style={{ backgroundColor: colours.brand }}
                  />
                </span>
              </span>
              <span className="block truncate bg-surface px-2 py-1.5 text-xs font-medium">
                {look.name}
              </span>
            </button>
          );
        })}
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

/** How each day reads in the list of hours. */
const DAY_LABELS: Record<StoreDay, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/**
 * The week the store keeps (16 Sep, user request). Outside these times the store's page shows as
 * closed and nobody can order; "Taking orders now" closes it by hand whatever the hours say.
 */
function OpeningHours({
  saved,
  busy,
  onSave,
}: {
  saved: StoreHours;
  busy: boolean;
  onSave: (hours: StoreHours) => void;
}) {
  const [hours, setHours] = useState(saved);
  // Someone else may have changed them (another tab, or the same owner on the tablet).
  const [base, setBase] = useState(saved);
  if (base !== saved) {
    setBase(saved);
    setHours(saved);
  }
  const changed = STORE_DAYS.some(
    (day) =>
      hours[day].open !== saved[day].open ||
      hours[day].from !== saved[day].from ||
      hours[day].to !== saved[day].to,
  );
  const set = (day: StoreDay, patch: Partial<StoreHours[StoreDay]>) =>
    setHours((current) => ({ ...current, [day]: { ...current[day], ...patch } }));
  const everyDay = () =>
    setHours((current) => {
      const first = STORE_DAYS.find((day) => current[day].open);
      if (!first) return current;
      const { from, to } = current[first];
      return Object.fromEntries(
        STORE_DAYS.map((day) => [day, { ...current[day], from, to }]),
      ) as StoreHours;
    });

  return (
    <div className="space-y-4 px-5 py-4">
      <p className="text-xs text-muted">
        Your store closes itself outside these times, and customers see when it opens again. A
        closing time earlier than the opening one means you close after midnight.
      </p>
      <div className="space-y-2">
        {STORE_DAYS.map((day) => (
          <div key={day} className="flex items-center gap-3">
            <Toggle
              on={hours[day].open}
              onChange={(on) => set(day, { open: on })}
              label={`Open on ${DAY_LABELS[day]}`}
            />
            <span className="w-20 shrink-0 text-sm font-medium">{DAY_LABELS[day]}</span>
            {hours[day].open ? (
              <div className="flex items-center gap-2">
                <TimeInput
                  label={`${DAY_LABELS[day]} opens at`}
                  value={hours[day].from}
                  onChange={(from) => set(day, { from })}
                />
                <span className="text-xs text-muted">to</span>
                <TimeInput
                  label={`${DAY_LABELS[day]} closes at`}
                  value={hours[day].to}
                  onChange={(to) => set(day, { to })}
                />
              </div>
            ) : (
              <span className="text-sm text-muted">Closed</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">Customers see: {hoursWords(hours)}</p>
      <div className="flex items-center gap-2">
        {changed && (
          <Button small busy={busy} onClick={() => onSave(hours)}>
            Save
          </Button>
        )}
        <button
          type="button"
          onClick={everyDay}
          className="text-xs font-medium text-muted underline"
        >
          Use the same times every day
        </button>
      </div>
    </div>
  );
}

function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextInput
      type="time"
      aria-label={label}
      className="w-28"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
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
  onSave: (details: Pick<SaveStorefront, 'area' | 'phone'>) => void;
}) {
  const [area, setArea] = useState(saved.area);
  const [phone, setPhone] = useState(saved.phone);
  const changed = area !== saved.area || phone !== saved.phone;
  return (
    <div className="space-y-4 px-5 py-4">
      <p className="text-xs text-muted">Leave one blank to keep it off the page.</p>
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
      {changed && (
        <Button
          small
          busy={busy}
          onClick={() => onSave({ area: area.trim(), phone: phone.trim() })}
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
