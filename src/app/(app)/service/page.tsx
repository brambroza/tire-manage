import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { ServiceWizard, type TireLite, type TireModelLite, type VehicleLite } from './service-wizard'
import type { AxleType, Vehicle } from '@/lib/database.types'

export const metadata = { title: 'บันทึกถอด-ใส่ยาง · Dream Tire' }

/** แถวรุ่นยางจากแคตตาล็อก (join ยี่ห้อมาด้วย) */
interface ModelRow {
  id: string
  name: string
  size: string | null
  new_tread_mm: number | null
  tire_brands: { name: string } | null
}

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>
}) {
  await requireSession(['admin', 'technician'])
  const { vehicle } = await searchParams
  const supabase = await createClient()

  const [
    { data: vehicleData },
    { data: tireData },
    { data: reasonData },
    { data: axleTypeData },
    { data: modelData },
  ] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, plate_no, province, brand, model, axle_type, current_mileage')
      .eq('is_active', true)
      .order('plate_no'),
    supabase
      .from('tire_overview')
      .select('id, serial_no, brand_name, model_name, size, status, tread_mm, new_tread_mm, ' +
        'lifetime_km, current_run_km, vehicle_id, position_code, plate_no, image_url')
      .neq('status', 'scrapped')
      .order('serial_no')
      .limit(3000),
    supabase
      .from('removal_reasons')
      .select('id, name, is_scrap')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('axle_types').select('*').order('sort_order').order('name'),
    // แคตตาล็อกที่ super admin กำหนดให้บริษัทนี้เห็น (RLS กรองให้แล้ว)
    // ใช้เป็นตัวเลือกขนาดยาง และค่าดอกยางตอนใหม่
    supabase
      .from('tire_models')
      .select('id, name, size, new_tread_mm, tire_brands(name)')
      .eq('is_active', true)
      .order('name'),
  ])

  const models: TireModelLite[] = ((modelData ?? []) as unknown as ModelRow[]).map((m) => ({
    id: m.id,
    brand_name: m.tire_brands?.name ?? '',
    model_name: m.name,
    size: m.size,
    new_tread_mm: m.new_tread_mm,
  }))

  return (
    <>
      <PageHeader
        title="บันทึกการถอด-ใส่ยาง"
        subtitle="คีย์ทะเบียน เลือกประเภทรถ แล้วทำทีละล้อจนครบ"
      />
      <ServiceWizard
        vehicles={(vehicleData ?? []) as Pick<Vehicle, keyof VehicleLite>[] as VehicleLite[]}
        tires={(tireData ?? []) as unknown as TireLite[]}
        reasons={reasonData ?? []}
        axleTypes={(axleTypeData ?? []) as AxleType[]}
        models={models}
        initialVehicleId={vehicle}
      />
    </>
  )
}
