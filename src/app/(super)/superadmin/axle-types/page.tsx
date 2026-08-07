import { PageHeader } from '@/components/app-shell'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AxleTypesClient, type AxleTypeRow } from './axle-types-client'
import type { AxleType } from '@/lib/database.types'

export const metadata = { title: 'ประเภทเพลา · Dream Tire Admin' }

export default async function AxleTypesPage() {
  await requireSession(['super_admin'])
  const supabase = await createClient()

  const [{ data: axleTypeData }, { data: vehicleData }] = await Promise.all([
    supabase.from('axle_types').select('*').order('sort_order').order('name'),
    supabase.from('vehicles').select('axle_type'),
  ])

  const usage = new Map<string, number>()
  for (const vehicle of vehicleData ?? []) {
    usage.set(vehicle.axle_type, (usage.get(vehicle.axle_type) ?? 0) + 1)
  }

  const axleTypes: AxleTypeRow[] = ((axleTypeData ?? []) as AxleType[]).map((type) => ({
    ...type,
    usage_count: usage.get(type.code) ?? 0,
  }))

  return (
    <>
      <PageHeader
        title="ประเภทเพลา"
        subtitle="กำหนดชื่อ จำนวนเพลา และรูปแบบล้อที่ใช้ในข้อมูลรถและงานถอด-ใส่ยาง — ลูกค้าจะเห็นเฉพาะประเภทที่เปิดสิทธิ์ให้ในแท็บ “สิทธิ์เพลา” ของแต่ละบริษัท"
      />
      <AxleTypesClient axleTypes={axleTypes} />
    </>
  )
}
