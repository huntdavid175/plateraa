'use client';

import { STOREFRONT_LOOKS, type StorefrontPalette, type StorefrontTheme } from '@plateraa/shared';
import { useEffect, useState, type ReactNode } from 'react';

const cssVars = (p: StorefrontPalette) =>
  `--page:${p.page};--card:${p.card};--tile:${p.tile};--border:${p.border};--ink:${p.ink};` +
  `--muted:${p.muted};--hero:${p.hero};--on-hero:${p.onHero};--brand:${p.brand};` +
  `--on-brand:${p.onBrand};--brand-ink:${p.brandInk};`;

/**
 * The page in the store's own look (STOREFRONT_LOOKS), light or dark. Set on the page's root, so
 * the whole window takes it, and the button shades in globals.css follow. `:root:root` and
 * `:root.dark` outrank the stylesheet's own defaults.
 */
export function Themed({ theme, children }: { theme: StorefrontTheme; children: ReactNode }) {
  const look = STOREFRONT_LOOKS[theme] ?? STOREFRONT_LOOKS.classic;
  return (
    <div className="min-h-screen bg-page text-ink">
      <style>{`:root:root{${cssVars(look.light)}}:root.dark{${cssVars(look.dark)}}`}</style>
      {children}
    </div>
  );
}

const TONES = {
  green: 'text-green bg-green-bg',
  amber: 'text-amber bg-amber-bg',
  red: 'text-red bg-red-bg',
  muted: 'text-muted bg-tile',
} as const;

/** A small word in a pill: status is always a word, never colour alone. */
export function Badge({ tone, text }: { tone: keyof typeof TONES; text: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}
    >
      {text}
    </span>
  );
}

/** − 2 + with round 36 px buttons. */
export function Qty({
  value,
  onDec,
  onInc,
  min = 1,
}: {
  value: number;
  onDec: () => void;
  onInc: () => void;
  min?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="stepper-btn"
        onClick={onDec}
        disabled={value <= min}
        aria-label="One fewer"
      >
        −
      </button>
      <span className="w-4 text-center font-mono text-base">{value}</span>
      <button type="button" className="stepper-btn" onClick={onInc} aria-label="One more">
        +
      </button>
    </div>
  );
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Where an item's photo goes when it has none. */
export function PhotoPlaceholder({ name }: { name: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-tile text-2xl font-semibold text-muted">
      {initialsOf(name)}
    </div>
  );
}

/** Light or dark, remembered in this browser; it starts from the phone's own setting. */
export function DarkToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  const flip = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('plateraa-dark', next ? '1' : '0');
    } catch {
      // Not remembered, but it still switches.
    }
    setDark(next);
  };
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={dark ? 'Light mode' : 'Dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-base transition-colors ${className}`}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

export function ArrowLeft() {
  return (
    <svg
      width="20"
      height="20"
      fill="none"
      viewBox="0 0 20 20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 15L7 10L12 5" />
    </svg>
  );
}

export function ChevronDown({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 20 20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 8L10 13L15 8" />
    </svg>
  );
}

export function ChevronRight({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 20 20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8 5l5 5-5 5" />
    </svg>
  );
}

/** The basket on the floating cart button. */
export function Basket() {
  return (
    <svg
      width="20"
      height="20"
      fill="none"
      viewBox="0 0 20 20"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7h14l-1.2 8.2a2 2 0 0 1-2 1.8H6.2a2 2 0 0 1-2-1.8L3 7Z" />
      <path d="M7 7l1.6-3.5M13 7l-1.6-3.5" />
    </svg>
  );
}

/** Sharing the store's link, the way a phone's own share button looks. */
export function Share() {
  return (
    <svg
      width="18"
      height="18"
      fill="none"
      viewBox="0 0 20 20"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="15" cy="4.5" r="2.2" />
      <circle cx="5" cy="10" r="2.2" />
      <circle cx="15" cy="15.5" r="2.2" />
      <path d="M7 8.9l6-3.2M7 11.1l6 3.2" />
    </svg>
  );
}

export function Clock({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="5" />
      <path d="M6 3v3l2 1.5" />
    </svg>
  );
}

/** Calling the store. */
export function Phone() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.5 3h3l1.5 4-2 1.2a12 12 0 0 0 5.8 5.8L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z" />
    </svg>
  );
}

/** Where the store is. */
export function Pin() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

/** Getting directions: the arrow a map app uses. */
export function Navigate() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 3 3 10.5l7.5 2.8L13.3 21 21 3Z" />
    </svg>
  );
}

/** Emptying the order. */
export function Trash() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M9 7V5h6v2M6 7l1 12.2A2 2 0 0 0 9 21h6a2 2 0 0 0 2-1.8L18 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** Delivery: the rider's moped. */
export function Moped() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M8.5 17h7M4 7h4l3.5 10M14 7h3l2.5 7" />
    </svg>
  );
}

/** A full-screen message: store not found, something went wrong, and the like. */
export function Message({
  icon,
  title,
  children,
}: {
  /** An emoji, or a picture such as Plateraa's logo. */
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-5xl" aria-hidden="true">
        {icon}
      </div>
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {children}
    </div>
  );
}
