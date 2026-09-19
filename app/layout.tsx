import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const siteUrl = 'https://srted.vercel.app'

export const metadata: Metadata = {
  title: 'SRTed — Free Online Subtitle Editor | SRT & VTT Sync, Edit & Compare',
  description: 'Free online subtitle editor for SRT and VTT files. Sync subtitles, edit timing, compare multiple tracks, and fix out-of-sync captions. No upload required — works entirely in your browser.',
  keywords: [
    'subtitle editor',
    'SRT editor',
    'VTT editor',
    'subtitle sync',
    'sync subtitles',
    'fix subtitle timing',
    'subtitle synchronization',
    'compare subtitles',
    'subtitle comparison',
    'edit subtitles online',
    'free subtitle editor',
    'online subtitle editor',
    'SRT to VTT converter',
    'VTT to SRT converter',
    'subtitle timing tool',
    'caption editor',
    'subtitle delay fix',
    'adjust subtitle timing',
    'subtitle offset',
    'browser subtitle editor',
  ],
  authors: [{ name: 'SRTed' }],
  creator: 'SRTed',
  publisher: 'SRTed',
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'SRTed',
    title: 'SRTed — Free Online Subtitle Editor | Sync, Edit & Compare SRT/VTT',
    description: 'Free browser-based subtitle editor. Sync timing, edit text, compare multiple subtitle tracks. Supports SRT and VTT formats. No upload — 100% private.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'SRTed - Online Subtitle Editor',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SRTed — Free Online Subtitle Editor',
    description: 'Sync, edit & compare SRT/VTT subtitles in your browser. Free, private, no upload required.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // Add your verification codes here
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
  },
  category: 'technology',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'SRTed',
    description: 'Free online subtitle editor for SRT and VTT files. Sync subtitles, edit timing, compare multiple tracks.',
    url: siteUrl,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'Edit SRT and VTT subtitle files',
      'Sync subtitle timing with video',
      'Compare up to 4 subtitle tracks',
      'Shift all subtitles by custom offset',
      'Convert between SRT and VTT formats',
      'Works offline in browser',
      'Auto-save to prevent data loss',
      'Undo/redo support',
      'Dark and light theme',
    ],
    screenshot: `${siteUrl}/og-image.png`,
    softwareVersion: '1.0.0',
    author: {
      '@type': 'Organization',
      name: 'SRTed',
    },
  }

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How do I sync subtitles that are out of time?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Use the sync panel to shift all subtitles by a specific amount. Click the clock icon, then use quick buttons (-1s, +0.5s, etc.) or enter a custom offset. Positive values delay subtitles, negative values make them appear earlier.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I compare two subtitle files?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes! SRTed supports comparing up to 4 subtitle tracks simultaneously. Click the compare icon and load additional SRT or VTT files. Each track displays in a different color over the video.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is my data uploaded to a server?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. SRTed works entirely in your browser. Your video and subtitle files are never uploaded anywhere. Everything is processed locally on your device.',
        },
      },
      {
        '@type': 'Question',
        name: 'What subtitle formats are supported?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'SRTed supports SRT (SubRip) and VTT (WebVTT) formats. You can import either format and export to both.',
        },
      },
    ],
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            const theme = localStorage.getItem('theme');
            if (theme === 'light') document.documentElement.classList.add('light');
          })();
        `}} />
      </head>
      <body className="bg-zinc-950 text-zinc-100 min-h-screen dark:bg-zinc-950 dark:text-zinc-100" suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
