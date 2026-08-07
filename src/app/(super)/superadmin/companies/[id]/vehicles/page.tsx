import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui'
import { VehiclesClient, type VehicleRow } from '@/app/(app)/vehicles/vehicles-client'
import type { AxleType, Vehicle } from '@/lib/database.types'

export const metadata = { title: 'จัดการรถของลูกค้า · Dream Tire Admin' }

/** แท็บจัดการรถของลูกค้า — ใช้ตาราง/ฟอร์มชุดเดียวกับฝั่งลูกค้า */
export default async function CompanyVehiclesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string }>
}) {
  await requireSession(['super_admin'])
  const { id } = await params
  const { q } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('vehicles').select('*').eq('company_id', id).order('plate_no')
  if (q?.trim()) {
    const term = `%${q.trim()}%`
    query = query.or(
      `plate_no.ilike.${term},brand.ilike.${term},model.ilike.${term},province.ilike.${term}`,
    )
  }

  const [{ data: vehicleData }, { data: mountedTires }, { data: axleTypeData }] = await Promise.all([
    query,
    supabase.from('tires').select('vehicle_id').eq('company_id', id).eq('status', 'mounted'),
    supabase.from('axle_types').select('*').order('sort_order').order('name'),
  ])

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
      <Card className="mb-4">
        <CardHeader
          title="จัดการรถแทนลูกค้า"
          description="เพิ่ม แก้ไข และปิดใช้งานรถได้เหมือนที่แอดมินของลูกค้าทำ — ทุกการเปลี่ยนแปลงมีผลกับข้อมูลจริงของลูกค้า"
        />
      </Card>
      <VehiclesClient
        vehicles={vehicles}
        axleTypes={(axleTypeData ?? []) as AxleType[]}
        companyId={id}
        enableLinks={false}
      />
    </>
  )
}
