import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { featureLockedMessage, hasFeature } from '@/lib/plan'
import { PageHeader } from '@/components/app-shell'
import { CompanyCatalogClient, type CompanyCatalogModel } from './catalog-client'
import type { TireBrand } from '@/lib/database.types'

export const metadata = { title: 'ข้อมูลยาง · Dream Tire' }

interface ModelRow {
  id: string
  brand_id: string
  name: string
  size: string | null
  pattern_code: string | null
  image_url: string | null
  is_active: boolean
  created_by_company: string | null
  tire_brands: { name: string } | null
}

/**
 * ข้อมูลยางของบริษัท: รุ่นจากแคตตาล็อกกลางที่ได้รับสิทธิ์ + ยี่ห้อ/รุ่นที่บริษัทเพิ่มเอง
 * แก้ไขได้เฉพาะรายการของตัวเอง และต้องเป็นแพ็กเกจ Premium จึงเพิ่ม/แก้ได้
 */
export default async function CompanyCatalogPage() {
  const { company } = await requireSession(['admin'])
  if (!company) notFound()

  const canManage = hasFeature(company, 'tire_catalog_own')
  const supabase = await createClient()

  // ยี่ห้อ: เฉพาะของกลาง (created_by_company = null) และของบริษัทนี้ — ไม่โชว์ยี่ห้อที่ลูกค้ารายอื่นสร้าง
  // รุ่น: RLS กรองให้เห็นเฉพาะที่ได้รับสิทธิ์ + ของตัวเองอยู่แล้ว
  const [{ data: brandData }, { data: modelData }, { data: tireData }] = await Promise.all([
    supabase
      .from('tire_brands')
      .select('*')
      .or(`created_by_company.is.null,created_by_company.eq.${company.id}`)
      .order('name'),
    supabase
      .from('tire_models')
      .select('id, brand_id, name, size, pattern_code, image_url, is_active, created_by_company, tire_brands(name)')
      .order('name'),
    supabase.from('tires').select('tire_model_id'),
  ])

  const tireCount = new Map<string, number>()
  for (const t of tireData ?? []) {
    if (!t.tire_model_id) continue
    tireCount.set(t.tire_model_id, (tireCount.get(t.tire_model_id) ?? 0) + 1)
  }

  const models: CompanyCatalogModel[] = ((modelData ?? []) as unknown as ModelRow[]).map((m) => ({
    id: m.id,
    brand_id: m.brand_id,
    brand_name: m.tire_brands?.name ?? '-',
    name: m.name,
    size: m.size,
    pattern_code: m.pattern_code,
    image_url: m.image_url,
    is_active: m.is_active,
    is_own: m.created_by_company === company.id,
    tire_count: tireCount.get(m.id) ?? 0,
  }))

  return (
    <>
      <PageHeader
        title="ข้อมูลยาง"
        subtitle="ยี่ห้อและรุ่นยางที่ใช้ในคลังและหน้าช่าง — รายการจากแคตตาล็อกกลางดูได้อย่างเดียว เพิ่ม/แก้ได้เฉพาะรายการของบริษัท"
      />
      <CompanyCatalogClient
        brands={(brandData ?? []) as TireBrand[]}
        models={models}
        companyId={company.id}
        canManage={canManage}
        lockedMessage={featureLockedMessage('tire_catalog_own')}
      />
    </>
  )
}
