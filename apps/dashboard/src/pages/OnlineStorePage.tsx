import {
  STORE_DAYS,
  STOREFRONT_LOOKS,
  STOREFRONT_THEMES,
  clockAt,
  hoursWords,
  isOpenAt,
  opensWords,
  timeWords,
  type StoreDay,
  type StoreHours,
  type StorefrontTheme,
} from '@brixx/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ImageOff, QrCode } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { CopyButton } from '@/components/arc/copy-button/copy-button';
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog';
import { Drawer, DrawerContent } from '@/components/arc/drawer/drawer';
import { Input } from '@/components/arc/input/input';
import { Switch } from '@/components/arc/switch/switch';
import { TimePicker } from '@/components/arc/time-picker/time-picker';
import { Bento, Cedis, Tile } from '@/components/app/bento';
import { SwitchRow } from '@/components/app/setting-row';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fetchMenu, type Menu } from '../lib/menu';
import { cedis, clock } from '../lib/money';
import { fetchOrders, paymentState } from '../lib/orders';
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

/** The vendors are in Ghana; the store's page keeps its hours in the same zone. */
const TIME_ZONE = 'Africa/Accra';

/**
 * The online store (plan.md §4.0), for the owner and managers, as a bento grid: whether it's
 * open and its link, a live picture of the page customers see, today's online orders, what it
 * depends on (Moolre, delivery zones, hours), how online orders work, and its look. The delivery
 * zones and the Moolre account stay in Settings.
 */
