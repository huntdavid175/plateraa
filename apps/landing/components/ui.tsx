import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Photo } from '../content/photos';

/** Joins class names, skipping the empty ones. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>
  );
}

type ButtonKind = 'solid' | 'outline' | 'light' | 'outline-light';

const BUTTON: Record<ButtonKind, string> = {
  solid: 'bg-brand-strong text-white hover:bg-brand-deep',
  outline: 'border border-brand-strong text-brand-strong hover:bg-brand-tint',
  light: 'bg-white text-ink hover:bg-cream',
  'outline-light': 'border border-white/70 text-white hover:bg-white/10',
};

/** A pill link. Addresses off this site (the dashboard) are plain links; ours go through Next. */
export function ButtonLink({
  href,
  kind = 'solid',
  size = 'md',
  children,
  className,
}: {
  href: string;
  kind?: ButtonKind;
  size?: 'md' | 'lg';
  children: ReactNode;
  className?: string;
}) {
  const classes = cx(
    'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors duration-150',
    size === 'lg' ? 'h-14 px-7 text-[17px]' : 'h-11 px-5 text-[15px]',
    BUTTON[kind],
    className,
  );
  if (/^https?:/.test(href)) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

/** The small label above a heading. */
export function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold tracking-[0.08em] uppercase',
        dark ? 'bg-night-card text-night-muted' : 'bg-cream text-muted',
      )}
    >
      {children}
    </span>
  );
}

/** One word with a hand-drawn orange ring around it. Once per page, on the hero. */
export function Circled({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className="relative z-10">{children}</span>
      <svg
        aria-hidden
        viewBox="0 0 200 80"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -inset-x-[5%] -inset-y-[22%] h-[144%] w-[110%] sm:-inset-x-[9%] sm:w-[118%] overflow-visible text-brand"
      >
        <path
          className="draw-in"
          pathLength={1}
          d="M118 9C72 4 22 12 9 34c-11 19 22 37 82 40 63 3 109-12 105-36C192 15 145 3 88 7c-26 2-47 7-60 15"
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** The one handwritten line a page may have. */
export function Script({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-script font-semibold text-brand', className)}>{children}</span>;
}

/**
 * A rounded frame for one of the site's photos (`content/photos.ts`). Without `image` it's a warm
 * gradient that, in development, names the photo it's waiting for. `priority` is for the photo at
 * the top of a page, which loads first.
 */
export function PhotoSlot({
  photo,
  image,
  priority = false,
  className,
  children,
}: {
  photo: string;
  image?: Photo;
  priority?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx(
        'relative overflow-hidden bg-[radial-gradient(120%_90%_at_70%_20%,#6b3416_0%,#2a1a10_55%,#15110e_100%)]',
        className,
      )}
    >
      {image ? (
        // A plain <img>: the photos are sized and compressed before they're added.
        <img
          src={image.src}
          alt={image.alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          style={image.position ? { objectPosition: image.position } : undefined}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        process.env.NODE_ENV === 'development' && (
          <span className="absolute top-3 right-3 rounded-full bg-black/40 px-2 py-1 text-[11px] text-white/70">
            Photo: {photo}
          </span>
        )
      )}
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  intro,
  center = false,
  dark = false,
  className,
}: {
  title: ReactNode;
  intro?: ReactNode;
  center?: boolean;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cx(center && 'mx-auto text-center', 'max-w-3xl', className)}>
      <h2
        className={cx(
          'text-[34px] leading-[1.08] font-normal tracking-[-0.02em] text-balance sm:text-[48px]',
          dark ? 'text-on-night' : 'text-ink',
        )}
      >
        {title}
      </h2>
      {intro && (
        <p
          className={cx(
            'mt-4 text-[17px] leading-relaxed text-pretty sm:text-lg',
            dark ? 'text-night-muted' : 'text-muted',
            center && 'mx-auto max-w-2xl',
          )}
        >
          {intro}
        </p>
      )}
    </div>
  );
}
