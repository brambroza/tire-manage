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
  created_by_company: string | null
  tire_brands: { name: string; is_active: boolean } | null
}

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>
}) {
  const { company } = await requireSession(['admin', 'technician'])
  const { vehicle } = await searchParams
  const supabase = await createClient()

  const [
    { data: vehicleData },
    { data: tireData },
    { data: reasonData },
    { data: axleTypeData },
    { data: modelData },
    { data: grantData },
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
    // แคตตาล็อก — RLS ให้เห็นรุ่นที่ได้รับสิทธิ์ + รุ่นที่บริษัทสร้างเอง จึงต้องกรองซ้ำด้วยสิทธิ์ด้านล่าง
    // ใช้เป็นตัวเลือกขนาดยาง และค่าดอกยางตอนใหม่
    supabase
      .from('tire_models')
      .select('id, name, size, new_tread_mm, created_by_company, tire_brands(name, is_active)')
      .eq('is_active', true)
      .order('name'),
    company
      ? supabase.from('company_tire_models').select('tire_model_id').eq('company_id', company.id)
      : Promise.resolve({ data: [] as { tire_model_id: string }[] }),
  ])

  // ตัวเลือกรุ่นยาง = เฉพาะรุ่นกลางที่ super admin เปิดสิทธิ์ให้บริษัทนี้ (กฎเดียวกับหน้า "ข้อมูลยาง")
  // ไม่รวมรุ่นที่บริษัทสร้างเอง และรุ่นที่ยี่ห้อถูกปิดใช้งาน — ยางในคลังที่ผูกรุ่นเหล่านั้นยังเลือกได้ตามปกติ
  const granted = new Set((grantData ?? []).map((g) => g.tire_model_id))
  const visibleModels = ((modelData ?? []) as unknown as ModelRow[]).filter(
    (m) => granted.has(m.id) && m.created_by_company === null && m.tire_brands?.is_active !== false,
  )

  const models: TireModelLite[] = visibleModels.map((m) => ({
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
        subtitle=""
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
