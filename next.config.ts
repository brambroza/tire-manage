import type { NextConfig } from 'next'

/** โฮสต์ของ Supabase Storage ที่ใช้เก็บรูปยาง — อ่านจาก env เพื่อไม่ hardcode */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // รองรับอัปโหลดรูปยางสูงสุด 3 MB (เผื่อ overhead ของ multipart)
      bodySizeLimit: '4mb',
    },
  },
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
}

export default nextConfig
