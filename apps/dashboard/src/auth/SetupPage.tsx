import { MENU_TEMPLATES, VENDOR_TYPES, pinProblem, type VendorType } from '@plateraa/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { fetchMenu } from '../lib/menu';
import { parseAmount } from '../lib/money';
import {
  addStarterMenu,
  createBusiness,
  groupIdsFor,
  priceRows,
  starterMenu,
} from '../lib/onboarding';
import { queryClient, useContextQuery } from '../lib/query';
import { session, useSession } from '../lib/session';
import { fetchSettings, refreshSettings, saveMoolre } from '../lib/settings';
import { addStaff, fetchTeam, refreshTeam, resetPin } from '../lib/team';
import { ROLE_WORDS, VENDOR_TYPE_WORDS } from '../lib/words';
import { Button, ErrorNote, FieldLabel, PillFilter, Spinner, TextInput, cx } from '../ui/controls';

const TOTAL = 7;
const BLANK: VendorType = 'OTHER';

/**
 * Setting up a business from a phone (plan.md §3.1), to the design: name, type, a starter menu,
 * its prices, PINs, the owner's own Moolre account, then the tablet. Opened with a business
 * already chosen (Settings → Setup guide), it starts at the menu.
 */
export default function SetupPage() {
  const { token, tenantId } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const context = useContextQuery();
  const [startedWithBusiness] = useState(() => tenantId !== null);
  const [step, setStep] = useState(startedWithBusiness ? 3 : 1);
  const [name, setName] = useState('');
  const [chosenType, setChosenType] = useState<VendorType | null>(null);
  const [template, setTemplate] = useState<VendorType | null>(null);

  if (!token) return <Navigate to="/sign-in" replace />;
  if (step > 2 && !context.data) {
    return (
      <div className="flex h-full items-center justify-center">
        {context.isError ? <ErrorNote>{context.error.message}</ErrorNote> : <Spinner />}
      </div>
    );
  }

  const vendorType = chosenType ?? context.data?.vendorType ?? 'CHOP_BAR';
  const next = () => setStep((current) => Math.min(TOTAL, current + 1));
  // The business exists from step 3 on, so there's no going back past it; from the PINs, back
  // goes to the menu choice, which knows whether a menu is already there.
  const back =
    step === 2 ? () => setStep(1) : step > 3 ? () => setStep(step === 5 ? 3 : step - 1) : undefined;
  // Opened from Settings (the "Setup guide"), closing it goes back there.
  const from: unknown = (location.state as { back?: unknown } | null)?.back;
  const done = () => navigate(typeof from === 'string' ? from : '/', { replace: true });

  return (
    <div className="mx-auto flex min-h-full max-w-[390px] flex-col bg-bg">
      <div className="flex items-center gap-3 px-5 pt-10 pb-4">
        {back ? (
          <button
            type="button"
            onClick={back}
            aria-label="Back"
            className="mr-1 text-2xl leading-none text-muted-foreground"
          >
            ‹
          </button>
        ) : startedWithBusiness ? (
          <button
            type="button"
            onClick={done}
            aria-label="Close"
            className="mr-1 text-2xl leading-none text-muted-foreground"
          >
            ×
          </button>
        ) : null}
        <div className="h-1.5 flex-1 rounded-full bg-tile">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${(step / TOTAL) * 100}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {step} of {TOTAL}
        </span>
      </div>

      <div className="flex-1 px-5 pb-40">
        {step === 1 && <NameStep value={name} onChange={setName} onNext={next} />}
        {step === 2 && (
          <TypeStep
            name={name}
            value={chosenType}
            onChange={setChosenType}
            onCreated={(id) => {
              session.chooseBusiness(id);
              void queryClient.invalidateQueries({ queryKey: ['businesses'] });
              next();
            }}
          />
        )}
        {step === 3 && (
          <TemplateStep
            vendorType={vendorType}
            value={template ?? vendorType}
            onChange={setTemplate}
            onNext={(hasMenu) => setStep(hasMenu ? 5 : 4)}
          />
        )}
        {step === 4 && <PricesStep template={template ?? vendorType} onNext={next} />}
        {step === 5 && <StaffStep staffId={context.data!.staffId} onNext={next} />}
        {step === 6 && <MoolreStep onNext={next} />}
        {step === 7 && <InstallStep business={context.data!.businessName} onDone={done} />}
      </div>
    </div>
  );
}

