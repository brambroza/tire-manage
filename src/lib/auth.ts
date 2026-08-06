import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Company, Profile, UserRole } from '@/lib/database.types'

export interface SessionContext {
  userId: string
  email: string | null
  profile: Profile
  company: Company | null
}

/**
 * อ่าน session + profile + company ของผู้ใช้ปัจจุบัน
 * @returns null ถ้ายังไม่ได้ login หรือ profile ถูกปิดใช้งาน
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) return null

  let company: Company | null = null
  if (profile.company_id) {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('id', profile.company_id)
      .single()
    company = data
  }

  return { userId: user.id, email: user.email ?? null, profile, company }
})

/**
 * บังคับให้ต้อง login และ (ถ้าระบุ) ต้องมี role ที่อนุญาต
 * @param allowed รายการ role ที่เข้าถึงหน้านี้ได้
 */
export async function requireSession(allowed?: UserRole[]): Promise<SessionContext> {
  const session = await getSession()
  if (!session) redirect('/login')
  if (allowed && !allowed.includes(session.profile.role)) redirect('/')
  return session
}

/** หน้าแรกเริ่มต้นของแต่ละ role */
export function homePathFor(role: UserRole): string {
  switch (role) {
    case 'super_admin': return '/superadmin'
    case 'admin':       return '/dashboard'
    case 'technician':  return '/service'
  }
}
