import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SRTed — Subtitle Editor',
  description: 'Visualize, analyse and edit SRT subtitles',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            const theme = localStorage.getItem('theme');
            if (theme === 'light') document.documentElement.classList.add('light');
          })();
        `}} />
      </head>
      <body className="bg-zinc-950 text-zinc-100 min-h-screen dark:bg-zinc-950 dark:text-zinc-100">{children}</body>
    </html>
  )
}
