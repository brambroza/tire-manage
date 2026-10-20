import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { featureLockedMessage, hasFeature } from '@/lib/plan'
import { isOtherBrand } from '@/lib/tire-import'
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
 * ข้อมูลยางของบริษัท (ดูอย่างเดียว): แสดงเฉพาะรุ่นที่ super admin เปิดสิทธิ์ให้ใน company_tire_models
 * - ไม่แสดงรุ่น/ยี่ห้อที่บริษัทสร้างเอง (จากการนำเข้าหรือพิมพ์เองตอนเพิ่มยาง)
 * - ไม่แสดงรุ่นหรือยี่ห้อที่ super admin ปิดใช้งาน
 * - ไม่แสดงยี่ห้อ "อื่นๆ" ซึ่ง migration 010 เปิดให้ทุกบริษัทอัตโนมัติเป็นตัวเลือกสำรอง (ยังใช้ได้ในฟอร์มยาง/นำเข้า)
 * ยี่ห้อแสดงเฉพาะที่มีรุ่นผ่านเงื่อนไขข้างต้น
 * เฉพาะแพ็กเกจ Premium (เมนูถูกซ่อนใน layout สำหรับ Standard)
 */
export default async function CompanyCatalogPage() {
  const { company } = await requireSession(['admin'])
  // เมนูนี้มีเฉพาะแพ็กเกจ Premium — Standard เข้าผ่าน URL ตรงก็ไม่เห็น
  if (!company || !hasFeature(company, 'tire_import')) notFound()

  const supabase = await createClient()

  // RLS ให้เห็นรุ่นที่ได้รับสิทธิ์ + ของบริษัทเอง จึงต้องกรองซ้ำด้วยสิทธิ์ที่ super admin กำหนดเท่านั้น
  const [{ data: brandData }, { data: modelData }, { data: tireData }, { data: grantData }] = await Promise.all([
    supabase
      .from('tire_brands')
      .select('*')
      .is('created_by_company', null)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('tire_models')
      .select('id, brand_id, name, size, pattern_code, image_url, is_active, created_by_company, tire_brands(name)')
      .order('name'),
    supabase.from('tires').select('tire_model_id'),
    supabase.from('company_tire_models').select('tire_model_id').eq('company_id', company.id),
  ])

  const granted = new Set((grantData ?? []).map((g) => g.tire_model_id))
  const activeBrands = new Map(((brandData ?? []) as TireBrand[]).map((b) => [b.id, b]))
  const visibleModels = ((modelData ?? []) as unknown as ModelRow[]).filter(
    (m) =>
      granted.has(m.id) &&
      m.created_by_company === null &&
      m.is_active &&
      activeBrands.has(m.brand_id) &&
      !isOtherBrand(m.tire_brands?.name),
  )
  const visibleBrandIds = new Set(visibleModels.map((m) => m.brand_id))
  const brands = [...activeBrands.values()].filter((b) => visibleBrandIds.has(b.id))

  const tireCount = new Map<string, number>()
  for (const t of tireData ?? []) {
    if (!t.tire_model_id) continue
    tireCount.set(t.tire_model_id, (tireCount.get(t.tire_model_id) ?? 0) + 1)
  }

  const models: CompanyCatalogModel[] = visibleModels.map((m) => ({
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
        subtitle="ยี่ห้อและรุ่นยางที่บริษัทใช้ได้ ถ้ารุ่นที่ต้องการยังไม่มี แจ้ง Dreammaker ได้เลย"
      />
      <CompanyCatalogClient
        brands={brands}
        models={models}
        companyId={company.id}
        canManage={false}
        readOnly
        lockedMessage={featureLockedMessage('tire_catalog_own')}
      />
    </>
  )
}
