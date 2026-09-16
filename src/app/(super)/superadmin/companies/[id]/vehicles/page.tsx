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

  const [{ data: vehicleData }, { data: mountedTires }, { data: axleTypeData }, { data: companyData }] = await Promise.all([
    query,
    supabase.from('tires').select('vehicle_id').eq('company_id', id).eq('status', 'mounted'),
    // super admin เห็นเพลาทุกแบบ แต่หน้านี้ทำงานแทนลูกค้า จึงจำกัดตามสิทธิ์ของบริษัทนั้น
    supabase
      .from('axle_types')
      .select('*, company_axle_types!inner(company_id)')
      .eq('company_axle_types.company_id', id)
      .order('sort_order')
      .order('name'),
    supabase.from('companies').select('name').eq('id', id).maybeSingle(),
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
        enableHistory
        companyName={companyData?.name ?? 'Dream Tire'}
      />
    </>
  )
}
