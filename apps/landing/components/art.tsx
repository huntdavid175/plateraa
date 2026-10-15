import { BellRing, Check, ChefHat, KeyRound, Link2, Wallet, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from './ui';

/*
 * Abstract fragments of the product, for illustrations (DESIGN.md, "Keep the product private").
 * Each shows one idea (an order, a payment, a sold-out tag) and never the real screens' layout.
 */

function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'rounded-2xl bg-white px-4 py-3 text-ink shadow-[0_12px_32px_-12px_rgba(31,26,23,0.35)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Grey bars standing in for anything we don't want to show. */
export function Bars({
  widths = ['w-24', 'w-14'],
  light = false,
}: {
  widths?: string[];
  light?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5" aria-hidden>
      {widths.map((w, i) => (
        <span key={i} className={cx('h-2 rounded-full', w, light ? 'bg-white/25' : 'bg-ink/10')} />
      ))}
    </div>
  );
}

export function OrderChip({
  code,
  kind,
  amount,
  className,
}: {
  code: string;
  kind: string;
  amount: string;
  className?: string;
}) {
  return (
    <Note className={cx('flex items-center gap-3', className)}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-[13px] font-semibold text-brand-strong">
        {code}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{kind}</span>
        <Bars widths={['w-16']} />
      </span>
      <span className="text-[14px] font-semibold tabular-nums">{amount}</span>
    </Note>
  );
}

export function PaidNote({ amount, className }: { amount: string; className?: string }) {
  return (
    <Note className={cx('flex items-center gap-3', className)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-momo text-ink">
        <Wallet size={18} strokeWidth={1.75} />
      </span>
      <span>
        <span className="block text-[14px] font-medium">Paid by MoMo</span>
        <span className="block text-[13px] text-muted tabular-nums">{amount}</span>
      </span>
      <Check size={18} strokeWidth={2} className="ml-2 text-[#2d7a4a]" aria-label="Confirmed" />
    </Note>
  );
}

export function NewOrderNote({ className }: { className?: string }) {
  return (
    <Note className={cx('flex items-center gap-3', className)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white">
        <BellRing size={18} strokeWidth={1.75} />
      </span>
      <span>
        <span className="block text-[14px] font-medium">New online order</span>
        <span className="block text-[13px] text-muted">Pickup at 12:30</span>
      </span>
    </Note>
  );
}

export function SoldOutTag({ item, className }: { item: string; className?: string }) {
  return (
    <Note className={cx('flex items-center gap-3', className)}>
      <span className="text-[14px] font-medium">{item}</span>
      <span className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-white">
        Sold out
      </span>
    </Note>
  );
}

export function OfflineNote({ className }: { className?: string }) {
  return (
    <Note className={cx('flex items-center gap-3', className)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cream text-ink">
        <WifiOff size={18} strokeWidth={1.75} />
      </span>
      <span>
        <span className="block text-[14px] font-medium">No internet</span>
        <span className="block text-[13px] text-muted">Still taking orders</span>
      </span>
    </Note>
  );
}

export function DrawerNote({ className }: { className?: string }) {
  return (
    <Note className={cx('w-56', className)}>
      <span className="block text-[13px] text-muted">Drawer at close</span>
      <span className="mt-1 flex items-center justify-between">
        <span className="text-[20px] font-semibold tabular-nums">Counted</span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e8f5ee] text-[#2d7a4a]">
          <Check size={16} strokeWidth={2.25} aria-label="Matches" />
        </span>
      </span>
      <span className="mt-2 block">
        <Bars widths={['w-full', 'w-2/3']} />
      </span>
    </Note>
  );
}

export function PinNote({ className }: { className?: string }) {
  return (
    <Note className={cx('flex items-center gap-3', className)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cream text-ink">
        <KeyRound size={18} strokeWidth={1.75} />
      </span>
      <span className="flex gap-1.5" aria-label="PIN entered">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="h-2.5 w-2.5 rounded-full bg-ink" />
        ))}
      </span>
    </Note>
  );
}

export function ProfitNote({ className }: { className?: string }) {
  const heights = ['h-6', 'h-10', 'h-8', 'h-14', 'h-11', 'h-16', 'h-12'];
  return (
    <Note className={cx('w-60', className)}>
      <span className="block text-[13px] text-muted">Today’s profit</span>
      <span className="mt-1 block">
        <Bars widths={['w-28']} />
      </span>
      <span className="mt-3 flex h-16 items-end gap-1.5" aria-hidden>
        {heights.map((h, i) => (
          <span
            key={i}
            className={cx(
              'flex-1 rounded-t-md',
              h,
              i === heights.length - 1 ? 'bg-brand' : 'bg-brand/25',
            )}
          />
        ))}
      </span>
    </Note>
  );
}

export function StoreLinkNote({ className }: { className?: string }) {
  return (
    <Note className={cx('flex items-center gap-3', className)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand-strong">
        <Link2 size={18} strokeWidth={1.75} />
      </span>
      <span>
        <span className="block text-[14px] font-medium">Your store link</span>
        <span className="block text-[13px] text-muted">Share it anywhere</span>
      </span>
    </Note>
  );
}

export function KitchenNote({ className }: { className?: string }) {
  return (
    <Note className={cx('flex items-center gap-3', className)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cream text-ink">
        <ChefHat size={18} strokeWidth={1.75} />
      </span>
      <span>
        <span className="block text-[14px] font-medium">To the kitchen</span>
        <span className="block text-[13px] text-muted">Once it’s paid</span>
      </span>
    </Note>
  );
}
