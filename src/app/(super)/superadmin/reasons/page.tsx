import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { ReasonsClient } from './reasons-client'
import type { RemovalReason } from '@/lib/database.types'

export const metadata = { title: 'สาเหตุการถอดยาง · Dream Tire Admin' }

export default async function ReasonsPage() {
  await requireSession(['super_admin'])
  const supabase = await createClient()

  const { data } = await supabase
    .from('removal_reasons')
    .select('*')
    .order('sort_order')

  return (
    <>
      <PageHeader
        title="สาเหตุการถอดยาง"
        subtitle="ตัวเลือกที่ช่างจะเห็นตอนบันทึกการถอดยาง กำหนดได้เองทั้งหมด"
      />
      <ReasonsClient reasons={(data ?? []) as RemovalReason[]} />
    </>
  )
}
