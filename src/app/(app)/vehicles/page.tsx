import { vehicleSearchFilter } from '@/lib/vehicle-display'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getVehicleChangeAlerts } from '@/lib/notifications'
import { PageHeader } from '@/components/app-shell'
import { VehiclesClient, type VehicleRow } from './vehicles-client'
import { BRANCH_FILTER_NONE } from './branch-filter'
import { signVehiclePhotoUrls } from '@/lib/vehicle-photos'
import type { AxleType, Vehicle } from '@/lib/database.types'

export const metadata = { title: 'จัดการรถ · Dream Tire' }

/** หน้ารายการรถของบริษัท — กรองด้วยคำค้นหา (?q=) และสาขา (?branch=, `__none__` = ไม่ระบุสาขา) */
export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; branch?: string }>
}) {
  const { company } = await requireSession(['admin'])
  const { q, branch } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('vehicles').select('*').order('plate_no', { nullsFirst: false }).order('nickname')
  if (q?.trim()) {
    query = query.or(vehicleSearchFilter(q))
  }
  if (branch === BRANCH_FILTER_NONE) query = query.is('branch', null)
  else if (branch?.trim()) query = query.eq('branch', branch.trim())

  const [{ data: vehicleData }, { data: mountedTires }, { data: axleTypeData }, changeAlerts] =
    await Promise.all([
      query,
      supabase.from('tires').select('vehicle_id').eq('status', 'mounted'),
      supabase.from('axle_types').select('*').order('sort_order').order('name'),
      company ? getVehicleChangeAlerts(supabase, company.id) : Promise.resolve([]),
    ])

  // นับยางที่ติดตั้งอยู่ของแต่ละคัน
  const mountedCount = new Map<string, number>()
  for (const t of mountedTires ?? []) {
    if (!t.vehicle_id) continue
    mountedCount.set(t.vehicle_id, (mountedCount.get(t.vehicle_id) ?? 0) + 1)
  }

  // รถเปลี่ยนยางบ่อย: จำนวนครั้งต่อคัน (เฉพาะคันที่ถึงเกณฑ์)
  const changeCountByVehicle = new Map(changeAlerts.map((a) => [a.vehicleId, a.changeCount]))

  const vehicleList = (vehicleData ?? []) as Vehicle[]
  // ลิงก์รูปอายุสั้น — ดึงรถผ่าน RLS แล้วจึงเซ็นเฉพาะรูปของรถที่ผู้ใช้เห็นได้
  const photoUrls = await signVehiclePhotoUrls(vehicleList.map((v) => v.image_path))

  const vehicles: VehicleRow[] = vehicleList.map((v) => ({
    ...v,
    mounted_count: mountedCount.get(v.id) ?? 0,
    frequent_change_count: changeCountByVehicle.get(v.id) ?? null,
    photo_url: v.image_path ? photoUrls.get(v.image_path) ?? null : null,
  }))

  return (
    <>
      <PageHeader
        title="จัดการรถ"
        subtitle="รถทุกคันของบริษัท พร้อมประเภทเพลาและเลขไมล์ล่าสุด"
      />
      <VehiclesClient
        vehicles={vehicles}
        axleTypes={(axleTypeData ?? []) as AxleType[]}
        branches={company?.branches ?? []}
        changeAlertLabel={`≥ ${company?.alert_change_count ?? 3} ครั้งใน ${company?.alert_change_days ?? 90} วัน`}
        companyName={company?.name ?? 'Dream Tire'}
      />
    </>
  )
}
