import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans_Thai } from 'next/font/google'
import './globals.css'

const thai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-thai',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Dream Tire — ระบบจัดการยางรถบรรทุก',
  description: 'บันทึกการถอด-ใส่ยาง ติดตามระยะใช้งานยางรายเส้น และแจ้งเตือนเมื่อถึงเกณฑ์',
  applicationName: 'Dream Tire',
  appleWebApp: { capable: true, title: 'Dream Tire', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#f0f8ff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // กัน iPad zoom ตอนโฟกัส input
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="th" className={`${thai.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
