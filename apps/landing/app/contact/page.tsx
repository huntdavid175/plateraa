import { AtSign, Mail, MessageCircle, Phone, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { Closing } from '../../components/closing';
import { Container, Eyebrow } from '../../components/ui';
import { CONTACT } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Questions about Plateraa? Reach us on WhatsApp, by phone or by email.',
  alternates: { canonical: '/contact' },
};

interface Way {
  href: string;
  title: string;
  detail: string;
  icon: LucideIcon;
}

function ways(): Way[] {
  const list: (Way | false)[] = [
    !!CONTACT.whatsapp && {
      href: `https://wa.me/${CONTACT.whatsapp}`,
      title: 'WhatsApp',
      detail: 'The quickest way to reach us',
      icon: MessageCircle,
    },
    !!CONTACT.phone && {
      href: `tel:+${CONTACT.phone}`,
      title: 'Call us',
      detail: `+${CONTACT.phone}`,
      icon: Phone,
    },
    !!CONTACT.email && {
      href: `mailto:${CONTACT.email}`,
      title: 'Email',
      detail: CONTACT.email,
      icon: Mail,
    },
    !!CONTACT.instagram && {
      href: `https://instagram.com/${CONTACT.instagram}`,
      title: 'Instagram',
      detail: `@${CONTACT.instagram}`,
      icon: AtSign,
    },
    !!CONTACT.tiktok && {
      href: `https://www.tiktok.com/@${CONTACT.tiktok}`,
      title: 'TikTok',
      detail: `@${CONTACT.tiktok}`,
      icon: AtSign,
    },
    !!CONTACT.x && {
      href: `https://x.com/${CONTACT.x}`,
      title: 'X',
      detail: `@${CONTACT.x}`,
      icon: AtSign,
    },
    !!CONTACT.facebook && {
      href: `https://facebook.com/${CONTACT.facebook}`,
      title: 'Facebook',
      detail: CONTACT.facebook,
      icon: AtSign,
    },
  ];
  return list.filter((w): w is Way => !!w);
}

export default function ContactPage() {
  const list = ways();
  return (
    <>
      <section className="pt-16 pb-20 sm:pt-24 sm:pb-28">
        <Container>
          <Eyebrow>Contact</Eyebrow>
          <h1 className="mt-6 max-w-3xl text-[44px] leading-[1.04] font-normal tracking-[-0.03em] text-balance sm:text-[64px]">
            Talk to a person who knows food businesses
          </h1>
          <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-muted">
            Ask about setting up, mobile money or anything else. We’re happy to walk you through
            Plateraa before you sign up.
          </p>

          {list.length > 0 ? (
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map(({ href, title, detail, icon: Icon }) => (
                <li key={href}>
                  <a
                    href={href}
                    className="flex h-full items-start gap-4 rounded-[24px] bg-cream p-6 transition-colors hover:bg-brand-tint"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-brand-strong">
                      <Icon size={22} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span>
                      <span className="block text-[20px] tracking-[-0.01em]">{title}</span>
                      <span className="mt-1 block text-[15px] break-all text-muted">{detail}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-12 rounded-[24px] bg-cream p-6 text-[17px] text-muted">
              Our contact details will be here shortly.
            </p>
          )}
        </Container>
      </section>
      <Closing />
    </>
  );
}
