import Link from 'next/link'
import { AlertTriangle, CircleDot, Package, Truck, ArrowRight } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { MonthlyEventsChart, StatusDonut, type MonthPoint } from '@/components/charts'
import {
  Badge, Card, CardBody, CardHeader, EmptyState, StatTile, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { TireThumb } from '@/components/tire-thumb'
import { TireSpec } from '@/components/tire-spec'
import { positionLabel } from '@/lib/axle-layouts'
import {
  TIRE_STATUS_LABEL, TIRE_STATUS_TONE, formatKm, formatNumber, treadPercent,
} from '@/lib/utils'
import { RemovalReport } from './removal-report'
import type { RemovalReasonOption, RemovalReportRow } from './removal-report-types'
import type { TireOverview } from '@/lib/database.types'

export const metadata = { title: 'ภาพรวม · Dream Tire' }

/** แถวประวัติการถอดยางที่ join ข้อมูลยาง/รถ/สาเหตุมาด้วย */
interface RemovalEventRow {
  id: string
  event_date: string
  position_code: string | null
  odometer: number
  tread_mm: number | null
  distance_km: number | null
  reason_id: string | null
  note: string | null
  tires: {
    serial_no: string
    brand_name: string | null
    model_name: string | null
    size: string | null
  } | null
  vehicles: { plate_no: string; province: string; axle_type: string } | null
  removal_reasons: { name: string } | null
}

/** สร้างชุดข้อมูล 6 เดือนล่าสุดสำหรับกราฟ */
function buildMonthlySeries(
  events: Array<{ event_type: string; event_date: string }>,
): MonthPoint[] {
  const months: MonthPoint[] = []
  const index = new Map<string, MonthPoint>()
  const now = new Date()

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const point: MonthPoint = {
      month: d.toLocaleDateString('th-TH', { month: 'short' }),
      mount: 0,
      unmount: 0,
    }
    months.push(point)
    index.set(key, point)
  }

  for (const e of events) {
    const d = new Date(e.event_date)
    const point = index.get(`${d.getFullYear()}-${d.getMonth()}`)
    if (!point) continue
    if (e.event_type === 'mount') point.mount++
    else point.unmount++
  }

  return months
}