export function OnlineStorePage() {
  const { tenantId } = useSession();
  const store = useQuery({ queryKey: ['storefront', tenantId], queryFn: fetchStorefront });
  return (
    <Page title="Online store" subtitle="Customers order and pay from your own link.">
      {store.isPending && (
        <Bento>
          <Skeleton className="col-span-2 h-56 rounded-(--radius-surface) lg:col-span-3" />
          <Skeleton className="col-span-2 h-96 rounded-(--radius-surface) lg:col-span-1 lg:row-span-2" />
          <Skeleton className="col-span-2 h-36 rounded-(--radius-surface) lg:col-span-3" />
        </Bento>
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
  const menu = useQuery({ queryKey: ['menu', tenantId], queryFn: fetchMenu });
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
  const set = (patch: Partial<SaveStorefront>) => saving.mutate({ ...saved, ...patch });

  return (
    <div className="flex flex-col gap-4">
      {saving.error && (
        <Alert tone="danger" title="Couldn’t save">
          {saving.error.message}
        </Alert>
      )}
      <Bento>
        <StatusTile store={store} onSet={set} />
        <PreviewTile store={store} menu={menu.data} businessName={me.businessName} />

        {store.enabled && (
          <>
            <OnlineOrdersTile />
            <PaymentsTile store={store} isOwner={isOwner} cashOnPickup={saved.cashOnPickup} />
            <DeliveryTile zones={store.deliveryZones} />

            <Tile title="How online orders work" className="col-span-2">
              <ul className="-mx-4 -mb-4 flex flex-col divide-y border-t sm:-mx-5 sm:-mb-5">
                <SwitchRow
                  title="Cash when they collect"
                  detail="Customers picking up may pay you in cash when they come. Their order is cooked before it’s paid."
                  on={saved.cashOnPickup}
                  onChange={(on) => set({ cashOnPickup: on })}
                />
                <SwitchRow
                  title="Accept orders first"
                  detail="Online orders wait on the tablet until someone taps Accept. When it’s off, a paid order goes straight to the kitchen."
                  on={saved.acceptFirst}
                  onChange={(on) => set({ acceptFirst: on })}
                />
              </ul>
            </Tile>
            <HoursTile
              hours={saved.hours}
              busy={saving.isPending}
              onSave={(hours) => saving.mutate({ ...saved, hours })}
            />

            <Tile title="Look" className="col-span-2">
              <ThemePicker theme={saved.theme} onChange={(theme) => set({ theme })} />
            </Tile>
            <Tile title="Photos" className="col-span-2">
              <StorePhotos store={store} />
            </Tile>

            <Tile title="On your store’s page" className="col-span-2 lg:col-span-4">
              <StoreDetails
                saved={saved}
                busy={saving.isPending}
                onSave={(details) => saving.mutate({ ...saved, ...details })}
              />
            </Tile>
          </>
        )}
      </Bento>
    </div>
  );
}

/** Where the store stands right now, in words and a dot. */
function statusOf(
  store: Storefront,
  now: Date,
): {
  words: string;
  detail: string;
  tone: 'success' | 'warning' | 'muted';
} {
  if (!store.enabled) {
    return {
      words: 'Switched off',
      detail: 'Your link doesn’t open a store. Switch it on to share it.',
      tone: 'muted',
    };
  }
  if (!store.takingOrders) {
    return {
      words: 'Not taking orders',
      detail: 'Customers see your menu but can’t order until you switch orders back on.',
      tone: 'warning',
    };
  }
  if (isOpenAt(store.hours, now, TIME_ZONE)) {
    const today = store.hours[clockAt(now, TIME_ZONE).day];
    return {
      words: 'Open now',
      detail: today.open ? `Taking orders until ${timeWords(today.to)}.` : 'Taking orders.',
      tone: 'success',
    };
  }
  return {
    words: 'Closed',
    detail: opensWords(store.hours, now, TIME_ZONE) ?? 'Closed every day: set your hours.',
    tone: 'warning',
  };
}

const DOTS = { success: 'bg-success', warning: 'bg-warning', muted: 'bg-muted-foreground' };

function StatusTile({
  store,
  onSet,
}: {
  store: Storefront;
  onSet: (patch: Partial<SaveStorefront>) => void;
}) {
  const [showQr, setShowQr] = useState(false);
  const status = statusOf(store, new Date());
  return (
    <Tile title="Your store" className="col-span-2 lg:col-span-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-3 font-heading text-3xl leading-none font-medium tracking-[-0.03em]">
            <span className={cn('size-3 shrink-0 rounded-full', DOTS[status.tone])} aria-hidden />
            {status.words}
          </p>
          <p className="text-sm text-text-secondary">{status.detail}</p>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-end gap-3 text-sm">
            Online store
            <Switch checked={store.enabled} onCheckedChange={(on) => onSet({ enabled: on })} />
          </label>
          {store.enabled && (
            <label className="flex items-center justify-end gap-3 text-sm">
              Taking orders
              <Switch
                checked={store.takingOrders}
                onCheckedChange={(on) => onSet({ takingOrders: on })}
              />
            </label>
          )}
        </div>
      </div>
      {store.enabled && (
        <div className="mt-auto flex flex-wrap items-center gap-3 rounded-(--radius-panel) bg-muted/60 p-3">
          <a
            href={store.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-sm text-accent-strong underline-offset-2 hover:underline"
          >
            {store.url}
          </a>
          <div className="flex gap-2">
            <CopyButton value={store.url} label="Copy link" />
            <Button variant="secondary" onClick={() => setShowQr(true)}>
              <QrCode size={16} strokeWidth={1.75} aria-hidden />
              QR code
            </Button>
          </div>
        </div>
      )}
      <Dialog open={showQr} onOpenChange={setShowQr}>
        {showQr && <QrCodeContent url={store.url} onClose={() => setShowQr(false)} />}
      </Dialog>
    </Tile>
  );
}

/**
 * The store's page as a customer's phone shows it: the look's colours, the cover and logo, and
 * the first items on the menu. It follows every change on this page at once.
 */
function PreviewTile({
  store,
  menu,
  businessName,
}: {
  store: Storefront;
  menu: Menu | undefined;
  businessName: string;
}) {
  const colours = STOREFRONT_LOOKS[store.theme].light;
  const items = (menu?.items ?? []).filter((item) => !item.soldOutToday).slice(0, 4);
  const initials = businessName
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <Tile title="What customers see" className="col-span-2 lg:col-span-1 lg:row-span-3">
      <div
        className={cn(
          'mx-auto flex w-full max-w-[15rem] flex-1 flex-col overflow-hidden rounded-[1.75rem] border-[6px] border-foreground/90 shadow-sm',
          !store.enabled && 'opacity-50 grayscale',
        )}
        style={{ backgroundColor: colours.page, color: colours.ink }}
        aria-label={`A picture of your store’s page in the ${STOREFRONT_LOOKS[store.theme].name} look`}
        role="img"
      >
        <div className="relative h-20 shrink-0" style={{ backgroundColor: colours.hero }}>
          {store.coverUrl && <img src={store.coverUrl} alt="" className="size-full object-cover" />}
        </div>
        <div className="flex flex-col gap-2 px-3 pb-3">
          <div className="relative -mt-6 flex items-end gap-2">
            <span
              className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 text-sm font-medium"
              style={{
                backgroundColor: colours.card,
                borderColor: colours.page,
                color: colours.ink,
              }}
            >
              {store.logoUrl ? (
                <img src={store.logoUrl} alt="" className="size-full object-cover" />
              ) : (
                initials
              )}
            </span>
          </div>
          <span className="text-sm font-medium leading-tight">{businessName}</span>
          {store.area && (
            <span className="text-[11px]" style={{ color: colours.muted }}>
              {store.area}
            </span>
          )}
          <div className="mt-1 flex flex-col gap-1.5">
            {items.length === 0 && (
              <span className="text-[11px]" style={{ color: colours.muted }}>
                Your menu shows here.
              </span>
            )}
            {items.map((item) => (
              <span
                key={item.id}
                className="flex items-center gap-2 rounded-lg p-1.5"
                style={{ backgroundColor: colours.card }}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md"
                  style={{ backgroundColor: colours.tile, color: colours.muted }}
                >
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageOff size={12} aria-hidden />
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[11px] font-medium">{item.name}</span>
                  <span className="text-[10px] tabular-nums" style={{ color: colours.muted }}>
                    {cedis(item.price)}
                  </span>
                </span>
              </span>
            ))}
          </div>
          <span
            className="mt-1 rounded-lg py-2 text-center text-[11px] font-medium"
            style={{ backgroundColor: colours.brand, color: colours.onBrand }}
          >
            View basket
          </span>
        </div>
      </div>
      <a
        href={store.url}
        target="_blank"
        rel="noreferrer"
        className="self-center text-sm font-medium text-accent-strong underline-offset-2 hover:underline"
      >
        Open the real page
      </a>
    </Tile>
  );
}

/** Today's orders from the store: how many, what they came to, and the latest few. */
function OnlineOrdersTile() {
  const { tenantId } = useSession();
  const query = { source: 'STOREFRONT' as const, limit: 100 };
  const orders = useQuery({
    queryKey: ['orders', tenantId, query],
    queryFn: () => fetchOrders(query),
  });
  const rows = orders.data ?? [];
  const counted = rows.filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED');
  const total = counted.reduce((sum, order) => sum + order.amountDue, 0);
  return (
    <Tile
      title="Online orders today"
      to="/orders?source=STOREFRONT"
      toLabel="Open today’s online orders"
    >
      {orders.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <>
          <span className="font-heading text-2xl leading-none tracking-[-0.03em] tabular-nums">
            {counted.length}
          </span>
          {counted.length > 0 && <Cedis amount={total} className="[--text-3xl:var(--text-lg)]" />}
          <ul className="mt-auto flex flex-col gap-1.5">
            {rows.slice(0, 3).map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  <span className="font-mono">{order.displayNumber}</span>{' '}
                  <span className="text-muted-foreground">{clock(order.takenAt)}</span>
                </span>
                <span className="text-muted-foreground">{paymentState(order).label}</span>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="text-xs text-muted-foreground">None yet today.</li>
            )}
          </ul>
        </>
      )}
    </Tile>
  );
}

function PaymentsTile({
  store,
  isOwner,
  cashOnPickup,
}: {
  store: Storefront;
  isOwner: boolean;
  cashOnPickup: boolean;
}) {
  const who = isOwner ? 'you connect your' : 'the owner connects the';
  return (
    <Tile
      title="Payments"
      {...(isOwner ? { to: '/settings?tab=payments', toLabel: 'Open payments in Settings' } : {})}
      tone={store.moolreConnected ? undefined : 'warning'}
    >
      {store.moolreConnected ? (
        <>
          <Badge tone="success" icon={<Check size={12} aria-hidden />}>
            Moolre connected
          </Badge>
          <p className="text-xs text-muted-foreground">
            Paying online goes straight into your own Moolre account.
          </p>
        </>
      ) : (
        <>
          <Badge tone="warning">Moolre not connected</Badge>
          <p className="text-xs text-muted-foreground">
            {cashOnPickup
              ? `Until ${who} Moolre account, customers can only pay cash when they collect.`
              : `Until ${who} Moolre account, nobody can pay, so the store can’t take orders.`}
          </p>
        </>
      )}
    </Tile>
  );
}

function DeliveryTile({ zones }: { zones: number }) {
  return (
    <Tile
      title="Delivery"
      to="/settings?tab=delivery"
      toLabel="Open delivery zones in Settings"
      className="col-span-2 lg:col-span-1"
    >
      <span className="font-heading text-2xl leading-none tracking-[-0.03em] tabular-nums">
        {zones}
      </span>
      <p className="text-xs text-muted-foreground">
        {zones === 0
          ? 'No delivery zones yet, so customers can only pick up. Add zones in Settings.'
          : zones === 1
            ? 'Zone customers can pick, with its fee.'
            : 'Zones customers can pick, each with its fee.'}
      </p>
    </Tile>
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
 * The week the store keeps (16 Sep, user request): the week in words here, edited in a drawer.
 * Outside these times the store's page shows as closed and nobody can order; "Taking orders"
 * closes it by hand whatever the hours say.
 */
function HoursTile({
  hours,
  busy,
  onSave,
}: {
  hours: StoreHours;
  busy: boolean;
  onSave: (hours: StoreHours) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tile title="Opening hours" className="col-span-2 lg:col-span-1">
      <p className="text-sm">{hoursWords(hours)}</p>
      <Button variant="secondary" className="mt-auto self-start" onClick={() => setOpen(true)}>
        Change hours
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        {open && (
          <HoursEditor
            saved={hours}
            busy={busy}
            onSave={(next) => {
              onSave(next);
              setOpen(false);
            }}
          />
        )}
      </Drawer>
    </Tile>
  );
}

function HoursEditor({
  saved,
  busy,
  onSave,
}: {
  saved: StoreHours;
  busy: boolean;
  onSave: (hours: StoreHours) => void;
}) {
  const [hours, setHours] = useState(saved);
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
  const changed = JSON.stringify(hours) !== JSON.stringify(saved);

  return (
    <DrawerContent
      title="Opening hours"
      description="Your store closes itself outside these times, and customers see when it opens again. A closing time earlier than the opening one means you close after midnight."
    >
      <div className="flex flex-col gap-5">
        <ul className="flex flex-col divide-y">
          {STORE_DAYS.map((day) => (
            <li key={day} className="flex flex-col gap-3 py-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
                <span className="flex items-center gap-3 text-sm text-muted-foreground">
                  {hours[day].open ? 'Open' : 'Closed'}
                  <Switch
                    checked={hours[day].open}
                    onCheckedChange={(open) => set(day, { open })}
                    aria-label={`Open on ${DAY_LABELS[day]}`}
                  />
                </span>
              </label>
              {hours[day].open && (
                <div className="grid grid-cols-2 gap-3">
                  <TimePicker
                    label="Opens"
                    value={hours[day].from}
                    onChange={(from) => set(day, { from })}
                    minuteStep={15}
                  />
                  <TimePicker
                    label="Closes"
                    value={hours[day].to}
                    onChange={(to) => set(day, { to })}
                    minuteStep={15}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Customers see: <span className="text-foreground">{hoursWords(hours)}</span>
        </p>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={everyDay}>
            Same times every day
          </Button>
          <Button disabled={!changed} loading={busy} onClick={() => onSave(hours)}>
            Save hours
          </Button>
        </div>
      </div>
    </DrawerContent>
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
      <p className="text-sm text-muted-foreground">
        Now: {STOREFRONT_LOOKS[theme].describe}. The preview follows it at once.
      </p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Store look">
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
    <div className="flex flex-col gap-5">
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
  onSave: (details: Pick<SaveStorefront, 'area' | 'phone'>) => void;
}) {
  const [area, setArea] = useState(saved.area);
  const [phone, setPhone] = useState(saved.phone);
  const changed = area !== saved.area || phone !== saved.phone;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Leave one blank to keep it off the page.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Area"
          maxLength={80}
          placeholder="For example: Osu, Accra"
          value={area}
          onChange={(event) => setArea(event.target.value)}
        />
        <Input
          label="Phone for customers"
          description="A Ghana number, like 024 123 4567."
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
