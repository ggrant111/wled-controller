import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navigation from '../components/Navigation'
import { StreamingProvider } from '../contexts/StreamingContext'
import React from 'react'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'WLED Controller',
  description: 'Modern web app to control WLED devices via DDP (UDP 4048)',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <StreamingProvider>
          <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <Navigation />
            <main className="container mx-auto px-4 pb-8">
              {children}
            </main>
          </div>
        </StreamingProvider>
      </body>
    </html>
  )
}
