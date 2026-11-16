import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchEmailsByUserId } from '@/lib/auth-emails'
import { Card, CardHeader } from '@/components/ui'
import { TechniciansClient, type MemberRow } from '@/app/(app)/technicians/technicians-client'
import type { Profile } from '@/lib/database.types'

export const metadata = { title: 'ผู้ใช้งานของลูกค้า · Dream Tire Admin' }

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
    .eq('all_companies', false)
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
          description="บัญชีแอดมินและช่างของลูกค้ารายนี้ สร้างใหม่ ตั้งรหัสผ่าน หรือปิดการใช้งานได้ที่นี่"
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
