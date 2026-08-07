import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { VehiclesClient, type VehicleRow } from './vehicles-client'
import type { AxleType, Vehicle } from '@/lib/database.types'

export const metadata = { title: 'จัดการรถ · Dream Tire' }

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireSession(['admin'])
  const { q } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('vehicles').select('*').order('plate_no')
  if (q?.trim()) {
    const term = `%${q.trim()}%`
    query = query.or(
      `plate_no.ilike.${term},brand.ilike.${term},model.ilike.${term},province.ilike.${term}`,
    )
  }

  const [{ data: vehicleData }, { data: mountedTires }, { data: axleTypeData }] = await Promise.all([
    query,
    supabase.from('tires').select('vehicle_id').eq('status', 'mounted'),
    supabase.from('axle_types').select('*').order('sort_order').order('name'),
  ])

  // นับยางที่ติดตั้งอยู่ของแต่ละคัน
  const mountedCount = new Map<string, number>()
  for (const t of mountedTires ?? []) {
    if (!t.vehicle_id) continue
    mountedCount.set(t.vehicle_id, (mountedCount.get(t.vehicle_id) ?? 0) + 1)
  }

  const vehicles: VehicleRow[] = ((vehicleData ?? []) as Vehicle[]).map((v) => ({
    ...v,
    mounted_count: mountedCount.get(v.id) ?? 0,
  }))

  return (
    <>
      <PageHeader
        title="จัดการรถ"
        subtitle="ข้อมูลทะเบียน จังหวัด ยี่ห้อ/รุ่น ประเภทเพลา และเลขไมล์ล่าสุด"
      />
      <VehiclesClient vehicles={vehicles} axleTypes={(axleTypeData ?? []) as AxleType[]} />
    </>
  )
}
