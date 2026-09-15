import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { MileageClient, type MileageVehicle } from './mileage-client'

export const metadata = { title: 'บันทึกเลขไมล์ · Dream Tire' }

/**
 * หน้าบันทึกเลขไมล์รถโดยไม่ต้องถอด-ใส่ยาง
 *
 * ระยะรอบนี้ของยางคำนวณจาก "ไมล์รถล่าสุด − ไมล์ตอนใส่ยาง" จึงต้องมีทางให้ช่าง/แอดมิน
 * อัปเดตไมล์รถระหว่างทาง ไม่งั้นการแจ้งเตือนถึงรอบจะไม่ขยับจนกว่าจะมีการเปลี่ยนยาง
 */
export default async function MileagePage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>
}) {
  await requireSession(['admin', 'technician'])
  const { vehicle } = await searchParams
  const supabase = await createClient()

  // รายการรถทั้งหมดของบริษัท (RLS กรองให้) — ใช้ค้นทะเบียนฝั่ง client เหมือนหน้าช่าง
  const { data: vehicleData } = await supabase
    .from('vehicles')
    .select('id, plate_no, province, brand, model, current_mileage')
    .eq('is_active', true)
    .order('plate_no')

  // ยางที่ติดตั้งอยู่ต่อคัน — โชว์ให้เห็นว่าบันทึกไมล์แล้วกระทบยางกี่เส้น
  const { data: mountedRows } = await supabase
    .from('tires')
    .select('vehicle_id')
    .eq('status', 'mounted')

  const mountedCount = new Map<string, number>()
  for (const t of mountedRows ?? []) {
    if (!t.vehicle_id) continue
    mountedCount.set(t.vehicle_id, (mountedCount.get(t.vehicle_id) ?? 0) + 1)
  }

  const vehicles: MileageVehicle[] = (vehicleData ?? []).map((v) => ({
    ...v,
    mounted_count: mountedCount.get(v.id) ?? 0,
  }))

  return (
    <>
      <PageHeader
        title="บันทึกเลขไมล์"
        subtitle="อัปเดตไมล์รถระหว่างทาง เพื่อให้ระยะรอบนี้และการแจ้งเตือนของยางทุกเส้นบนรถเป็นปัจจุบัน"
      />
      <MileageClient vehicles={vehicles} initialVehicleId={vehicle} />
    </>
  )
}
