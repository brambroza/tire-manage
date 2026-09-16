import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui'
import { TiresClient } from '@/app/(app)/tires/tires-client'
import type { ModelOption } from '@/app/(app)/tires/tire-form'
import { fetchLastRemovals } from '@/lib/tire-events'
import { computeTireStats, filterTiresByDate, parseTireDateFilter } from '@/app/(app)/tires/tire-filters'
import type { AxleType, Tire, TireOverview } from '@/lib/database.types'

export const metadata = { title: 'จัดการคลังยางของลูกค้า · Dream Tire Admin' }

interface ModelRow {
  id: string
  name: string
  size: string | null
  pattern_code: string | null
  new_tread_mm: number | null
  image_url: string | null
  tire_brands: { name: string } | null
}

/** แท็บจัดการคลังยางของลูกค้า — ใช้ตาราง/ฟอร์มชุดเดียวกับฝั่งลูกค้า */
export default async function CompanyTiresPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string; status?: string; date_field?: string; from?: string; to?: string }>
}) {
  await requireSession(['super_admin'])
  const { id } = await params
  const { q, status, date_field, from, to } = await searchParams
  const supabase = await createClient()

  const [{ data: overviewData }, { data: rawData }, { data: modelData }, { data: axleTypeData }, { data: companyData }] =
    await Promise.all([
      supabase.from('tire_overview').select('*').eq('company_id', id).order('serial_no').limit(2000),
      supabase.from('tires').select('*').eq('company_id', id).limit(2000),
      supabase
        .from('tire_models')
        .select('id, name, size, pattern_code, new_tread_mm, image_url, tire_brands(name)')
        .eq('is_active', true)
        .order('name'),
      // ใช้แปลรหัสตำแหน่งล้อในตารางประวัติให้ตรงกับผังเพลาจริง
      supabase.from('axle_types').select('*').order('sort_order').order('name'),
      supabase.from('companies').select('name').eq('id', id).maybeSingle(),
    ])

  let tires = (overviewData ?? []) as TireOverview[]
  const stats = computeTireStats(tires)

  // ยางที่ไม่ได้อยู่บนรถ ต้องรู้ว่าถอดมาจากทะเบียนไหน ที่เลขไมล์เท่าไร
  // ดึงก่อนกรอง เพื่อให้ค้นด้วยทะเบียนเจอยางที่ถอดออกจากรถคันนั้นแล้วด้วย
  const lastRemovals = await fetchLastRemovals(
    supabase,
    tires.filter((t) => t.status !== 'mounted').map((t) => t.id),
  )

  // ค้นหาได้ทั้งเลขยาง ยี่ห้อ รุ่น DOT และทะเบียนรถ — ทะเบียนดูทั้งคันที่ติดตั้งอยู่
  // และคันที่ถอดยางเส้นนั้นออกมาล่าสุด
  const term = q?.trim().toLowerCase()
  if (term) {
    tires = tires.filter((t) =>
      [t.serial_no, t.brand_name, t.model_name, t.size, t.plate_no, t.dot, lastRemovals[t.id]?.plate_no]
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

  // กรองช่วงวันที่ (between) — วันที่รับเข้าระบบอยู่ในตาราง tires ไม่ใช่ view จึงกรองหลังรวมข้อมูลดิบ
  tires = filterTiresByDate(tires, rawTires, parseTireDateFilter({ date_field, from, to }))

  const models: ModelOption[] = ((modelData ?? []) as unknown as ModelRow[]).map((m) => ({
    id: m.id,
    brand: m.tire_brands?.name ?? '',
    model: m.name,
    size: m.size,
    pattern_code: m.pattern_code,
    new_tread_mm: m.new_tread_mm,
    image_url: m.image_url,
  }))

  return (
    <>
      <Card className="mb-4">
        <CardHeader
          title="จัดการคลังยางแทนลูกค้า"
          description="เพิ่มยางเข้าคลัง แก้ไขข้อมูล หรือตัดจำหน่ายได้ — ยางที่ติดตั้งอยู่กับรถต้องถอดออกก่อนจึงตัดจำหน่ายได้"
        />
      </Card>
      <TiresClient
        tires={tires}
        rawTires={rawTires}
        models={models}
        lastRemovals={lastRemovals}
        canManage
        canAdd
        companyId={id}
        basePath={`/superadmin/companies/${id}/tires`}
        enableLinks={false}
        enableHistory
        axleTypes={(axleTypeData ?? []) as AxleType[]}
        companyName={companyData?.name ?? 'Dream Tire'}
        stats={stats}
      />
    </>
  )
}
