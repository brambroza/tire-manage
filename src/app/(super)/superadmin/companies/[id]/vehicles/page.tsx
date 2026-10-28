import { vehicleSearchFilter } from '@/lib/vehicle-display'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui'
import { VehiclesClient, type VehicleRow } from '@/app/(app)/vehicles/vehicles-client'
import { BRANCH_FILTER_NONE } from '@/app/(app)/vehicles/branch-filter'
import { signVehiclePhotoUrls } from '@/lib/vehicle-photos'
import type { AxleType, Vehicle } from '@/lib/database.types'

export const metadata = { title: 'จัดการรถของลูกค้า · Dream Tire Admin' }

/** แท็บจัดการรถของลูกค้า — ใช้ตาราง/ฟอร์มชุดเดียวกับฝั่งลูกค้า (กรอง ?q= และ ?branch= เหมือนกัน) */
export default async function CompanyVehiclesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; branch?: string }>
}) {
  await requireSession(['super_admin'])
  const { id } = await params
  const { q, branch } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('vehicles').select('*').eq('company_id', id).order('plate_no', { nullsFirst: false }).order('nickname')
  if (q?.trim()) {
    query = query.or(vehicleSearchFilter(q))
  }
  if (branch === BRANCH_FILTER_NONE) query = query.is('branch', null)
  else if (branch?.trim()) query = query.eq('branch', branch.trim())

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
    supabase.from('companies').select('name, branches').eq('id', id).maybeSingle(),
  ])

  const mountedCount = new Map<string, number>()
  for (const t of mountedTires ?? []) {
    if (!t.vehicle_id) continue
    mountedCount.set(t.vehicle_id, (mountedCount.get(t.vehicle_id) ?? 0) + 1)
  }

  const vehicleList = (vehicleData ?? []) as Vehicle[]
  // ลิงก์รูปอายุสั้น — ดึงรถผ่าน RLS แล้วจึงเซ็นเฉพาะรูปของรถที่ผู้ใช้เห็นได้
  const photoUrls = await signVehiclePhotoUrls(vehicleList.map((v) => v.image_path))

  const vehicles: VehicleRow[] = vehicleList.map((v) => ({
    ...v,
    mounted_count: mountedCount.get(v.id) ?? 0,
    photo_url: v.image_path ? photoUrls.get(v.image_path) ?? null : null,
  }))

  return (
    <>
      <Card className="mb-4">
        <CardHeader
          title="จัดการรถแทนลูกค้า"
          description="แก้แทนแอดมินลูกค้าได้ทุกอย่าง และมีผลกับข้อมูลจริงของลูกค้าทันที"
        />
      </Card>
      <VehiclesClient
        vehicles={vehicles}
        axleTypes={(axleTypeData ?? []) as AxleType[]}
        branches={companyData?.branches ?? []}
        companyId={id}
        enableLinks={false}
        enableHistory
        companyName={companyData?.name ?? 'Dream Tire'}
      />
    </>
  )
}
