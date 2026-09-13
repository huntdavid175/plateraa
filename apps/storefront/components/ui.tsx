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

export function Clock() {
  return (
    <svg
      width="12"
      height="12"
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

/** A full-screen message: store not found, something went wrong, and the like. */
export function Message({
  icon,
  title,
  children,
}: {
  icon: string;
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
