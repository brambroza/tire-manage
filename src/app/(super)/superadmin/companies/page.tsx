import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { CompaniesClient, type CompanyRow } from './companies-client'
import type { Company } from '@/lib/database.types'

export const metadata = { title: 'ข้อมูลลูกค้า · Dream Tire Admin' }

/** นับจำนวนแถวตาม company_id */
function countBy(rows: Array<{ company_id: string | null }>): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) {
    if (!r.company_id) continue
    map.set(r.company_id, (map.get(r.company_id) ?? 0) + 1)
  }
  return map
}

export default async function CompaniesPage() {
  await requireSession(['super_admin'])
  const supabase = await createClient()

  const [{ data: companyData }, { data: vehicles }, { data: tires }, { data: profiles }] =
    await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('vehicles').select('company_id'),
      supabase.from('tires').select('company_id'),
      supabase.from('profiles').select('company_id'),
    ])

  const vehicleCount = countBy(vehicles ?? [])
  const tireCount = countBy(tires ?? [])
  const userCount = countBy(profiles ?? [])

  const companies: CompanyRow[] = ((companyData ?? []) as Company[]).map((c) => ({
    ...c,
    vehicle_count: vehicleCount.get(c.id) ?? 0,
    tire_count: tireCount.get(c.id) ?? 0,
    user_count: userCount.get(c.id) ?? 0,
  }))

  return (
    <>
      <PageHeader
        title="ข้อมูลลูกค้า"
        subtitle="เพิ่ม แก้ไข และดูภาพรวมการใช้งานของลูกค้าแต่ละราย"
      />
      <CompaniesClient companies={companies} />
    </>
  )
}
