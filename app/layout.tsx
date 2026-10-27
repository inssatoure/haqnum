import type { Metadata, Viewport } from 'next';
import { Carlito } from 'next/font/google';
import './globals.css';
import 'leaflet/dist/leaflet.css';

const carlito = Carlito({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-carlito', display: 'swap' });

export const metadata: Metadata = {
  title: 'MIN Observateur',
  description: 'Observer, capturer et analyser la Biennale Chroniques / MIN 2026',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MIN Obs', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#070D18',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={carlito.variable}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
