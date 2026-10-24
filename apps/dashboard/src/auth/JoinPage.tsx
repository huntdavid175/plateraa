import { ORDER_WAYS, VENDOR_TYPES, normalizeGhanaPhone, type OrderWay } from '@brixx/shared';
import type { VendorType } from '@brixx/shared';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check, Phone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Checkbox } from '@/components/arc/checkbox/checkbox';
import { Input } from '@/components/arc/input/input';
import { RadioCards } from '@/components/arc/radio-cards/radio-cards';
import { Skeleton } from '@/components/ui/skeleton';
import { requestBusiness } from '../lib/onboarding';
import { queryClient, signOutAndForget, useBusinesses, useSlow } from '../lib/query';
import { useSession } from '../lib/session';
import { ORDER_WAY_WORDS, VENDOR_TYPE_WORDS } from '../lib/words';
import { JoinLayout } from './JoinLayout';

/**
 * Asking to join Brixx, after the account is made (24 Oct, user decision): the business, then how
 * to reach it. The request waits for Brixx to approve it, and until then signing in lands here on
 * "request received". Approved businesses go on to the dashboard, which offers the setup checklist.
 */
export default function JoinPage() {
  const { token } = useSession();
  const businesses = useBusinesses();
  const slow = useSlow(businesses.isPending);
  // What was just sent: "received" shows the moment the server takes it, and says which number
  // we'll call, without waiting for the list of businesses to load again.
  const [sent, setSent] = useState<{ business: string; phone: string } | null>(null);

  if (!token) return <Navigate to="/sign-up" replace />;
  if (sent) return <Received business={sent.business} phone={sent.phone} />;

  if (businesses.isPending || businesses.isError) {
    return (
      <JoinLayout stage={2} title="Tell us about your business">
        {businesses.isError ? (
          <Alert tone="danger" title="Couldn’t load your account">
            {businesses.error.message}
          </Alert>
        ) : (
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-40 w-full rounded-(--radius-surface)" />
            {slow && (
              <p className="text-sm text-muted-foreground" role="status">
                Brixx is waking up. This can take up to a minute.
              </p>
            )}
          </div>
        )}
      </JoinLayout>
    );
  }

  if (businesses.data.some((business) => business.status === 'ACTIVE')) {
    return <Navigate to="/businesses" replace />;
  }
  const waiting = businesses.data.find((business) => business.status === 'PENDING');
  if (waiting) return <Received business={waiting.name} phone={null} />;

  return (
    <RequestForm
      onSent={(business, phone) => {
        setSent({ business, phone });
        void queryClient.invalidateQueries({ queryKey: ['businesses'] });
      }}
    />
  );
}

