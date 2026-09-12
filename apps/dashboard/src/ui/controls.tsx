import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/** Class names, skipping the empty ones. */
export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

const BUTTON_VARIANTS = {
  primary: 'bg-brand text-brand-fg',
  secondary: 'bg-tile text-text border border-border',
  ghost: 'bg-transparent text-muted border border-border',
  danger: 'bg-red text-white',
} as const;

export function Button({
  variant = 'primary',
  small,
  full,
  busy,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  small?: boolean;
  full?: boolean;
  /** Shows a spinner and blocks taps while something is saving. */
  busy?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-opacity',
        small ? 'h-9 px-4 text-sm' : 'h-11 px-5 text-sm',
        full && 'w-full',
        (disabled || busy) && 'pointer-events-none opacity-40',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {busy && <Spinner light={variant === 'primary' || variant === 'danger'} />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-xl border border-border bg-surface', className)}>{children}</div>
  );
}

export function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  /** Read out by screen readers. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        on ? 'bg-brand' : 'bg-tile',
        disabled && 'opacity-40',
      )}
    >
      <span
        className={cx(
          'absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          on && 'translate-x-5',
        )}
      />
    </button>
  );
}

const BADGE_TONES = {
  green: 'bg-green-bg text-green',
  amber: 'bg-amber-bg text-amber',
  red: 'bg-red-bg text-red',
  blue: 'bg-blue-bg text-blue',
  neutral: 'bg-tile text-muted',
} as const;

/** A coloured pill for a status: Paid, Unpaid, Refund owed, … */
export function Badge({ tone, children }: { tone: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** A grey tag for where an order came from: Walk-in, Phone, Bolt, Chowdeck. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded bg-tile px-2 py-0.5 text-xs font-medium text-muted">
      {children}
    </span>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase"
    >
      {children}
    </label>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-brand',
        className,
      )}
      {...rest}
    />
  );
}

export function Spinner({ light }: { light?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent',
        light ? 'border-white border-t-transparent' : 'border-brand border-t-transparent',
      )}
    />
  );
}

/** A row of choices where one is on, e.g. All / Walk-in / Phone. */
export function PillFilter<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** Read out by screen readers. */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-9 max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            'h-7 shrink-0 rounded-md px-3 text-sm font-medium transition-colors',
            value === option.value ? 'bg-tile text-text' : 'text-muted hover:text-text',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A small uppercase heading over a card, as on the Settings screen. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted uppercase">
        {title}
      </h2>
      <Card className="divide-y divide-border overflow-hidden">{children}</Card>
    </section>
  );
}

/** A red box for something that went wrong, in words the owner can act on. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-red-bg px-4 py-3 text-sm text-red">
      {children}
    </p>
  );
}