export default async function DashboardPage() {
  const { company } = await requireSession(['admin'])
  const supabase = await createClient()
  const firstChartMonth = new Date()
  firstChartMonth.setDate(1)
  firstChartMonth.setHours(0, 0, 0, 0)
  firstChartMonth.setMonth(firstChartMonth.getMonth() - 5)

  const [
    { data: tireRows },
    { data: chartEventRows },
    { data: removalEventRows },
    { data: removalReasonRows },
    { count: vehicleCount },
  ] = await Promise.all([
    supabase
      .from('tire_overview')
      .select('*')
      .order('lifetime_km', { ascending: false })
      .limit(2000),
    supabase
      .from('tire_events')
      .select('event_type, event_date')
      .gte('event_date', firstChartMonth.toISOString().slice(0, 10)),
    supabase
      .from('tire_events')
      .select('id, event_date, position_code, odometer, tread_mm, distance_km, reason_id, note, ' +
        'tires(serial_no, brand_name, model_name, size), vehicles(plate_no, province, axle_type), ' +
        'removal_reasons(name)')
      .eq('event_type', 'unmount')
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('removal_reasons')
      .select('id, name')
      .order('sort_order')
      .limit(100),
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ])

  const tires = (tireRows ?? []) as TireOverview[]
  const alertKm = company?.alert_km ?? 10000
  const alertTread = company?.alert_tread_mm ?? 3

  const mounted = tires.filter((t) => t.status === 'mounted')
  const inStock = tires.filter((t) => t.status === 'in_stock')
  const scrapped = tires.filter((t) => t.status === 'scrapped')

  // ยางที่ถึงเกณฑ์แจ้งเตือน: วิ่งเกิน alert_km ในรอบปัจจุบัน หรือดอกยางต่ำกว่าเกณฑ์
  const alerts = mounted
    .filter((t) => t.current_run_km >= alertKm || (t.tread_mm !== null && t.tread_mm <= alertTread))
    .sort((a, b) => b.current_run_km - a.current_run_km)

  const totalKm = tires.reduce((sum, t) => sum + t.lifetime_km, 0)

  const removalRows: RemovalReportRow[] = ((removalEventRows ?? []) as unknown as RemovalEventRow[])
    .map((event) => ({
      id: event.id,
      eventDate: event.event_date,
      serialNo: event.tires?.serial_no ?? '-',
      brandName: event.tires?.brand_name ?? null,
      modelName: event.tires?.model_name ?? null,
      size: event.tires?.size ?? null,
      plateNo: event.vehicles?.plate_no ?? null,
      province: event.vehicles?.province ?? null,
      axleType: event.vehicles?.axle_type ?? null,
      positionCode: event.position_code,
      odometer: event.odometer,
      treadMm: event.tread_mm,
      distanceKm: event.distance_km,
      reasonId: event.reason_id,
      reasonName: event.removal_reasons?.name ?? null,
      note: event.note,
    }))
  const removalReasons = (removalReasonRows ?? []) as RemovalReasonOption[]

  return (
    <>
      <PageHeader
        title="ภาพรวมการใช้งานยาง"
        subtitle={company?.name ?? undefined}
        action={
          <Link
            href="/tires"
            className="tap-target inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-medium text-ink-700 hover:bg-brand-50"
          >
            ดูคลังยางทั้งหมด
            <ArrowRight className="size-4" />
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="ยางทั้งหมด" value={formatNumber(tires.length)} unit="เส้น"
          icon={<CircleDot className="size-4.5" />}
        />
        <StatTile
          label="ใช้งานอยู่บนรถ" value={formatNumber(mounted.length)} unit="เส้น" tone="emerald"
          icon={<Truck className="size-4.5" />}
        />
        <StatTile
          label="อยู่ในคลัง" value={formatNumber(inStock.length)} unit="เส้น" tone="sky"
          icon={<Package className="size-4.5" />}
        />
        <StatTile
          label={`ถึงเกณฑ์เตือน (${formatNumber(alertKm)} กม.)`}
          value={formatNumber(alerts.length)} unit="เส้น" tone="amber"
          icon={<AlertTriangle className="size-4.5" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="การถอด-ใส่ยาง 6 เดือนล่าสุด"
            description={`ระยะสะสมทั้งหมด ${formatKm(totalKm)} · รถที่ใช้งาน ${formatNumber(vehicleCount ?? 0)} คัน`}
          />
          <CardBody>
            <MonthlyEventsChart data={buildMonthlySeries(chartEventRows ?? [])} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="สถานะยาง" description="สัดส่วนยางทั้งหมดในระบบ" />
          <CardBody>
            <StatusDonut
              data={[
                { name: 'ใช้งานอยู่', value: mounted.length },
                { name: 'อยู่ในคลัง', value: inStock.length },
                { name: 'ตัดจำหน่าย', value: scrapped.length },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      {/* แจ้งเตือน */}
      <Card className="mt-4">
        <CardHeader
          title="ยางที่ถึงเกณฑ์แจ้งเตือน"
          description={`วิ่งเกิน ${formatNumber(alertKm)} กม. ในรอบปัจจุบัน หรือดอกยางเหลือ ≤ ${alertTread} มม.`}
          action={<Badge tone={alerts.length ? 'amber' : 'emerald'}>{formatNumber(alerts.length)} เส้น</Badge>}
        />
        {alerts.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="size-6" />}
            title="ยังไม่มียางที่ถึงเกณฑ์แจ้งเตือน"
            description="ระบบจะแจ้งเตือนอัตโนมัติเมื่อยางวิ่งเกินเกณฑ์ที่ตั้งไว้ในหน้าข้อมูลบริษัท"
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th className="w-16">รูป</Th>
                  <Th>เลขยาง</Th>
                  <Th>ทะเบียนรถ</Th>
                  <Th className="hidden md:table-cell">ตำแหน่ง</Th>
                  <Th className="text-right">ระยะรอบนี้</Th>
                  <Th className="hidden text-right lg:table-cell">ระยะสะสม</Th>
                  <Th className="hidden sm:table-cell">ดอกยางเหลือ</Th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 10).map((t) => {
                  const pct = treadPercent(t.tread_mm, t.new_tread_mm)
                  return (
                    <tr key={t.id} className="transition-colors hover:bg-brand-50/40">
                      <Td>
                        <TireThumb
                          src={t.image_url}
                          alt={[t.brand_name, t.model_name].filter(Boolean).join(' ')}
                        />
                      </Td>
                      <Td className="font-medium text-ink-900">
                        <Link href={`/tires/${t.id}`} className="hover:text-brand-600">{t.serial_no}</Link>
                        <TireSpec
                          size={t.size}
                          brandName={t.brand_name}
                          modelName={t.model_name}
                          className="mt-1"
                        />
                      </Td>
                      <Td>{t.plate_no ?? '-'}</Td>
                      <Td className="hidden md:table-cell">{positionLabel(t.position_code)}</Td>
                      <Td className="text-right font-medium text-amber-600">{formatKm(t.current_run_km)}</Td>
                      <Td className="hidden text-right lg:table-cell">{formatKm(t.lifetime_km)}</Td>
                      <Td className="hidden sm:table-cell">
                        {t.tread_mm !== null
                          ? <Badge tone={t.tread_mm <= alertTread ? 'rose' : 'slate'}>
                              {t.tread_mm} มม.{pct !== null ? ` (${pct}%)` : ''}
                            </Badge>
                          : '-'}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <RemovalReport
        companyName={company?.name ?? 'Dream Tire'}
        rows={removalRows}
        reasons={removalReasons}
      />

      {/* ยางที่วิ่งมากที่สุด */}
      <Card className="mt-4">
        <CardHeader title="ยางที่มีระยะสะสมสูงสุด" description="เรียงตามระยะทางสะสมตลอดอายุยาง" />
        {tires.length === 0 ? (
          <EmptyState
            icon={<CircleDot className="size-6" />}
            title="ยังไม่มียางในระบบ"
            description="เพิ่มยางเข้าคลังได้ที่เมนู “คลังยาง”"
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th className="w-16">รูป</Th>
                  <Th>เลขยาง</Th>
                  <Th className="hidden lg:table-cell">ขนาด / ยี่ห้อ รุ่น</Th>
                  <Th>สถานะ</Th>
                  <Th className="hidden sm:table-cell">ตำแหน่งปัจจุบัน</Th>
                  <Th className="text-right">ระยะสะสม</Th>
                </tr>
              </thead>
              <tbody>
                {tires.slice(0, 10).map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-brand-50/40">
                    <Td>
                      <TireThumb
                        src={t.image_url}
                        alt={[ t.model_name ,t.brand_name].filter(Boolean).join(' ')}
                      />
                    </Td>
                    <Td className="font-medium text-ink-900">
                      <Link href={`/tires/${t.id}`} className="hover:text-brand-600">{t.serial_no}</Link>
                      <TireSpec
                        size={t.size}
                        brandName={t.brand_name}
                        modelName={t.model_name}
                        className="mt-1 lg:hidden"
                      />
                    </Td>
                    <Td className="hidden lg:table-cell">
                      <TireSpec size={t.size} brandName={t.brand_name} modelName={t.model_name} />
                    </Td>
                    <Td>
                      <Badge tone={TIRE_STATUS_TONE[t.status]}>{TIRE_STATUS_LABEL[t.status]}</Badge>
                    </Td>
                    <Td className="hidden sm:table-cell">
                      {t.status === 'mounted'
                        ? `${t.plate_no} · ${positionLabel(t.position_code)}`
                        : 'คลังสินค้า'}
                    </Td>
                    <Td className="text-right font-medium">{formatKm(t.lifetime_km)}</Td>
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
