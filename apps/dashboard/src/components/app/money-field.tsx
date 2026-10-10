import { useId, type InputHTMLAttributes } from 'react';
import { MoneyInput } from '@/components/arc/money-input/money-input';
import { cn } from '@/lib/utils';

type Props = {
  label: string;
  /** In a row of fields (a size, an option) the label is read out but not shown. */
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  className?: string;
} & Pick<
  InputHTMLAttributes<HTMLInputElement>,
  'placeholder' | 'maxLength' | 'inputMode' | 'type' | 'autoComplete' | 'autoFocus'
>;

/**
 * A field drawn like Arc's `Input` (the same tokens: border, radius, height, focus by border
 * colour alone), with room for a sign inside it, which Arc's input hasn't. `MoneyField` puts the
 * cedi sign there; `PlainField` is the same field without, for rows where Arc's always-visible
 * label would crowd (a size's name, an option's name).
 */
function Field({
  label,
  hideLabel,
  value,
  onChange,
  description,
  className,
  prefix,
  ...input
}: Props & { prefix?: string }) {
  const id = useId();
  return (
    <div className={cn('grid min-w-0', className)}>
      <label htmlFor={id} className={cn('mb-2 text-sm font-medium', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="flex min-h-(--control-height-md) items-center gap-1.5 rounded-(--radius-control) border border-(--border-strong) bg-surface px-3 transition-colors focus-within:border-foreground hover:border-foreground">
        {prefix && (
          <span className="shrink-0 text-xs text-muted-foreground" aria-hidden>
            {prefix}
          </span>
        )}
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-describedby={description ? `${id}-description` : undefined}
          {...input}
        />
      </div>
      {description && (
        <span id={`${id}-description`} className="pt-2 text-xs text-muted-foreground">
          {description}
        </span>
      )}
    </div>
  );
}

/** A cedi amount, typed as text ("12.50") and turned into pesewas by the caller. */
export function MoneyField({ prefix = 'GH₵', ...props }: Props & { prefix?: string }) {
  return (
    <Field
      prefix={prefix}
      inputMode="decimal"
      {...props}
      className={cn('tabular-nums', props.className)}
    />
  );
}

export function PlainField(props: Props) {
  return <Field {...props} />;
}

/**
 * An amount on its own (a refund, a payout, an expense, a fee): Arc's money input in cedis. It
 * gives pesewas directly (minor units), or null while it's empty, with quick-add chips. Rows of
 * prices (sizes, options) keep the slimmer `MoneyField`.
 */
export function CediInput({
  label,
  value,
  onChange,
  description,
  error,
  max,
  quickAdd = [5, 10, 20],
}: {
  label: string;
  /** Pesewas, or null when empty. */
  value: number | null;
  onChange: (pesewas: number | null) => void;
  description?: string | undefined;
  error?: string | undefined;
  /** Pesewas: typing past it is refused. */
  max?: number | undefined;
  /** Chips in whole cedis; [] hides them. */
  quickAdd?: number[];
}) {
  return (
    <MoneyInput
      label={label}
      value={value}
      onValueChange={(next) => onChange(next)}
      currency="GHS"
      currencies={['GHS']}
      locale="en-GB"
      quickAdd={quickAdd}
      {...(description ? { description } : {})}
      {...(error ? { error } : {})}
      {...(max !== undefined ? { max } : {})}
    />
  );
}