function Heading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="pt-8">
      <h1 className="mb-1 text-2xl font-bold">{title}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

/** The design's fixed button at the bottom of each step. */
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
    <div className="fixed inset-x-0 bottom-0 border-t border-border bg-bg">
      <div className="mx-auto max-w-[390px] px-5 pt-4 pb-8">
        <Button full onClick={onClick} disabled={disabled} busy={busy}>
          {label}
        </Button>
        {note && <p className="mt-2 text-center text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

function NameStep({
  value,
  onChange,
  onNext,
}: {
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
}) {
  return (
    <>
      <Heading
        title="What’s your business called?"
        detail="It shows on receipts and in the payment link texts."
      />
      <TextInput
        autoFocus
        maxLength={80}
        value={value}
        placeholder="e.g. Ama's Kitchen"
        onChange={(event) => onChange(event.target.value)}
      />
      <Footer label="Continue" onClick={onNext} disabled={value.trim().length < 2} />
    </>
  );
}

function TypeStep({
  name,
  value,
  onChange,
  onCreated,
}: {
  name: string;
  value: VendorType | null;
  onChange: (value: VendorType) => void;
  onCreated: (tenantId: string) => void;
}) {
  const creating = useMutation({
    mutationFn: () => createBusiness(name.trim(), value!),
    onSuccess: (created) => onCreated(created.tenantId),
  });
  return (
    <>
      <Heading title="What kind of food business?" detail="It picks a starter menu for you." />
      <div className="grid grid-cols-2 gap-3">
        {VENDOR_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cx(
              'h-16 rounded-xl border px-4 text-left text-sm font-medium transition-colors',
              value === type
                ? 'border-brand bg-brand-subtle text-brand'
                : 'border-border bg-surface',
            )}
          >
            {VENDOR_TYPE_WORDS[type]}
          </button>
        ))}
      </div>
      {creating.error && (
        <div className="mt-4">
          <ErrorNote>{creating.error.message}</ErrorNote>
        </div>
      )}
      <Footer
        label="Continue"
        onClick={() => creating.mutate()}
        disabled={!value}
        busy={creating.isPending}
      />
    </>
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
      <div className="flex justify-center pt-20">
        <Spinner />
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
      <div className="space-y-3">
        {order.map((type) => {
          const template = MENU_TEMPLATES[type];
          const names = template.categories.flatMap((c) => c.items.map((i) => i.name));
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              className={cx(
                'w-full rounded-xl border p-4 text-left transition-colors',
                value === type ? 'border-brand bg-brand-subtle' : 'border-border bg-surface',
              )}
            >
              <p className={cx('text-sm font-semibold', value === type && 'text-brand')}>
                {type === BLANK ? 'Start blank' : template.label}
                {type === vendorType && type !== BLANK && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">Suggested</span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {names.length
                  ? `${names.slice(0, 5).join(', ')}${names.length > 5 ? `, and ${names.length - 5} more` : ''}`
                  : 'Add your own items on the Menu page.'}
              </p>
            </button>
          );
        })}
      </div>
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
      <div className="space-y-2">
        {rows.map((row) => (
          <label
            key={row.key}
            className="flex h-14 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 focus-within:border-brand"
          >
            <span className="min-w-0 truncate text-sm">{row.label}</span>
            <span className="flex shrink-0 items-center gap-1 font-mono">
              <span className="text-xs text-muted-foreground">GH₵</span>
              <input
                inputMode="decimal"
                aria-label={`${row.label} price`}
                value={texts[row.key] ?? ''}
                placeholder="0.00"
                onChange={(event) => setTexts({ ...texts, [row.key]: event.target.value })}
                className="w-20 bg-transparent text-right text-base font-medium outline-none placeholder:text-muted-foreground/50"
              />
            </span>
          </label>
        ))}
      </div>
      {saving.error && (
        <div className="mt-4">
          <ErrorNote>{saving.error.message}</ErrorNote>
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
  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel>{label}</FieldLabel>
        <TextInput
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          className="font-mono tracking-widest"
          value={pin}
          onChange={(event) => onPin(digits(event.target.value))}
        />
      </div>
      <div>
        <FieldLabel>Again</FieldLabel>
        <TextInput
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
      <div className="flex justify-center pt-20">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <Heading
        title="PINs for the tablet"
        detail="Everyone unlocks the tablet with their own 6-digit PIN. PINs aren’t shown again, so tell each person theirs."
      />

      <section className="mb-8">
        <p className="mb-2 text-sm font-semibold">Your PIN</p>
        {me?.hasPin && !ownerPin ? (
          <p className="rounded-xl bg-green-bg px-4 py-3 text-sm text-green">Your PIN is set.</p>
        ) : (
          <div className="space-y-3">
            <PinPair
              pin={ownerPin}
              again={ownerAgain}
              onPin={setOwnerPin}
              onAgain={setOwnerAgain}
              label="Your PIN"
            />
            {ownerPin.length === 6 && ownerProblem && (
              <p className="text-xs text-amber">{ownerProblem}</p>
            )}
            {savingOwner.error && <ErrorNote>{savingOwner.error.message}</ErrorNote>}
            <Button
              variant="secondary"
              full
              disabled={!!ownerProblem}
              busy={savingOwner.isPending}
              onClick={() => savingOwner.mutate()}
            >
              Set my PIN
            </Button>
          </div>
        )}
      </section>

      <section>
        <p className="mb-2 text-sm font-semibold">Your staff</p>
        {others.length > 0 && (
          <div className="mb-4 divide-y divide-border rounded-xl border border-border bg-surface">
            {others.map((member) => (
              <div key={member.id} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm font-medium">{member.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {ROLE_WORDS[member.role]} · {member.hasPin ? 'PIN set' : 'no PIN'}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-3">
          <TextInput
            value={name}
            maxLength={60}
            placeholder="Their name"
            onChange={(event) => setName(event.target.value)}
          />
          <PillFilter
            label="Role"
            options={[
              { value: 'STAFF', label: 'Staff' },
              { value: 'RIDER', label: 'Rider' },
              { value: 'MANAGER', label: 'Manager' },
            ]}
            value={role}
            onChange={setRole}
          />
          <PinPair pin={pin} again={again} onPin={setPin} onAgain={setAgain} label="Their PIN" />
          {pin.length === 6 && staffProblem && <p className="text-xs text-amber">{staffProblem}</p>}
          {adding.error && <ErrorNote>{adding.error.message}</ErrorNote>}
          <Button
            variant="secondary"
            full
            disabled={!!staffProblem}
            busy={adding.isPending}
            onClick={() => adding.mutate()}
          >
            Add staff member
          </Button>
        </div>
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
        detail="Payment-link money goes straight into your own Moolre account. Plateraa never holds your money."
      />
      {state === 'connected' ? (
        <div className="rounded-xl border border-green/20 bg-green-bg p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green text-xl text-white">
            ✓
          </div>
          <p className="font-semibold text-green">Connected</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Payments land in the Moolre account ending {settings.data?.moolre.accountEnding}.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="m-user">Moolre username</FieldLabel>
            <TextInput
              id="m-user"
              autoComplete="off"
              value={apiUser}
              onChange={(event) => setApiUser(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="m-key">Public key</FieldLabel>
            <TextInput
              id="m-key"
              type="password"
              autoComplete="off"
              value={publicKey}
              onChange={(event) => setPublicKey(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="m-account">Moolre account number</FieldLabel>
            <TextInput
              id="m-account"
              inputMode="numeric"
              autoComplete="off"
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="m-email">Email on the account</FieldLabel>
            <TextInput
              id="m-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            From app.moolre.com. Only the public key, never the private one.
          </p>
          {state === 'failed' && (
            <div className="rounded-xl border border-red/20 bg-red-bg p-4 text-red">
              <p className="mb-1 text-sm font-semibold">That didn’t connect</p>
              <p className="text-xs">{connecting.error?.message}</p>
            </div>
          )}
          <Button
            variant="secondary"
            full
            disabled={!ready}
            busy={connecting.isPending}
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
    'Install the Plateraa app on the counter tablet (we send you the link).',
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
      <ol className="space-y-3">
        {steps.map((text, index) => (
          <li key={text} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-subtle font-mono text-sm font-semibold text-brand">
              {index + 1}
            </span>
            <span className="text-sm">{text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-center text-sm font-semibold">You’re all set.</p>
      <Footer label="Go to the dashboard →" onClick={onDone} />
    </>
  );
}
