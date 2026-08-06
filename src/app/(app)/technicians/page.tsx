import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { TechniciansClient } from './technicians-client'
import type { Profile } from '@/lib/database.types'

export const metadata = { title: 'ช่างของบริษัท · Dream Tire' }

export default async function TechniciansPage() {
  const { userId, company } = await requireSession(['admin'])
  const supabase = await createClient()

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('role')
    .order('full_name')

  return (
    <>
      <PageHeader
        title="ช่างและผู้ใช้งานของบริษัท"
        subtitle={`จัดการบัญชีเข้าใช้งานของ ${company?.name ?? 'บริษัท'}`}
      />
      <TechniciansClient members={(data ?? []) as Profile[]} currentUserId={userId} />
    </>
  )
}