function RequestForm({ onSent }: { onSent: (business: string, phone: string) => void }) {
  const [screen, setScreen] = useState<'business' | 'contact'>('business');
  const [name, setName] = useState('');
  const [vendorType, setVendorType] = useState<VendorType | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  // Set once a step's button is pressed: from then on, whatever is missing says so.
  const [tried, setTried] = useState(false);
  const [area, setArea] = useState('');
  const [ways, setWays] = useState<OrderWay[]>([]);

  const normalPhone = normalizeGhanaPhone(phone);
  const sending = useMutation({
    // The form says why underneath; a toast on top of it would only repeat itself.
    meta: { quiet: true },
    mutationFn: () =>
      requestBusiness({
        name: name.trim(),
        vendorType: vendorType!,
        phone: phone.trim(),
        area: area.trim(),
        orderWays: ways,
      }),
    onSuccess: () => onSent(name.trim(), phone.trim()),
  });
  const slow = useSlow(sending.isPending);

  if (screen === 'business') {
    const ready = name.trim().length >= 2 && vendorType !== null;
    const next = (event: FormEvent) => {
      event.preventDefault();
      if (!ready) return setTried(true);
      setTried(false);
      setScreen('contact');
    };
    return (
      <JoinLayout
        stage={2}
        title="Tell us about your business"
        subtitle="We look at every request and call you to set up together."
      >
        <form className="flex flex-col gap-6" onSubmit={next}>
          <Input
            label="Business name"
            autoFocus
            maxLength={80}
            autoComplete="organization"
            placeholder="For example: Ama’s Kitchen"
            value={name}
            error={tried && name.trim().length < 2 ? 'Type your business’s name.' : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-sm font-medium">What kind of food business?</legend>
            <RadioCards
              aria-label="Kind of business"
              layout="grid"
              minColumnWidth={180}
              value={vendorType}
              onValueChange={(type) => setVendorType(type as VendorType)}
              options={VENDOR_TYPES.map((type) => ({
                value: type,
                label: type === 'OTHER' ? 'Something else' : VENDOR_TYPE_WORDS[type],
              }))}
            />
            {tried && !vendorType && (
              <p className="text-sm text-danger">Pick the one closest to your business.</p>
            )}
          </fieldset>
          <Button type="submit" size="lg" className="w-full">
            Continue
          </Button>
        </form>
      </JoinLayout>
    );
  }

  const phoneError =
    (phoneTouched || tried) && !normalPhone
      ? phone.trim()
        ? 'Enter a Ghanaian number, like 024 123 4567.'
        : tried
          ? 'Type the number we should call.'
          : undefined
      : undefined;
  const areaError = tried && area.trim().length < 2 ? 'Type your area or town.' : undefined;
  const ready = normalPhone !== null && area.trim().length >= 2 && ways.length > 0;
  const toggle = (way: OrderWay, on: boolean) =>
    setWays((current) => (on ? [...current, way] : current.filter((item) => item !== way)));

  return (
    <JoinLayout
      stage={2}
      title="How do we reach you?"
      subtitle={`So we can call you about ${name.trim()}.`}
      top={
        <button
          type="button"
          onClick={() => setScreen('business')}
          className="-ml-2 flex items-center gap-1.5 self-start rounded-(--radius-control) px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
          Back
        </button>
      }
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          setTried(true);
          if (ready) sending.mutate();
        }}
      >
        <Input
          label="Phone or WhatsApp number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          placeholder="024 123 4567"
          value={phone}
          error={phoneError}
          onChange={(event) => setPhone(event.target.value)}
          onBlur={() => setPhoneTouched(true)}
        />
        <Input
          label="Area or town"
          maxLength={80}
          autoComplete="address-level2"
          placeholder="For example: Osu, Accra"
          value={area}
          error={areaError}
          onChange={(event) => setArea(event.target.value)}
        />
        <fieldset>
          <legend className="text-sm font-medium">How do customers order from you today?</legend>
          <p
            className={
              tried && ways.length === 0
                ? 'mt-1 text-sm text-danger'
                : 'mt-1 text-sm text-muted-foreground'
            }
          >
            {tried && ways.length === 0 ? 'Tick at least one.' : 'Tick all that apply.'}
          </p>
          <div className="mt-3 flex flex-col divide-y overflow-hidden rounded-(--radius-panel) border bg-card">
            {ORDER_WAYS.map((way) => (
              <div key={way} className="px-4 py-2">
                <Checkbox
                  label={ORDER_WAY_WORDS[way]}
                  checked={ways.includes(way)}
                  onCheckedChange={(on) => toggle(way, on === true)}
                />
              </div>
            ))}
          </div>
        </fieldset>
        {sending.error && (
          <Alert tone="danger" title="Couldn’t send your request">
            {sending.error.message}
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" className="w-full" loading={sending.isPending}>
            Send my request
          </Button>
          {slow && (
            <p className="text-sm text-muted-foreground" role="status">
              Brixx is waking up. This can take up to a minute.
            </p>
          )}
        </div>
      </form>
    </JoinLayout>
  );
}

/** What the call covers, so the owner can have things ready. */
const ON_THE_CALL = [
  'Your menu and prices, from a starter menu for your kind of business',
  'Your Moolre account, so mobile money goes straight to you',
  'The Brixx app on your Android tablet, and PINs for your staff',
];

function Received({ business, phone }: { business: string; phone: string | null }) {
  return (
    <JoinLayout
      stage={3}
      title="We’ve got your request"
      subtitle={
        phone
          ? `Someone from Brixx will call or WhatsApp you on ${phone} to set up ${business} with you.`
          : `Someone from Brixx will call or WhatsApp you on the number you gave us to set up ${business} with you.`
      }
      top={
        <span className="grid size-12 place-items-center rounded-full bg-accent-subtle text-accent-strong">
          <Phone size={22} strokeWidth={1.75} aria-hidden />
        </span>
      }
    >
      <section
        aria-labelledby="on-the-call"
        className="rounded-(--radius-surface) border bg-card p-5"
      >
        <h2 id="on-the-call" className="font-medium">
          On the call we’ll set up
        </h2>
        <ul className="mt-4 flex flex-col gap-3">
          {ON_THE_CALL.map((line) => (
            <li key={line} className="flex gap-3 text-sm text-text-secondary">
              <Check
                size={18}
                strokeWidth={2}
                aria-hidden
                className="mt-px shrink-0 text-accent-strong"
              />
              {line}
            </li>
          ))}
        </ul>
      </section>
      <p className="text-sm text-muted-foreground">
        Your dashboard opens here once {business} is approved. Sign in any time to check.
      </p>
      <Button variant="secondary" size="lg" className="w-full" onClick={signOutAndForget}>
        Sign out
      </Button>
    </JoinLayout>
  );
}
