import { requireSession } from '@/lib/auth'
import { fetchEmailsByUserId } from '@/lib/auth-emails'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { GlobalTechniciansClient, type GlobalTechRow } from './global-technicians-client'
import type { Profile } from '@/lib/database.types'

export const metadata = { title: 'ช่างส่วนกลาง · Dream Tire Admin' }

/** จัดการบัญชีช่างส่วนกลางของ Dreammaker — ใช้เมนูถอด-ใส่ยางได้ทุกลูกค้า */
export default async function GlobalTechniciansPage() {
  const { userId } = await requireSession(['super_admin'])
  const supabase = await createClient()

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('all_companies', true)
    .order('full_name')

  const profiles = (data ?? []) as Profile[]
  const emails = await fetchEmailsByUserId(profiles.map((p) => p.id))
  const rows: GlobalTechRow[] = profiles.map((p) => ({ ...p, email: emails.get(p.id) ?? null }))

  return (
    <>
      <PageHeader
        title="ช่างส่วนกลาง"
        subtitle="บัญชีช่างของ Dreammaker — เข้าได้ทุกลูกค้าและใช้ได้เฉพาะเมนูบันทึกถอด-ใส่ยาง ลูกค้าใหม่เพิ่มเข้ามาแล้วช่างเลือกได้ทันที"
      />
      <GlobalTechniciansClient rows={rows} currentUserId={userId} />
    </>
  )
}
