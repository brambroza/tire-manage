import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { ServiceWizard, type TireLite, type VehicleLite } from './service-wizard'
import type { ModelOption } from '../tires/tire-form'
import type { Vehicle } from '@/lib/database.types'

export const metadata = { title: 'บันทึกถอด-ใส่ยาง · Dream Tire' }

interface ModelRow {
  id: string
  name: string
  size: string | null
  pattern_code: string | null
  image_url: string | null
  tire_brands: { name: string } | null
}

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>
}) {
  const { company } = await requireSession(['admin', 'technician'])
  const { vehicle } = await searchParams
  const supabase = await createClient()

  const [{ data: vehicleData }, { data: tireData }, { data: reasonData }, { data: modelData }] =
    await Promise.all([
      supabase
        .from('vehicles')
        .select('id, plate_no, province, brand, model, axle_type, current_mileage')
        .eq('is_active', true)
        .order('plate_no'),
      supabase
        .from('tire_overview')
        .select('id, serial_no, brand_name, model_name, size, status, tread_mm, ' +
          'lifetime_km, current_run_km, vehicle_id, position_code, plate_no, image_url')
        .neq('status', 'scrapped')
        .order('serial_no')
        .limit(3000),
      supabase
        .from('removal_reasons')
        .select('id, name, is_scrap')
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('tire_models')
        .select('id, name, size, pattern_code, image_url, tire_brands(name)')
        .eq('is_active', true)
        .order('name'),
    ])

  const models: ModelOption[] = ((modelData ?? []) as unknown as ModelRow[]).map((m) => ({
    id: m.id,
    brand: m.tire_brands?.name ?? '',
    model: m.name,
    size: m.size,
    pattern_code: m.pattern_code,
    image_url: m.image_url,
  }))

  return (
    <>
      <PageHeader
        title="บันทึกการถอด-ใส่ยาง"
        breadcrumb={['หน้าหลัก', 'การถอด-ใส่ยาง', 'บันทึกข้อมูล']}
        subtitle="เลือกรถ เลือกตำแหน่งล้อจากแผนผัง แล้วบันทึกข้อมูลได้ในไม่กี่ขั้นตอน"
      />
      <ServiceWizard
        vehicles={(vehicleData ?? []) as Pick<Vehicle, keyof VehicleLite>[] as VehicleLite[]}
        tires={(tireData ?? []) as unknown as TireLite[]}
        reasons={reasonData ?? []}
        models={models}
        alertKm={company?.alert_km ?? 10000}
        initialVehicleId={vehicle}
      />
    </>
  )
}
