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
import { Check, QrCode } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { CopyButton } from '@/components/arc/copy-button/copy-button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Input } from '@/components/arc/input/input';
import { Switch } from '@/components/arc/switch/switch';
import { Panel, PanelRows } from '@/components/app/panel';
import { SwitchRow } from '@/components/app/setting-row';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
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
    <Page title="Online store" subtitle="Customers order and pay from your own link." narrow>
      {store.isPending && (
        <div className="flex flex-col gap-6" aria-busy="true">
          <Skeleton className="h-40 w-full rounded-(--radius-surface)" />
          <Skeleton className="h-32 w-full rounded-(--radius-surface)" />
        </div>
      )}
      {store.isError && (
        <Alert tone="danger" title="Couldn’t load your online store">
          {store.error.message}
        </Alert>
      )}
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
    meta: { ok: 'Online store saved' },
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
    <div className="flex flex-col gap-6">
      {saving.error && (
        <Alert tone="danger" title="Couldn’t save">
          {saving.error.message}
        </Alert>
      )}

      <Panel title="Your store">
        <PanelRows>
          <SwitchRow
            title="Online store"
            detail="Share your link on WhatsApp and Instagram."
            on={shown.enabled}
            onChange={(on) => set({ enabled: on })}
          />
          {shown.enabled && (
            <>
              <li className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">Your store’s link</span>
                  <a
                    href={store.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm text-accent-strong underline-offset-2 hover:underline"
                  >
                    {store.url}
                  </a>
                </div>
                <div className="flex gap-2">
                  <CopyButton value={store.url} label="Copy link" />
                  <Button variant="secondary" onClick={() => setShowQr(true)}>
                    <QrCode size={16} strokeWidth={1.75} aria-hidden />
                    QR code
                  </Button>
                </div>
              </li>
              <SwitchRow
                title="Taking orders now"
                detail="Switch it off when you’re closed or too busy. The menu still shows, but nobody can order."
                on={shown.takingOrders}
                onChange={(on) => set({ takingOrders: on })}
              />
            </>
          )}
        </PanelRows>
      </Panel>

      {shown.enabled && !store.moolreConnected && (
        <Alert tone="warning" title="Moolre isn’t connected yet">
          {shown.cashOnPickup
            ? `Until ${who} Moolre account, customers can only pay cash when they collect.`
            : `Until ${who} Moolre account, nobody can pay, so the store can’t take orders.`}
          {isOwner && (
            <>
              {' '}
              <SettingsLink>Connect it in Settings</SettingsLink>.
            </>
          )}
        </Alert>
      )}
      {shown.enabled && store.deliveryZones === 0 && (
        <Alert tone="info" title="No delivery yet">
          Delivery shows on the store once you add delivery zones in{' '}
          <SettingsLink>Settings</SettingsLink>.
        </Alert>
      )}

      {shown.enabled && (
        <>
          <Panel title="Online orders">
            <PanelRows>
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
            </PanelRows>
          </Panel>

          <Panel title="Look" description={`Now: ${STOREFRONT_LOOKS[shown.theme].describe}.`}>
            <div className="flex flex-col gap-6 border-t p-5">
              <ThemePicker theme={shown.theme} onChange={(theme) => set({ theme })} />
              <StorePhotos store={store} />
            </div>
          </Panel>

          <Panel
            title="Opening hours"
            description="Your store closes itself outside these times, and customers see when it opens again."
          >
            <OpeningHours
              saved={shown.hours}
              busy={saving.isPending}
              onSave={(hours) => saving.mutate({ ...shown, hours })}
            />
          </Panel>

          <Panel
            title="On your store’s page"
            description="Leave one blank to keep it off the page."
          >
            <StoreDetails
              saved={saved}
              busy={saving.isPending}
              onSave={(details) => saving.mutate({ ...shown, ...details })}
            />
          </Panel>
        </>
      )}

      <Dialog open={showQr} onOpenChange={setShowQr}>
        {showQr && <QrCodeContent url={store.url} onClose={() => setShowQr(false)} />}
      </Dialog>
    </div>
  );
}

function SettingsLink({ children }: { children: string }) {
  return (
    <Link to="/settings" className="font-medium underline underline-offset-2">
      {children}
    </Link>
  );
}

