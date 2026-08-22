import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { TiresClient } from './tires-client'
import type { ModelOption } from './tire-form'
import { fetchLastRemovals } from '@/lib/tire-events'
import type { Tire, TireOverview } from '@/lib/database.types'

export const metadata = { title: 'คลังยาง · Dream Tire' }

interface ModelRow {
  id: string
  name: string
  size: string | null
  pattern_code: string | null
  new_tread_mm: number | null
  image_url: string | null
  tire_brands: { name: string } | null
}

export default async function TiresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { profile } = await requireSession(['admin', 'technician'])
  const { q, status } = await searchParams
  const supabase = await createClient()

  const [{ data: overviewData }, { data: rawData }, { data: modelData }] = await Promise.all([
    supabase.from('tire_overview').select('*').order('serial_no').limit(2000),
    supabase.from('tires').select('*').limit(2000),
    supabase
      .from('tire_models')
      .select('id, name, size, pattern_code, new_tread_mm, image_url, tire_brands(name)')
      .eq('is_active', true)
      .order('name'),
  ])

  let tires = (overviewData ?? []) as TireOverview[]

  // ค้นหาได้ทั้งเลขยาง ยี่ห้อ รุ่น และทะเบียนรถ (ทำฝั่ง server หลังดึงข้อมูล
  // เพราะ view รวมข้อมูลจากหลายตารางแล้ว จำนวนยางต่อบริษัทอยู่ในหลักพัน)
  const term = q?.trim().toLowerCase()
  if (term) {
    tires = tires.filter((t) =>
      [t.serial_no, t.brand_name, t.model_name, t.size, t.plate_no, t.dot]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term)),
    )
  }

  if (status === 'alert') {
    tires = tires.filter(
      (t) =>
        t.status === 'mounted' &&
        (t.current_run_km >= t.alert_km || (t.tread_mm !== null && t.tread_mm <= t.alert_tread_mm)),
    )
  } else if (status && status !== 'all') {
    tires = tires.filter((t) => t.status === status)
  }

  const rawTires: Record<string, Tire> = {}
  for (const t of (rawData ?? []) as Tire[]) rawTires[t.id] = t

  const models: ModelOption[] = ((modelData ?? []) as unknown as ModelRow[]).map((m) => ({
    id: m.id,
    brand: m.tire_brands?.name ?? '',
    model: m.name,
    size: m.size,
    pattern_code: m.pattern_code,
    new_tread_mm: m.new_tread_mm,
    image_url: m.image_url,
  }))

  // ยางที่ไม่ได้อยู่บนรถ ต้องรู้ว่าถอดมาจากทะเบียนไหน ที่เลขไมล์เท่าไร
  const lastRemovals = await fetchLastRemovals(
    supabase,
    tires.filter((t) => t.status !== 'mounted').map((t) => t.id),
  )

  return (
    <>
      <PageHeader
        title="คลังยาง"
        subtitle="ค้นหาได้จากเลขยางหรือทะเบียนรถ พร้อมดูว่ายางแต่ละเส้นอยู่ที่ไหนและวิ่งไปแล้วเท่าไร"
      />
      <TiresClient
        tires={tires}
        rawTires={rawTires}
        models={models}
        lastRemovals={lastRemovals}
        canManage={profile.role === 'admin'}
      />
    </>
  )
}
