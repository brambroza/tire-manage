import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'

/**
 * Supabase client สำหรับ Server Component / Server Action / Route Handler
 * ใช้ anon key + cookie ของผู้ใช้ ทำให้ RLS ทำงานตาม role จริง
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // เรียกจาก Server Component — refresh session ถูกจัดการใน middleware แล้ว
          }
        },
      },
    },
  )
}

/**
 * Service-role client — ใช้เฉพาะงานที่ต้องข้าม RLS จริง ๆ
 * เช่น super admin สร้าง auth user ให้ลูกค้า
 * ห้ามเรียกจากฝั่ง client เด็ดขาด
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}
