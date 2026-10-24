import { MENU_TEMPLATES, VENDOR_TYPES, pinProblem, type VendorType } from '@brixx/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Badge } from '@/components/arc/badge/badge';
import { Button } from '@/components/arc/button/button';
import { Input } from '@/components/arc/input/input';
import { RadioCards } from '@/components/arc/radio-cards/radio-cards';
import { RadioGroup } from '@/components/arc/radio-group/radio-group';
import { MoneyField, PlainField } from '@/components/app/money-field';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchMenu } from '../lib/menu';
import { parseAmount } from '../lib/money';
import { addStarterMenu, groupIdsFor, priceRows, starterMenu } from '../lib/onboarding';
import { queryClient, useContextQuery } from '../lib/query';
import { useSession } from '../lib/session';
import { fetchSettings, refreshSettings, saveMoolre } from '../lib/settings';
import { addStaff, fetchTeam, refreshTeam, resetPin } from '../lib/team';
import { ROLE_WORDS } from '../lib/words';

/** The steps after approval, numbered as they always were: the request was steps 1 and 2. */
const FIRST = 3;
const TOTAL = 7;
const BLANK: VendorType = 'OTHER';

/** Where the setup checklist (Home) and the Setup guide (Settings) can open it. */
export type SetupStart = 'menu' | 'pins' | 'moolre' | 'tablet';
const START_STEP: Record<SetupStart, number> = { menu: 3, pins: 5, moolre: 6, tablet: 7 };

/**
 * Setting up an approved business (plan.md §3.1), from a phone or a laptop: a starter menu, its
 * prices, PINs, the owner's own Moolre account, then the tablet. Joining (the business's name and
 * kind) is `/join`; this opens from Home's setup checklist or Settings → Setup guide, at the step
 * passed in `state.start`, and closing it goes back to `state.back`.
 */
export default function SetupPage() {
  const { token, tenantId } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const context = useContextQuery();
  const state = location.state as { back?: unknown; start?: unknown } | null;
  const [step, setStep] = useState(() =>
    typeof state?.start === 'string' && state.start in START_STEP
      ? START_STEP[state.start as SetupStart]
      : FIRST,
  );
  const [template, setTemplate] = useState<VendorType | null>(null);

  if (!token) return <Navigate to="/sign-in" replace />;
  if (!tenantId) return <Navigate to="/join" replace />;
  if (!context.data) {
    return (
      <div className="mx-auto flex min-h-full max-w-[420px] flex-col gap-4 px-5 pt-24">
        {context.isError ? (
          <Alert tone="danger" title="Couldn’t load your business">
            {context.error.message}
          </Alert>
        ) : (
          <>
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-40 w-full rounded-(--radius-surface)" />
          </>
        )}
      </div>
    );
  }

  const vendorType = context.data.vendorType;
  const next = () => setStep((current) => Math.min(TOTAL, current + 1));
  // From the PINs, back goes to the menu choice, which knows whether a menu is already there.
  const back = step > FIRST ? () => setStep(step === 5 ? FIRST : step - 1) : undefined;
  const from = state?.back;
  const done = () => navigate(typeof from === 'string' ? from : '/', { replace: true });
  const iconButton =
    'flex size-10 shrink-0 items-center justify-center rounded-(--radius-control) text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

  return (
    <div className="mx-auto flex min-h-full max-w-[420px] flex-col bg-background">
      <div className="flex items-center gap-3 px-5 pt-8 pb-4">
        {back ? (
          <button type="button" onClick={back} aria-label="Back" className={iconButton}>
            <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
          </button>
        ) : (
          <button type="button" onClick={done} aria-label="Close" className={iconButton}>
            <X size={20} strokeWidth={1.75} aria-hidden />
          </button>
        )}
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Setup"
          aria-valuemin={1}
          aria-valuemax={TOTAL - FIRST + 1}
          aria-valuenow={step - FIRST + 1}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${((step - FIRST + 1) / (TOTAL - FIRST + 1)) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {step - FIRST + 1} of {TOTAL - FIRST + 1}
        </span>
      </div>

      <div className="flex-1 px-5 pb-44">
        {step === 3 && (
          <TemplateStep
            vendorType={vendorType}
            value={template ?? vendorType}
            onChange={setTemplate}
            onNext={(hasMenu) => setStep(hasMenu ? 5 : 4)}
          />
        )}
        {step === 4 && <PricesStep template={template ?? vendorType} onNext={next} />}
        {step === 5 && <StaffStep staffId={context.data.staffId} onNext={next} />}
        {step === 6 && <MoolreStep onNext={next} />}
        {step === 7 && <InstallStep business={context.data.businessName} onDone={done} />}
      </div>
    </div>
  );
}

function Heading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col gap-2 pt-6 pb-8">
      <h1 className="font-heading text-3xl leading-[1.1] font-medium tracking-[-0.03em]">
        {title}
      </h1>
      <p className="text-text-secondary">{detail}</p>
    </div>
  );
}

