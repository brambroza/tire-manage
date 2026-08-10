import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { CatalogClient, type CatalogModel } from './catalog-client'
import type { Company, TireBrand } from '@/lib/database.types'

export const metadata = { title: 'ข้อมูลยาง · Dream Tire Admin' }

interface ModelRow {
  id: string
  brand_id: string
  name: string
  size: string | null
  pattern_code: string | null
  new_tread_mm: number | null
  image_url: string | null
  is_active: boolean
  created_by_company: string | null
  tire_brands: { name: string } | null
}

export default async function CatalogPage() {
  await requireSession(['super_admin'])
  const supabase = await createClient()

  const [{ data: brandData }, { data: modelData }, { data: tireData }, { data: companyData }] =
    await Promise.all([
      supabase.from('tire_brands').select('*').order('name'),
      supabase
        .from('tire_models')
        .select('id, brand_id, name, size, pattern_code, new_tread_mm, image_url, is_active, created_by_company, tire_brands(name)')
        .order('name'),
      supabase.from('tires').select('tire_model_id'),
      supabase.from('companies').select('id, name'),
    ])

  const tireCount = new Map<string, number>()
  for (const t of tireData ?? []) {
    if (!t.tire_model_id) continue
    tireCount.set(t.tire_model_id, (tireCount.get(t.tire_model_id) ?? 0) + 1)
  }

  const companyName = new Map<string, string>()
  for (const c of (companyData ?? []) as Pick<Company, 'id' | 'name'>[]) {
    companyName.set(c.id, c.name)
  }

  const models: CatalogModel[] = ((modelData ?? []) as unknown as ModelRow[]).map((m) => ({
    id: m.id,
    brand_id: m.brand_id,
    brand_name: m.tire_brands?.name ?? '-',
    name: m.name,
    size: m.size,
    pattern_code: m.pattern_code,
    new_tread_mm: m.new_tread_mm,
    image_url: m.image_url,
    is_active: m.is_active,
    created_by_company: m.created_by_company,
    company_name: m.created_by_company ? companyName.get(m.created_by_company) ?? null : null,
    tire_count: tireCount.get(m.id) ?? 0,
  }))

  return (
    <>
      <PageHeader
        title="ข้อมูลยาง"
        subtitle="จัดการยี่ห้อ รุ่น ซีรีส์ ขนาด และดอกยางตอนใหม่ สำหรับใช้ทั้งระบบ"
      />
      <CatalogClient brands={(brandData ?? []) as TireBrand[]} models={models} />
    </>
  )
}
