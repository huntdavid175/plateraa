import '@fontsource-variable/figtree';
import '@fontsource/caveat/600.css';
import '@fontsource/caveat/700.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { Header } from '../components/header';
import { JsonLd } from '../components/json-ld';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '../lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Plateraa: online ordering and order management for food vendors in Ghana',
    template: '%s | Plateraa',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_GH',
    url: '/',
    title: 'Plateraa: online ordering and order management for food vendors in Ghana',
    description: SITE_DESCRIPTION,
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FC5102',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GH">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Organization',
                '@id': `${SITE_URL}/#organization`,
                name: SITE_NAME,
                url: SITE_URL,
                logo: `${SITE_URL}/logo.png`,
                areaServed: { '@type': 'Country', name: 'Ghana' },
              },
              {
                '@type': 'SoftwareApplication',
                name: SITE_NAME,
                applicationCategory: 'BusinessApplication',
                operatingSystem: 'Android, Web',
                description: SITE_DESCRIPTION,
                publisher: { '@id': `${SITE_URL}/#organization` },
                offers: {
                  '@type': 'Offer',
                  price: '0',
                  priceCurrency: 'GHS',
                  description: 'Free to start. 2% of each online payment; cash sales are free.',
                },
              },
            ],
          }}
        />
      </body>
    </html>
  );
}
