import type { Metadata } from 'next'
import './globals.css'
import { fontVariables } from './fonts'

export const metadata: Metadata = {
  title: 'Tome — ask history for a story',
  description:
    'Speak a question, watch a living book weave itself from verified Wikipedia sources — narrated, illustrated, and cited.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${fontVariables} min-h-full flex flex-col`}>
        {children}
      </body>
    </html>
  )
}
