import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Agora call demo',
  description: 'RTC + Real-Time STT demo',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
