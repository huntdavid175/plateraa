import { useId, type ReactNode } from 'react';
import { Switch } from '@/components/arc/switch/switch';

/**
 * One setting in a panel: what it is and what it does on the left, its control on the right.
 * Rows sit in `PanelRows`, divided by hairlines, never a card each.
 */
export function SettingRow({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        {detail && <span className="text-sm text-muted-foreground">{detail}</span>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </li>
  );
}

/** A setting that applies the moment it's switched (Arc's rule: a switch, not a checkbox). */
export function SwitchRow({
  title,
  detail,
  on,
  onChange,
  disabled,
}: {
  title: string;
  detail?: ReactNode;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={id} className="text-sm font-medium">
          {title}
        </span>
        {detail && <span className="text-sm text-muted-foreground">{detail}</span>}
      </div>
      <Switch
        aria-labelledby={id}
        checked={on}
        onCheckedChange={onChange}
        disabled={disabled}
        className="shrink-0"
      />
    </li>
  );
}
