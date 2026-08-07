import Link from 'next/link'
import { Building2, CircleDot, Gauge, Truck } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import {
  Badge, Card, CardHeader, EmptyState, StatTile, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { formatKm, formatNumber } from '@/lib/utils'
import { TirePerformanceReport } from './tire-performance-report'
import type { ReportFilterOption, TirePerformanceRow } from './tire-performance-types'
import type { Company, TireOverview, Vehicle } from '@/lib/database.types'

export const metadata = { title: 'ภาพรวมระบบ · Dream Tire Admin' }

interface RemovalEventRecord {
  id: string
  company_id: string
  event_date: string
  distance_km: number | null
  tread_mm: number | null
  reason_id: string | null
  note: string | null
  tires: {
    serial_no: string
    tire_model_id: string | null
    brand_name: string | null
    model_name: string | null
    size: string | null
  } | null
  removal_reasons: { name: string } | null
}

/** Supabase จำกัดจำนวนแถวต่อ request จึงอ่านประวัติเป็นหน้า ๆ เพื่อให้อันดับครอบคลุมทุกข้อมูล */
async function loadAllRemovalEvents(supabase: Awaited<ReturnType<typeof createClient>>) {
  const pageSize = 1000
  const rows: RemovalEventRecord[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('tire_events')
      .select('id, company_id, event_date, distance_km, tread_mm, reason_id, note, ' +
        'tires(serial_no, tire_model_id, brand_name, model_name, size), removal_reasons(name)')
      .eq('event_type', 'unmount')
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`โหลดประวัติการเปลี่ยนยางไม่สำเร็จ: ${error.message}`)
    const page = (data ?? []) as unknown as RemovalEventRecord[]
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return rows
}

export default async function SuperDashboardPage() {
  await requireSession(['super_admin'])
  const supabase = await createClient()

  const [
    { data: companyData },
    { data: tireData },
    { data: vehicleData },
    { data: reasonData },
    removalEventData,
  ] = await Promise.all([
    supabase.from('companies').select('*').order('name'),
    supabase.from('tire_overview').select('company_id, status, lifetime_km, current_run_km, alert_km'),
    supabase.from('vehicles').select('company_id, is_active'),
    supabase.from('removal_reasons').select('id, name').order('sort_order'),
    loadAllRemovalEvents(supabase),
  ])

  const companies = (companyData ?? []) as Company[]
  const tires = (tireData ?? []) as Pick<
    TireOverview, 'company_id' | 'status' | 'lifetime_km' | 'current_run_km' | 'alert_km'
  >[]
  const vehicles = (vehicleData ?? []) as Pick<Vehicle, 'company_id' | 'is_active'>[]
  const companyNames = new Map(companies.map((company) => [company.id, company.name]))
  const performanceRows: TirePerformanceRow[] = removalEventData.map((event) => ({
    id: event.id,
    companyId: event.company_id,
    companyName: companyNames.get(event.company_id) ?? 'ไม่พบบริษัท',
    eventDate: event.event_date,
    serialNo: event.tires?.serial_no ?? '-',
    tireModelId: event.tires?.tire_model_id ?? null,
    brandName: event.tires?.brand_name ?? null,
    modelName: event.tires?.model_name ?? null,
    size: event.tires?.size ?? null,
    distanceKm: event.distance_km,
    treadMm: event.tread_mm,
    reasonId: event.reason_id,
    reasonName: event.removal_reasons?.name ?? null,
    note: event.note,
  }))
  const companyOptions: ReportFilterOption[] = companies.map((company) => ({
    id: company.id,
    name: company.name,
  }))
  const reasonOptions = (reasonData ?? []) as ReportFilterOption[]

  // สรุปรายบริษัท
  const summary = companies.map((c) => {
    const own = tires.filter((t) => t.company_id === c.id)
    return {
      company: c,
      tireCount: own.length,
      mounted: own.filter((t) => t.status === 'mounted').length,
      vehicleCount: vehicles.filter((v) => v.company_id === c.id && v.is_active).length,
      totalKm: own.reduce((s, t) => s + t.lifetime_km, 0),
      alerts: own.filter((t) => t.status === 'mounted' && t.current_run_km >= t.alert_km).length,
    }
  })

  const totalKm = tires.reduce((s, t) => s + t.lifetime_km, 0)

  return (
    <>
      <PageHeader
        title="ภาพรวมระบบทั้งหมด"
        subtitle="สรุปการใช้งานของลูกค้าทุกรายในระบบ Dream Tire"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="บริษัทลูกค้า" value={formatNumber(companies.length)} unit="ราย"
          icon={<Building2 className="size-4.5" />}
        />
        <StatTile
          label="รถทั้งหมด" value={formatNumber(vehicles.filter((v) => v.is_active).length)} unit="คัน"
          tone="sky" icon={<Truck className="size-4.5" />}
        />
        <StatTile
          label="ยางในระบบ" value={formatNumber(tires.length)} unit="เส้น"
          tone="emerald" icon={<CircleDot className="size-4.5" />}
        />
        <StatTile
          label="ระยะสะสมรวม" value={formatNumber(totalKm)} unit="กม."
          tone="brand" icon={<Gauge className="size-4.5" />}
        />
      </div>

      <TirePerformanceReport
        rows={performanceRows}
        companies={companyOptions}
        reasons={reasonOptions}
      />

      <Card className="mt-4">
        <CardHeader title="การใช้งานรายบริษัท" description="คลิกชื่อบริษัทเพื่อดูรายละเอียดและกำหนดสิทธิ์ยาง" />
        {summary.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="ยังไม่มีบริษัทลูกค้าในระบบ"
            description="เพิ่มลูกค้ารายแรกได้ที่เมนู “ข้อมูลลูกค้า”"
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[860px]">
              <thead>
                <tr>
                  <Th>บริษัท</Th>
                  <Th>รหัส</Th>
                  <Th className="text-right">รถ</Th>
                  <Th className="text-right">ยางทั้งหมด</Th>
                  <Th className="text-right">ใช้งานอยู่</Th>
                  <Th className="text-right">ระยะสะสม</Th>
                  <Th className="text-center">แจ้งเตือน</Th>
                  <Th>สถานะ</Th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.company.id} className="transition-colors hover:bg-brand-50/40">
                    <Td>
                      <Link
                        href={`/superadmin/companies/${s.company.id}`}
                        className="font-medium text-ink-900 hover:text-brand-600"
                      >
                        {s.company.name}
                      </Link>
                    </Td>
                    <Td><Badge tone="brand">{s.company.code}</Badge></Td>
                    <Td className="text-right">{formatNumber(s.vehicleCount)}</Td>
                    <Td className="text-right">{formatNumber(s.tireCount)}</Td>
                    <Td className="text-right">{formatNumber(s.mounted)}</Td>
                    <Td className="text-right">{formatKm(s.totalKm)}</Td>
                    <Td className="text-center">
                      {s.alerts > 0
                        ? <Badge tone="amber">{formatNumber(s.alerts)}</Badge>
                        : <span className="text-ink-400">-</span>}
                    </Td>
                    <Td>
                      <Badge tone={s.company.is_active ? 'emerald' : 'slate'}>
                        {s.company.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
