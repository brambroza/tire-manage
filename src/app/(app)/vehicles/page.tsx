import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getVehicleChangeAlerts } from '@/lib/notifications'
import { PageHeader } from '@/components/app-shell'
import { VehiclesClient, type VehicleRow } from './vehicles-client'
import { BRANCH_FILTER_NONE } from './branch-filter'
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

  let query = supabase.from('vehicles').select('*').order('plate_no')
  if (q?.trim()) {
    const term = `%${q.trim()}%`
    query = query.or(
      `plate_no.ilike.${term},brand.ilike.${term},model.ilike.${term},province.ilike.${term}`,
    )
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

  const vehicles: VehicleRow[] = ((vehicleData ?? []) as Vehicle[]).map((v) => ({
    ...v,
    mounted_count: mountedCount.get(v.id) ?? 0,
    frequent_change_count: changeCountByVehicle.get(v.id) ?? null,
  }))

  return (
    <>
      <PageHeader
        title="จัดการรถ"
        subtitle="ข้อมูลทะเบียน จังหวัด ยี่ห้อ/รุ่น ประเภทเพลา และเลขไมล์ล่าสุด"
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