/** The step's one main button, fixed at the bottom where a thumb reaches it. */
function Footer({
  label,
  onClick,
  disabled,
  busy,
  note,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  note?: ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t bg-background">
      <div className="mx-auto flex max-w-[420px] flex-col gap-2 px-5 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <Button size="lg" className="w-full" onClick={onClick} disabled={disabled} loading={busy}>
          {label}
        </Button>
        {note && <p className="text-center text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

function TemplateStep({
  vendorType,
  value,
  onChange,
  onNext,
}: {
  vendorType: VendorType;
  value: VendorType;
  onChange: (value: VendorType) => void;
  onNext: (hasMenu: boolean) => void;
}) {
  const { tenantId } = useSession();
  const menu = useQuery({ queryKey: ['menu', tenantId], queryFn: fetchMenu });
  const hasMenu = (menu.data?.items.length ?? 0) > 0;
  const order = [
    vendorType,
    ...VENDOR_TYPES.filter((type) => type !== vendorType && type !== BLANK),
    ...(vendorType === BLANK ? [] : [BLANK]),
  ];

  if (menu.isPending) {
    return (
      <div className="flex flex-col gap-3 pt-6" aria-busy="true">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-20 w-full rounded-(--radius-panel)" />
        <Skeleton className="h-20 w-full rounded-(--radius-panel)" />
      </div>
    );
  }
  if (hasMenu) {
    return (
      <>
        <Heading
          title="You already have a menu"
          detail={`${menu.data!.items.length} items. Change them any time on the Menu page.`}
        />
        <Footer label="Continue" onClick={() => onNext(true)} />
      </>
    );
  }

  return (
    <>
      <Heading title="Choose a starter menu" detail="You can change everything after setup." />
      <RadioCards
        aria-label="Starter menu"
        layout="list"
        value={value}
        onValueChange={(type) => onChange(type as VendorType)}
        options={order.map((type) => {
          const template = MENU_TEMPLATES[type];
          const names = template.categories.flatMap((c) => c.items.map((i) => i.name));
          return {
            value: type,
            label: type === BLANK ? 'Start blank' : template.label,
            description: names.length
              ? `${names.slice(0, 5).join(', ')}${names.length > 5 ? `, and ${names.length - 5} more` : ''}`
              : 'Add your own items on the Menu page.',
            meta:
              type === vendorType && type !== BLANK ? (
                <Badge tone="info" size="sm">
                  Suggested
                </Badge>
              ) : undefined,
          };
        })}
      />
      <Footer label="Continue" onClick={() => onNext(false)} />
    </>
  );
}

function PricesStep({
  template: templateKey,
  onNext,
}: {
  template: VendorType;
  onNext: () => void;
}) {
  const template = MENU_TEMPLATES[templateKey];
  const rows = useMemo(() => priceRows(template), [template]);
  const [groupIds] = useState(() => groupIdsFor(template));
  const [texts, setTexts] = useState<Record<string, string>>({});
  const prices = Object.fromEntries(
    Object.entries(texts).flatMap(([key, text]) => {
      const amount = parseAmount(text);
      return amount === null || text.trim() === '' ? [] : [[key, amount]];
    }),
  );
  const bad = Object.entries(texts).some(
    ([, text]) => text.trim() !== '' && parseAmount(text) === null,
  );
  const priced = Object.keys(prices).length;

  const saving = useMutation({
    mutationFn: () => addStarterMenu(starterMenu(template, prices, groupIds)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
      onNext();
    },
  });

  if (!rows.length) {
    return (
      <>
        <Heading title="Your menu" detail="You’ll add your items on the Menu page after setup." />
        <Footer label="Continue" onClick={onNext} />
      </>
    );
  }

  return (
    <>
      <Heading
        title="Set your prices"
        detail="Type a price for each item you sell. Leave one blank and it stays off the menu."
      />
      <ul className="flex flex-col divide-y overflow-hidden rounded-(--radius-surface) border bg-card">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0 truncate text-sm">{row.label}</span>
            <MoneyField
              label={`${row.label} price`}
              hideLabel
              className="w-32 shrink-0"
              placeholder="0.00"
              value={texts[row.key] ?? ''}
              onChange={(value) => setTexts({ ...texts, [row.key]: value })}
            />
          </li>
        ))}
      </ul>
      {saving.error && (
        <div className="mt-4">
          <Alert tone="danger" title="Couldn’t save the menu">
            {saving.error.message}
          </Alert>
        </div>
      )}
      <Footer
        label={priced ? `Save ${priced} ${priced === 1 ? 'price' : 'prices'}` : 'Skip for now'}
        onClick={() => (priced ? saving.mutate() : onNext())}
        disabled={bad}
        busy={saving.isPending}
        note={
          bad
            ? 'A price isn’t an amount. Use numbers like 35 or 35.50.'
            : 'Extras like protein start at no charge; set their prices on the Menu page.'
        }
      />
    </>
  );
}

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

