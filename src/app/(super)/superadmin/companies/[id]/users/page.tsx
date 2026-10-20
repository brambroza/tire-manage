import { requireSession } from '@/lib/auth'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui'
import { TechniciansClient, type MemberRow } from '@/app/(app)/technicians/technicians-client'
import type { Profile } from '@/lib/database.types'

export const metadata = { title: 'ผู้ใช้งานของลูกค้า · Dream Tire Admin' }

/**
 * ดึงอีเมลเข้าสู่ระบบจาก auth.users ของผู้ใช้ตาม id ที่ระบุ
 * อีเมลไม่ได้เก็บใน profiles จึงต้องใช้ service-role client
 * ถ้าไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จะคืน map ว่าง (ตารางจะไม่แสดงคอลัมน์อีเมล)
 */
async function fetchEmailsByUserId(userIds: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>()
  if (userIds.length === 0) return emails

  try {
    const admin = createAdminClient()
    const wanted = new Set(userIds)
    const perPage = 1000
    for (let page = 1; emails.size < wanted.size; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
      if (error || !data) break
      for (const u of data.users) {
        if (wanted.has(u.id) && u.email) emails.set(u.id, u.email)
      }
      if (data.users.length < perPage) break
    }
  } catch {
    // ไม่มี service role key — ข้ามการแสดงอีเมล
  }
  return emails
}

/** แท็บจัดการบัญชีแอดมิน/ช่างของลูกค้า */
export default async function CompanyUsersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { userId } = await requireSession(['super_admin'])
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('company_id', id)
    .order('role')
    .order('full_name')

  const profiles = (data ?? []) as Profile[]
  const emails = await fetchEmailsByUserId(profiles.map((p) => p.id))
  const members: MemberRow[] = profiles.map((p) => ({ ...p, email: emails.get(p.id) ?? null }))

  return (
    <>
      <Card className="mb-4">
        <CardHeader
          title="บัญชีผู้ใช้งานของลูกค้า"
          description="สร้างบัญชีแอดมินหรือช่างให้ลูกค้า แก้ไขข้อมูล ตั้งรหัสผ่านใหม่ และเปิด/ปิดการใช้งานได้จากที่นี่"
        />
      </Card>
      <TechniciansClient
        members={members}
        currentUserId={userId}
        companyId={id}
      />
    </>
  )
}
