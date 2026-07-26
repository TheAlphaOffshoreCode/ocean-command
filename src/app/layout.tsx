import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Ocean Command',
    template: '%s · Ocean Command',
  },
  description: 'Offshore Operations Intelligence Platform',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#070e17',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
