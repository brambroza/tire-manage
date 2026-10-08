import { BarChart3, CircleDot, ClipboardCheck, Ruler, TrendingUp, Truck } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui'
import { formatNumber } from '@/lib/utils'
import { KpiCard } from '../../dashboard/dashboard-ui'
import { FleetFilterBar } from './fleet-filters'
import { InspectionDonut, TreadDonut, TreadHistogramChart, TrendChart } from './fleet-charts'
import { BranchMatrixCard, LowTreadCard, StaleVehiclesCard } from './fleet-cards'
import {
  TREAD_LOW_MM, TREAD_MID_MM, TREND_MONTHS,
  branchFileSlug, branchFilterLabel, branchOptions, buildBranchMatrix, buildInspectionBuckets, buildKpis,
  buildLowTread, buildStaleVehicles, buildTrend, buildTreadHistogram, buildTreadSummary, filterVehicles,
  latestActivityByVehicle, monthBounds, monthLabelTH, parseFleetFilters, referenceDateISO, tiresOfVehicles,
  trailingMonths, vehiclesPerAxleType, vehiclesRecordedIn,
  type FleetAxleType, type FleetEvent, type FleetTire, type FleetVehicle,
} from './fleet-report'
import type { FleetExportInput } from './fleet-report-export'

export const metadata = { title: 'รายงานรถและการตรวจยาง · Dream Tire' }

/** เพดานจำนวนรถที่ดึงมาคำนวณ — เกินกว่านี้รถที่เหลือจะไม่ถูกนับ (ฟลีตปกติไม่ถึง) */
const VEHICLE_LIMIT = 5000
/** เพดานจำนวนยางบนรถที่ดึงมาคำนวณ */
const TIRE_LIMIT = 5000
/**
 * เพดานจำนวนประวัติถอด-ใส่ที่ดึงมา — ใช้ทั้งชุด 12 เดือนย้อนหลัง และชุด "ล่าสุดต่อคัน"
 * ชุดหลังเรียงจากใหม่ไปเก่า ถ้าบริษัทมีประวัติเกินเพดาน รถที่ไม่ได้บันทึกนานมากอาจกลายเป็น "ไม่เคยบันทึก"
 */
const EVENT_LIMIT = 20000
/** จำนวนปีย้อนหลังในตัวเลือกปี */
const YEAR_OPTIONS_BACK = 4

