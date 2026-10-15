import { CircleCheck, Mail, MessageCircle, Phone, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { CONTACT, NAV, SIGN_IN_URL, SIGN_UP_URL } from '../lib/site';
import { ButtonLink, Container } from './ui';

const PROMISES = [
  'Free to start, with nothing to pay each month',
  'Runs on the Android tablet you already have',
  'Mobile money goes straight into your own Moolre account',
];

/**
 * The end of every page: Toast's orange band with ticks and the main button, and the footer as a
 * white card resting on it (DESIGN.md, Components).
 */
export function Closing({ heading = 'Let’s get your counter sorted' }: { heading?: string }) {
  return (
    <div className="bg-[linear-gradient(180deg,var(--color-brand)_0%,var(--color-brand-strong)_38%,var(--color-brand-deep)_100%)]">
      <Container className="grid gap-10 pt-20 pb-16 sm:pt-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <h2 className="text-[40px] leading-[1.05] font-normal tracking-[-0.02em] text-balance text-white sm:text-[56px]">
            {heading}
          </h2>
          <ul className="mt-8 space-y-3">
            {PROMISES.map((line) => (
              <li key={line} className="flex items-start gap-3 text-[17px] text-white">
                <CircleCheck size={22} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col items-start gap-4 lg:items-end">
          <ButtonLink href={SIGN_UP_URL} kind="light" size="lg">
            Create my free account
          </ButtonLink>
          <p className="text-[15px] text-white">
            Set it up from your phone. Cash sales are always free.
          </p>
        </div>
      </Container>
      <Footer />
    </div>
  );
}

interface ContactLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

function Footer() {
  const contacts = (
    [
      !!CONTACT.whatsapp && {
        href: `https://wa.me/${CONTACT.whatsapp}`,
        label: 'WhatsApp us',
        icon: MessageCircle,
      },
      !!CONTACT.phone && {
        href: `tel:+${CONTACT.phone}`,
        label: `Call +${CONTACT.phone}`,
        icon: Phone,
      },
      !!CONTACT.email && { href: `mailto:${CONTACT.email}`, label: CONTACT.email, icon: Mail },
    ] as (ContactLink | false)[]
  ).filter((c): c is ContactLink => c !== false);

  const columns = [
    { title: 'Plateraa', links: NAV.map((n) => ({ href: n.href, label: n.label })) },
    {
      title: 'Your account',
      links: [
        { href: SIGN_UP_URL, label: 'Create an account' },
        { href: SIGN_IN_URL, label: 'Log in' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { href: '/privacy', label: 'Privacy' },
        { href: '/terms', label: 'Terms' },
      ],
    },
  ];

  return (
    <footer className="px-3 sm:px-6">
      <div className="mx-auto max-w-7xl rounded-[32px] bg-white px-6 pt-12 pb-10 sm:rounded-[40px] sm:px-12">
        <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2" aria-label="Plateraa home">
              <img src="/logo.png" alt="" width={44} height={44} className="rounded-[12px]" />
              <span className="text-[22px] font-semibold tracking-[-0.02em]">Plateraa</span>
            </Link>
            <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-muted">
              Orders, money and profit for food vendors in Ghana.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-[15px] font-medium text-ink">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    {/^https?:/.test(link.href) ? (
                      <a
                        href={link.href}
                        className="text-[15px] text-muted hover:text-brand-strong"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-[15px] text-muted hover:text-brand-strong"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-5 border-t border-line pt-8 md:flex-row md:items-center md:justify-between">
          <p className="text-[22px] tracking-[-0.01em]">Questions? Talk to us.</p>
          <div className="flex flex-wrap gap-3">
            {contacts.length > 0 ? (
              contacts.map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-brand-strong px-4 text-[15px] text-brand-strong hover:bg-brand-tint"
                >
                  <Icon size={17} strokeWidth={1.75} aria-hidden />
                  {label}
                </a>
              ))
            ) : (
              <ButtonLink href="/contact" kind="outline">
                Contact us
              </ButtonLink>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 text-[13px] text-muted sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Plateraa</p>
          <p>Mobile money payments are processed by Moolre into each vendor’s own account.</p>
        </div>
      </div>
      <p
        aria-hidden
        className="py-10 text-center text-[44px] font-semibold tracking-[-0.03em] text-white/90 sm:py-14 sm:text-[64px]"
      >
        Plateraa
      </p>
    </footer>
  );
}
