import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui'
import { TechniciansClient } from '@/app/(app)/technicians/technicians-client'
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
    .order('role')
    .order('full_name')

  return (
    <>
      <Card className="mb-4">
        <CardHeader
          title="บัญชีผู้ใช้งานของลูกค้า"
          description="สร้างบัญชีแอดมินหรือช่างให้ลูกค้า แก้ไขข้อมูล ตั้งรหัสผ่านใหม่ และเปิด/ปิดการใช้งานได้จากที่นี่"
        />
      </Card>
      <TechniciansClient
        members={(data ?? []) as Profile[]}
        currentUserId={userId}
        companyId={id}
      />
    </>
  )
}