export default async function FleetReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { company } = await requireSession(['admin'])
  const supabase = await createClient()

  const now = new Date()
  const filters = parseFleetFilters(await searchParams, now)
  const bounds = monthBounds(filters.year, filters.month)
  const months = trailingMonths(filters.year, filters.month, TREND_MONTHS)
  const windowStart = monthBounds(months[0].year, months[0].month).start
  const referenceISO = referenceDateISO(filters.year, filters.month, now)

  const [
    { data: vehicleRows },
    { data: axleTypeRows },
    { data: tireRows },
    { data: windowEventRows },
    { data: latestEventRows },
  ] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, plate_no, province, axle_type, branch, current_mileage, mileage_updated_at')
      .eq('is_active', true)
      .order('plate_no')
      .limit(VEHICLE_LIMIT),
    supabase.from('axle_types').select('code, name, axle_kinds').order('sort_order').order('name'),
    supabase
      .from('tire_overview')
      .select('id, serial_no, brand_name, model_name, size, tread_mm, new_tread_mm, alert_tread_mm, alert_km, current_run_km, vehicle_id, position_code')
      .eq('status', 'mounted')
      .limit(TIRE_LIMIT),
    // ประวัติในหน้าต่าง 12 เดือน (ใช้ KPI + แนวโน้ม)
    supabase
      .from('tire_events')
      .select('vehicle_id, event_date')
      .not('vehicle_id', 'is', null)
      .gte('event_date', windowStart)
      .lte('event_date', bounds.end)
      .limit(EVENT_LIMIT),
    // ประวัติล่าสุดต่อคัน (ใช้ "ตรวจล่าสุดเมื่อไร") — ดึงจากใหม่ไปเก่าแล้วย่อเป็นค่ามากสุดต่อคันใน fleet-report
    supabase
      .from('tire_events')
      .select('vehicle_id, event_date')
      .not('vehicle_id', 'is', null)
      .order('event_date', { ascending: false })
      .limit(EVENT_LIMIT),
  ])

  const allVehicles = (vehicleRows ?? []) as FleetVehicle[]
  const axleTypes = (axleTypeRows ?? []) as FleetAxleType[]
  const allTires = (tireRows ?? []) as FleetTire[]
  const windowEvents = (windowEventRows ?? []) as FleetEvent[]
  const latestEvents = (latestEventRows ?? []) as FleetEvent[]

  const vehicles = filterVehicles(allVehicles, filters)
  const tires = tiresOfVehicles(allTires, vehicles)
  const recorded = vehiclesRecordedIn(vehicles, windowEvents, bounds)
  const kpis = buildKpis(vehicles, tires, recorded)
  const matrix = buildBranchMatrix(vehicles, tires, axleTypes)
  const perType = vehiclesPerAxleType(vehicles, axleTypes)
  const latest = latestActivityByVehicle(vehicles, latestEvents, bounds.end)
  const inspection = buildInspectionBuckets(vehicles, latest, filters.year, filters.month)
  const trend = buildTrend(vehicles, windowEvents, months)
  const stale = buildStaleVehicles(vehicles, latest, referenceISO, axleTypes)
  const treadSummary = buildTreadSummary(tires)
  const histogram = buildTreadHistogram(tires)
  const lowTread = buildLowTread(tires, vehicles, axleTypes)
  const alertTread = company?.alert_tread_mm ?? 3

  const monthLabel = monthLabelTH(filters.year, filters.month)
  const axleLabel = filters.axleType
    ? axleTypes.find((a) => a.code === filters.axleType)?.name ?? filters.axleType
    : 'ทุกประเภทรถ'
  const filterLabel = `${monthLabel} · ${branchFilterLabel(filters.branch)} · ${axleLabel}`
  const exportInput: FleetExportInput = {
    meta: {
      companyName: company?.name ?? 'Dream Tire',
      filterLabel,
      branchSlug: branchFileSlug(filters.branch),
      yyyymm: `${filters.year}${String(filters.month).padStart(2, '0')}`,
    },
    matrix,
    stale,
    lowTread,
  }

  // ตัวเลือกปี: ย้อนหลัง 4 ปี + ปีปัจจุบัน และปีที่เลือกถ้าอยู่นอกช่วง
  const yearSet = new Set<number>()
  for (let y = now.getFullYear() - YEAR_OPTIONS_BACK; y <= now.getFullYear(); y++) yearSet.add(y)
  yearSet.add(filters.year)
  const years = [...yearSet].sort((a, b) => b - a)
  const isDefault =
    filters.year === now.getFullYear() && filters.month === now.getMonth() + 1 && !filters.branch && !filters.axleType

  return (
    <>
      <PageHeader
        title="รายงานรถและการตรวจยาง"
        subtitle={company?.name ? `${company.name} · ${filterLabel}` : filterLabel}
      />

      <FleetFilterBar
        filters={filters}
        years={years}
        branches={branchOptions(company?.branches ?? [], allVehicles)}
        axleTypes={axleTypes.map((a) => ({ code: a.code, name: a.name }))}
        isDefault={isDefault}
      />

      {allVehicles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Truck className="size-6" />}
            title="ยังไม่มีรถในระบบ"
            description="เพิ่มรถที่หน้าจัดการรถก่อน แล้วรายงานนี้จะสรุปให้อัตโนมัติ"
          />
        </Card>
      ) : vehicles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Truck className="size-6" />}
            title="ไม่พบรถตามตัวกรอง"
            description="ลองเปลี่ยนสาขาหรือประเภทรถ แล้วกดแสดงอีกครั้ง"
          />
        </Card>
      ) : (
        <>
          {/* ตัวเลขสรุป */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="ตัวเลขสรุป">
            <KpiCard label="รถทั้งหมด" value={formatNumber(kpis.vehicleCount)} unit="คัน" icon={<Truck />} />
            <KpiCard
              label={`รถที่บันทึกยางใน${monthLabel}`}
              value={formatNumber(kpis.recordedVehicles)}
              unit={`คัน (${kpis.recordedVehiclePct}%)`}
              tone={kpis.recordedVehiclePct >= 80 ? 'good' : kpis.recordedVehiclePct >= 50 ? 'warn' : 'bad'}
              icon={<ClipboardCheck />}
            />
            <KpiCard label="ยางบนรถทั้งหมด" value={formatNumber(kpis.mountedTires)} unit="เส้น" tone="info" icon={<CircleDot />} />
            <KpiCard
              label="ยางที่บันทึกในเดือน"
              value={formatNumber(kpis.recordedTires)}
              unit={`เส้น (${kpis.recordedTirePct}%)`}
              tone={kpis.recordedTirePct >= 80 ? 'good' : kpis.recordedTirePct >= 50 ? 'warn' : 'bad'}
              icon={<ClipboardCheck />}
            />
          </section>

          {/* จำนวนรถตามสาขา × ประเภท */}
          <BranchMatrixCard matrix={matrix} perType={perType} exportInput={exportInput} />

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader
                title={<span className="text-lg">ตรวจยางล่าสุดเมื่อไร</span>}
                description={<span className="text-[15px] text-ink-700">นับจากการถอด-ใส่ยางหรือบันทึกเลขไมล์ครั้งล่าสุด เทียบกับ{monthLabel}</span>}
              />
              <CardBody>
                <InspectionDonut data={inspection} />
              </CardBody>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader
                title={<span className="inline-flex items-center gap-2 text-lg"><TrendingUp className="size-5 text-brand-700" />แนวโน้ม {TREND_MONTHS} เดือน</span>}
                description={<span className="text-[15px] text-ink-700">รถที่บันทึกยางในแต่ละเดือน (ถอด-ใส่ยางหรือเลขไมล์) จากรถ {formatNumber(vehicles.length)} คัน · ตัวเลขบนแท่ง = % ที่บันทึก</span>}
              />
              <CardBody>
                <TrendChart data={trend} />
              </CardBody>
            </Card>
          </div>

          {/* รถที่ไม่ได้ตรวจยางนาน */}
          <StaleVehiclesCard stale={stale} referenceISO={referenceISO} exportInput={exportInput} />

          {/* สภาพดอกยาง */}
          <Card className="mt-4">
            <CardHeader
              title={<span className="inline-flex items-center gap-2 text-lg"><Ruler className="size-5 text-brand-700" />สภาพดอกยางบนรถ</span>}
              description={
                <span className="text-[15px] text-ink-700">
                  วัดดอกแล้ว {formatNumber(treadSummary.measured)} เส้น
                  {treadSummary.unmeasured > 0 ? ` · ยังไม่วัดดอก ${formatNumber(treadSummary.unmeasured)} เส้น` : ''}
                  {' · '}แบ่งช่วงที่ {TREAD_LOW_MM} และ {TREAD_MID_MM} มม. · เกณฑ์เตือนของบริษัท {formatNumber(alertTread, 1)} มม.
                </span>
              }
            />
            <CardBody className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <TreadDonut data={treadSummary.bands} />
              </div>
              <div className="lg:col-span-3">
                <h3 className="mb-2 inline-flex items-center gap-2 text-base font-bold text-ink-900">
                  <BarChart3 className="size-4.5 text-brand-700" />
                  จำนวนยางตามดอกยาง (มม.) แยกยี่ห้อ
                </h3>
                <TreadHistogramChart data={histogram} alertTreadMm={alertTread} />
              </div>
            </CardBody>
          </Card>

          {/* ยางดอกต่ำ */}
          <LowTreadCard lowTread={lowTread} exportInput={exportInput} />
        </>
      )}
    </>
  )
}
