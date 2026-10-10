import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';

// Every page is rendered per request: the content-security policy carries a one-time nonce that
// Next.js can only attach while rendering. (The console shows nothing that could be built ahead.)
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'BLOCKS Console', template: '%s · BLOCKS Console' },
  description: 'Staff console for BLOCKS: users, content review, reach, earnings and compliance.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#14142B',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