/** Each look as a tiny store page: its page colour, band, a card and a button. */
function ThemePicker({
  theme,
  onChange,
}: {
  theme: StorefrontTheme;
  onChange: (theme: StorefrontTheme) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium" id="store-look">
          Page colour
        </p>
        <p className="text-sm text-muted-foreground">
          The top band and the buttons get a colour that goes with it.
        </p>
      </div>
      <div
        className="grid grid-cols-3 gap-2 sm:grid-cols-5"
        role="radiogroup"
        aria-labelledby="store-look"
      >
        {STOREFRONT_THEMES.map((key) => {
          const look = STOREFRONT_LOOKS[key];
          const colours = look.light;
          const chosen = theme === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={`${look.name}: ${look.describe}`}
              title={look.describe}
              onClick={() => onChange(key)}
              className={cn(
                'overflow-hidden rounded-(--radius-control) border text-left transition-colors',
                chosen
                  ? 'border-primary outline-2 outline-offset-1 outline-primary outline-solid'
                  : 'hover:border-foreground',
              )}
            >
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
              <span className="flex items-center justify-between gap-1 bg-surface px-2 py-1.5 text-xs">
                <span className="truncate">{look.name}</span>
                {chosen && (
                  <Check
                    size={12}
                    strokeWidth={2}
                    className="shrink-0 text-accent-strong"
                    aria-hidden
                  />
                )}
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
    return <p className="text-sm text-muted-foreground">Photos can’t be added just yet.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
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
  // The time fields are uncontrolled (see TimeInput), so anything that changes them from outside
  // the keyboard — a save elsewhere, or "the same times every day" — bumps this to refill them.
  const [revision, setRevision] = useState(0);
  const [base, setBase] = useState(saved);
  if (JSON.stringify(base) !== JSON.stringify(saved)) {
    setBase(saved);
    setHours(saved);
    setRevision((count) => count + 1);
  }
  const changed = STORE_DAYS.some(
    (day) =>
      hours[day].open !== saved[day].open ||
      hours[day].from !== saved[day].from ||
      hours[day].to !== saved[day].to,
  );
  const set = (day: StoreDay, patch: Partial<StoreHours[StoreDay]>) =>
    setHours((current) => ({ ...current, [day]: { ...current[day], ...patch } }));
  const everyDay = () => {
    setRevision((count) => count + 1);
    setHours((current) => {
      const first = STORE_DAYS.find((day) => current[day].open);
      if (!first) return current;
      const { from, to } = current[first];
      return Object.fromEntries(
        STORE_DAYS.map((day) => [day, { ...current[day], from, to }]),
      ) as StoreHours;
    });
  };

  return (
    <>
      <ul className="flex flex-col divide-y border-t">
        {STORE_DAYS.map((day) => (
          <li key={day} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <Switch
              checked={hours[day].open}
              onCheckedChange={(open) => set(day, { open })}
              aria-label={`Open on ${DAY_LABELS[day]}`}
            />
            <span className="w-24 shrink-0 text-sm font-medium">{DAY_LABELS[day]}</span>
            {hours[day].open ? (
              <span className="flex items-center gap-2">
                <TimeInput
                  key={`${day}-from-${revision}`}
                  label={`${DAY_LABELS[day]} opens at`}
                  value={hours[day].from}
                  onChange={(from) => set(day, { from })}
                />
                <span className="text-sm text-muted-foreground">to</span>
                <TimeInput
                  key={`${day}-to-${revision}`}
                  label={`${DAY_LABELS[day]} closes at`}
                  value={hours[day].to}
                  onChange={(to) => set(day, { to })}
                />
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Closed</span>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-4 border-t px-5 py-4">
        <p className="text-sm text-muted-foreground">
          Customers see: <span className="text-foreground">{hoursWords(hours)}</span>. A closing
          time earlier than the opening one means you close after midnight.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {changed && (
            <Button loading={busy} onClick={() => onSave(hours)}>
              Save hours
            </Button>
          )}
          <Button variant="ghost" onClick={everyDay}>
            Use the same times every day
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * A time of day. It is deliberately **not** controlled: a time field reports an empty value
 * while it's half typed, and feeding that back wipes what the owner is typing, so the hour can
 * never be finished (user report, 16 Sep). It starts from what's saved (`key` brings it back in
 * step after a save) and reports only a complete time. Drawn like Arc's input.
 */
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
    <input
      type="time"
      aria-label={label}
      className="min-h-(--control-height-md) w-32 rounded-(--radius-control) border border-(--border-strong) bg-surface px-3 text-sm tabular-nums transition-colors [color-scheme:light] outline-none hover:border-foreground focus-visible:border-foreground dark:[color-scheme:dark]"
      defaultValue={value}
      step={60}
      onChange={(event) => {
        if (event.target.value) onChange(event.target.value);
      }}
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
    <div className="flex flex-col gap-4 border-t p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Area"
          maxLength={80}
          placeholder="For example: Osu, Accra"
          value={area}
          onChange={(event) => setArea(event.target.value)}
        />
        <Input
          label="Phone for customers"
          inputMode="tel"
          maxLength={20}
          placeholder="024 000 0000"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>
      {changed && (
        <Button
          className="self-start"
          loading={busy}
          onClick={() => onSave({ area: area.trim(), phone: phone.trim() })}
        >
          Save
        </Button>
      )}
    </div>
  );
}

/** The store's link as a QR code: to print for the counter, or put on a post. */
function QrCodeContent({ url, onClose }: { url: string; onClose: () => void }) {
  const qr = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(url);
    code.make();
    return code;
  }, [url]);
  const download = () => {
    const link = document.createElement('a');
    link.href = qr.createDataURL(10, 4);
    link.download = 'store-qr-code.gif';
    link.click();
  };
  return (
    <DialogContent
      title="Your store’s QR code"
      description="Print it for the counter, or put it on your posts. Scanning it opens your store."
    >
      <div className="flex flex-col gap-4">
        <div
          className="mx-auto w-56 rounded-(--radius-panel) bg-white p-3"
          // The library's own SVG, made from the store's link.
          dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ margin: 0, scalable: true }) }}
        />
        <p className="text-center text-xs break-all text-muted-foreground">{url}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={download}>Download</Button>
        </div>
      </div>
    </DialogContent>
  );
}
