import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AxleAccessClient, type AccessAxleType } from '../axle-access-client'
import type { AxleType } from '@/lib/database.types'

export const metadata = { title: 'สิทธิ์ประเภทเพลา · Dream Tire Admin' }

/** แท็บกำหนดว่าลูกค้ารายนี้เลือกใช้ประเภทเพลาแบบใดได้บ้าง */
export default async function CompanyAxleAccessPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSession(['super_admin'])
  const { id } = await params
  const supabase = await createClient()

  const [{ data: axleData }, { data: accessData }, { data: vehicleData }] = await Promise.all([
    supabase
      .from('axle_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name'),
    supabase.from('company_axle_types').select('axle_type_id').eq('company_id', id),
    supabase.from('vehicles').select('axle_type').eq('company_id', id),
  ])

  const usageByCode = new Map<string, number>()
  for (const vehicle of vehicleData ?? []) {
    usageByCode.set(vehicle.axle_type, (usageByCode.get(vehicle.axle_type) ?? 0) + 1)
  }

  const axleTypes: AccessAxleType[] = ((axleData ?? []) as AxleType[]).map((type) => ({
    id: type.id,
    code: type.code,
    name: type.name,
    category: type.category,
    axle_kinds: type.axle_kinds,
    usage_count: usageByCode.get(type.code) ?? 0,
  }))

  return (
    <AxleAccessClient
      companyId={id}
      axleTypes={axleTypes}
      allowed={(accessData ?? []).map((row) => row.axle_type_id)}
    />
  )
}
