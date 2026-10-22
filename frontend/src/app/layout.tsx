import type { Metadata, Viewport } from 'next';
import { DM_Sans, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from '@/components/providers';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'SmartPothole AI - AI-Powered Road Damage Detection',
    template: '%s | SmartPothole AI',
  },
  description: 'Production-ready AI-powered road pothole and road-damage detection platform. Detect potholes from images, videos, live camera feeds, and dashcam footage.',
  keywords: ['pothole detection', 'road damage', 'computer vision', 'AI', 'YOLO', 'road safety'],
  authors: [{ name: 'SmartPothole AI Team' }],
  creator: 'SmartPothole AI',
  publisher: 'SmartPothole AI',
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://smartpothole.ai',
    siteName: 'SmartPothole AI',
    title: 'SmartPothole AI - AI-Powered Road Damage Detection',
    description: 'Production-ready AI-powered road pothole and road-damage detection platform.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'SmartPothole AI Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SmartPothole AI',
    description: 'AI-Powered Road Damage Detection Platform',
    images: ['/og-image.png'],
  },
  verification: {
    google: 'google-site-verification-code',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#141f1a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} antialiased font-sans`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}