/** A PIN typed twice. It's never shown, so there's no "show" button either. */
function PinPair({
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
  return (
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
        label="Again"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        value={again}
        onChange={(value) => onAgain(digits(value))}
      />
    </div>
  );
}

function pinWords(pin: string, again: string): string | null {
  if (pin.length < 6) return 'A PIN is 6 digits.';
  const problem = pinProblem(pin);
  if (problem) return `${problem}.`;
  return pin === again ? null : 'The two PINs don’t match.';
}

function StaffStep({ staffId, onNext }: { staffId: string; onNext: () => void }) {
  const { tenantId } = useSession();
  const team = useQuery({ queryKey: ['team', tenantId], queryFn: fetchTeam });
  const [ownerPin, setOwnerPin] = useState('');
  const [ownerAgain, setOwnerAgain] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'STAFF' | 'RIDER' | 'MANAGER'>('STAFF');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');

  const me = team.data?.staff.find((member) => member.id === staffId);
  const others = team.data?.staff.filter((member) => member.id !== staffId) ?? [];
  const ownerProblem = pinWords(ownerPin, ownerAgain);
  const staffProblem = !name.trim() ? 'Type their name.' : pinWords(pin, again);

  const savingOwner = useMutation({
    mutationFn: () => resetPin(staffId, ownerPin),
    onSuccess: () => {
      setOwnerPin('');
      setOwnerAgain('');
      refreshTeam();
    },
  });
  const adding = useMutation({
    mutationFn: () => addStaff({ displayName: name.trim(), role, pin }),
    onSuccess: () => {
      setName('');
      setPin('');
      setAgain('');
      refreshTeam();
    },
  });

  if (team.isPending) {
    return (
      <div className="flex flex-col gap-3 pt-6" aria-busy="true">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-32 w-full rounded-(--radius-panel)" />
      </div>
    );
  }

  return (
    <>
      <Heading
        title="PINs for the tablet"
        detail="Everyone unlocks the tablet with their own 6-digit PIN. PINs aren’t shown again, so tell each person theirs."
      />

      <section className="mb-10 flex flex-col gap-3" aria-labelledby="your-pin">
        <h2 id="your-pin" className="font-medium">
          Your PIN
        </h2>
        {me?.hasPin && !ownerPin ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <Check size={16} strokeWidth={2} aria-hidden />
            Your PIN is set.
          </p>
        ) : (
          <>
            <PinPair
              pin={ownerPin}
              again={ownerAgain}
              onPin={setOwnerPin}
              onAgain={setOwnerAgain}
              label="Your PIN"
            />
            {ownerPin.length === 6 && ownerProblem && (
              <p className="text-sm text-warning">{ownerProblem}</p>
            )}
            {savingOwner.error && (
              <Alert tone="danger" title="Couldn’t set your PIN">
                {savingOwner.error.message}
              </Alert>
            )}
            <Button
              variant="secondary"
              className="w-full"
              disabled={!!ownerProblem}
              loading={savingOwner.isPending}
              onClick={() => savingOwner.mutate()}
            >
              Set my PIN
            </Button>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="your-staff">
        <h2 id="your-staff" className="font-medium">
          Your staff
        </h2>
        {others.length > 0 && (
          <ul className="flex flex-col divide-y overflow-hidden rounded-(--radius-panel) border bg-card">
            {others.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">{member.displayName}</span>
                <span className="text-xs text-muted-foreground">
                  {ROLE_WORDS[member.role]}, {member.hasPin ? 'PIN set' : 'no PIN'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Input
          label="Their name"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
        <RadioGroup
          label="Role"
          value={role}
          onValueChange={(value) => setRole(value as 'STAFF' | 'RIDER' | 'MANAGER')}
          options={[
            {
              value: 'STAFF',
              label: 'Staff',
              description: 'Take orders and look after the drawer.',
            },
            { value: 'RIDER', label: 'Rider', description: 'Only see and update deliveries.' },
            {
              value: 'MANAGER',
              label: 'Manager',
              description: 'Also refunds, payouts and the menu, on this dashboard.',
            },
          ]}
        />
        <PinPair pin={pin} again={again} onPin={setPin} onAgain={setAgain} label="Their PIN" />
        {pin.length === 6 && staffProblem && <p className="text-sm text-warning">{staffProblem}</p>}
        {adding.error && (
          <Alert tone="danger" title="Couldn’t add them">
            {adding.error.message}
          </Alert>
        )}
        <Button
          variant="secondary"
          className="w-full"
          disabled={!!staffProblem}
          loading={adding.isPending}
          onClick={() => adding.mutate()}
        >
          Add staff member
        </Button>
      </section>

      <Footer
        label="Continue"
        onClick={onNext}
        disabled={!me?.hasPin}
        note={
          me?.hasPin
            ? 'You can add more people later on the Staff page.'
            : 'Set your own PIN first.'
        }
      />
    </>
  );
}

type MoolreState = 'idle' | 'failed' | 'connected';

function MoolreStep({ onNext }: { onNext: () => void }) {
  const { tenantId } = useSession();
  const settings = useQuery({ queryKey: ['settings', tenantId], queryFn: fetchSettings });
  const [apiUser, setApiUser] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [email, setEmail] = useState('');
  const connecting = useMutation({
    mutationFn: () =>
      saveMoolre({
        apiUser: apiUser.trim(),
        publicKey: publicKey.trim(),
        accountNumber: accountNumber.trim(),
        email: email.trim(),
      }),
    onSuccess: refreshSettings,
  });
  const connected = settings.data?.moolre.connected ?? false;
  const state: MoolreState = connected ? 'connected' : connecting.isError ? 'failed' : 'idle';
  const ready =
    apiUser.trim() &&
    publicKey.trim().length >= 8 &&
    /^\d{6,20}$/.test(accountNumber.trim()) &&
    email.includes('@');

  return (
    <>
      <Heading
        title="Connect Moolre"
        detail="Payment-link money goes straight into your own Moolre account. Brixx never holds your money."
      />
      {state === 'connected' ? (
        <Alert tone="success" title="Connected">
          Payments land in the Moolre account ending {settings.data?.moolre.accountEnding}.
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <Input
            label="Moolre username"
            autoComplete="off"
            value={apiUser}
            onChange={(event) => setApiUser(event.target.value)}
          />
          <Input
            label="Public key"
            description="From app.moolre.com. Only the public key, never the private one."
            type="password"
            autoComplete="off"
            value={publicKey}
            onChange={(event) => setPublicKey(event.target.value)}
          />
          <Input
            label="Moolre account number"
            inputMode="numeric"
            autoComplete="off"
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
          />
          <Input
            label="Email on the account"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {state === 'failed' && (
            <Alert tone="danger" title="That didn’t connect">
              {connecting.error?.message}
            </Alert>
          )}
          <Button
            variant="secondary"
            className="w-full"
            disabled={!ready}
            loading={connecting.isPending}
            onClick={() => connecting.mutate()}
          >
            {connecting.isPending ? 'Checking with Moolre…' : 'Test connection'}
          </Button>
        </div>
      )}
      <Footer
        label={connected ? 'Continue' : 'Skip for now'}
        onClick={onNext}
        note={
          connected
            ? undefined
            : 'You can connect Moolre later in Settings. Until then, phone orders can’t be paid.'
        }
      />
    </>
  );
}

function InstallStep({ business, onDone }: { business: string; onDone: () => void }) {
  const steps = [
    'Install the Brixx app on the counter tablet (we send you the link).',
    'Open it and sign in with the email you used here.',
    `Pick ${business}, then set the tablet down at the counter.`,
    'Each person unlocks it with their own PIN.',
  ];
  return (
    <>
      <Heading
        title="Set up the tablet"
        detail="The counter runs on your own Android tablet, even without internet."
      />
      {/* A real sequence, so it's numbered. */}
      <ol className="flex flex-col divide-y overflow-hidden rounded-(--radius-surface) border bg-card">
        {steps.map((text, index) => (
          <li key={text} className="flex gap-3 px-4 py-3.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-xs text-accent-strong tabular-nums">
              {index + 1}
            </span>
            <span className="text-sm">{text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-center font-medium">You’re all set.</p>
      <Footer label="Go to the dashboard" onClick={onDone} />
    </>
  );
}
