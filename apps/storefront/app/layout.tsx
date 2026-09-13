import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Plateraa',
  description: 'Order from your favourite food spot, and pay with mobile money.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Dark mode before the first paint: what this browser chose last, else the phone's own setting.
const DARK_FIRST = `try{var d=localStorage.getItem('plateraa-dark');if(d==='1'||(d===null&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DARK_FIRST }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
