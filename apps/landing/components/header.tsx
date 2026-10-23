'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { NAV, SIGN_IN_URL, SIGN_UP_URL } from '../lib/site';
import { ButtonLink, Container, cx } from './ui';

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // A link in the phone menu takes you to a new page; the menu shouldn't follow you there.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-white/90 backdrop-blur-md">
      <Container className="flex h-16 items-center gap-8">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Brixx home">
          {/* A plain <img>: the logo is a small fixed-size PNG made by `pnpm brand:assets`. */}
          <img src="/wordmark.png" alt="" width={90} height={28} />
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                'text-[15px] transition-colors hover:text-brand-strong',
                pathname === item.href ? 'text-brand-strong' : 'text-ink',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <ButtonLink href={SIGN_IN_URL} kind="outline">
            Log in
          </ButtonLink>
          <ButtonLink href={SIGN_UP_URL}>Start free</ButtonLink>
        </div>

        <button
          type="button"
          className="ml-auto grid h-11 w-11 place-items-center rounded-full text-ink md:hidden"
          aria-expanded={open}
          aria-controls="phone-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} strokeWidth={1.75} /> : <Menu size={22} strokeWidth={1.75} />}
        </button>
      </Container>

      {open && (
        <nav id="phone-menu" aria-label="Main" className="border-t border-line bg-white md:hidden">
          <Container className="flex flex-col py-3">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="py-3 text-[18px] text-ink">
                {item.label}
              </Link>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-3 pb-2">
              <ButtonLink href={SIGN_IN_URL} kind="outline">
                Log in
              </ButtonLink>
              <ButtonLink href={SIGN_UP_URL}>Start free</ButtonLink>
            </div>
          </Container>
        </nav>
      )}
    </header>
  );
}
