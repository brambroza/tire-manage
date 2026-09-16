import Link from 'next/link'
import {
  AlertTriangle, ArrowRight, Ban, Check, CircleDot, Gauge, Package, Repeat, Truck,
} from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  LIFETIME_SOON_DAYS, getLifetimeAlerts, getLifetimeSoonAlerts, getVehicleChangeAlerts,
} from '@/lib/notifications'
import { PageHeader } from '@/components/app-shell'
import {
  ALERT_ROW, Card, CardBody, CardHeader, EmptyState, Table, TableWrap, Td, Th, alertLevel,
} from '@/components/ui'
import { TireThumb } from '@/components/tire-thumb'
import { TireSpec } from '@/components/tire-spec'
import { positionLabel } from '@/lib/axle-layouts'
import { cn, formatKm, formatNumber, formatThaiDate, treadPercent } from '@/lib/utils'
import { DashboardMonthlyChart, DashboardStatusDonut } from './dashboard-charts'
import { KpiCard, StatusChip, TD_LG, TH_LG, TodayCard } from './dashboard-ui'
import { RemovalReport } from './removal-report'
import { TopMileageTable, type TopMileageRow } from './top-mileage-table'
import { LifetimeAlertCard } from './lifetime-alert-card'
import { DashboardDateFilter } from './dashboard-date-filter'
import { buildEventSeries, isRangeInvalid, parseDashboardRange } from './dashboard-filters'
import { dateRangeLabel } from './removal-report-types'
import type { RemovalReasonOption, RemovalReportRow } from './removal-report-types'
import type { TireOverview } from '@/lib/database.types'

export const metadata = { title: 'ภาพรวม · Dream Tire' }

/** จำนวนแถวสูงสุดต่อกลุ่มในการ์ด "ยางครบระยะสะสม" */
const DASHBOARD_LIFETIME_ITEMS = 10

/** เพดานจำนวน event ที่ดึงมาทำกราฟ — กันหน้าโหลดช้าเมื่อเลือก "ทั้งหมด" กับบริษัทที่มีประวัติมาก */
const CHART_EVENT_LIMIT = 20000

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

/** คำอธิบายสีที่ใช้ทั้งหน้า */
const COLOR_LEGEND: Array<{ className: string; label: string }> = [
  { className: 'bg-emerald-600', label: 'เขียว = ปกติ / ใช้งานอยู่' },
  { className: 'bg-sky-600', label: 'ฟ้า = อยู่ในคลัง' },
  { className: 'bg-orange-600', label: 'ส้ม = วิ่งเกินระยะ ควรตรวจ' },
  { className: 'bg-rose-600', label: 'แดง = ดอกยางต่ำ / ต้องจัดการ' },
]

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { company } = await requireSession(['admin'])
  const supabase = await createClient()

  // ช่วงวันที่ของหน้า (?from=&to=) — ว่าง = ทั้งหมด; ช่วงกลับด้านถือว่าไม่กรอง ให้ฟอร์มโชว์ error แทน
  const rawRange = parseDashboardRange(await searchParams)
  const range = isRangeInvalid(rawRange) ? { from: '', to: '' } : rawRange
  const hasRange = Boolean(range.from || range.to)

  /** เติมเงื่อนไขช่วงวันที่ให้ query ของ tire_events (ด้านที่ว่างไม่จำกัด) */
  function withRange<T extends { gte(c: string, v: string): T; lte(c: string, v: string): T }>(query: T): T {
    let q = query
    if (range.from) q = q.gte('event_date', range.from)
    if (range.to) q = q.lte('event_date', range.to)
    return q
  }

  const [
    { data: tireRows },
    { data: chartEventRows },
    { data: removalEventRows },
    { data: removalReasonRows },
    { count: vehicleCount },
    vehicleAlerts,
    lifetimeReached,
    lifetimeSoon,
  ] = await Promise.all([
    supabase
      .from('tire_overview')
      .select('*')
      .order('lifetime_km', { ascending: false })
      .limit(2000),
    // กราฟถอด-ใส่: ดึงเฉพาะสองคอลัมน์ตามช่วงที่เลือก (ไม่เลือก = ทั้งหมด)
    withRange(
      supabase
        .from('tire_events')
        .select('event_type, event_date'),
    ).limit(CHART_EVENT_LIMIT),
    withRange(
      supabase
        .from('tire_events')
        .select('id, event_date, position_code, odometer, tread_mm, distance_km, reason_id, note, ' +
          'tires(serial_no, brand_name, model_name, size), vehicles(plate_no, province, axle_type), ' +
          'removal_reasons(name)')
        .eq('event_type', 'unmount'),
    )
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase
      .from('removal_reasons')
      .select('id, name')
      .order('sort_order')
      .limit(100),
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    company ? getVehicleChangeAlerts(supabase, company.id) : Promise.resolve([]),
    // ยางครบระยะสะสม — กรองใน SQL เพราะถ้าดึงมาแล้วค่อยกรอง
    // ยางที่ถึงเกณฑ์แต่อยู่นอก limit จะหายเงียบ
    company
      ? getLifetimeAlerts(supabase, company, DASHBOARD_LIFETIME_ITEMS)
      : Promise.resolve({ items: [], total: 0 }),
    company
      ? getLifetimeSoonAlerts(supabase, company, LIFETIME_SOON_DAYS, DASHBOARD_LIFETIME_ITEMS)
      : Promise.resolve([]),
  ])

  const tires = (tireRows ?? []) as TireOverview[]
  const alertKm = company?.alert_km ?? 10000
  const alertTread = company?.alert_tread_mm ?? 3
  const changeCount = company?.alert_change_count ?? 3
  const changeDays = company?.alert_change_days ?? 90
  /** null = บริษัทยังไม่ได้เปิดใช้การเตือนระยะสะสม */
  const alertLifetimeKm = company?.alert_lifetime_km ?? null

  const mounted = tires.filter((t) => t.status === 'mounted')
  const inStock = tires.filter((t) => t.status === 'in_stock')
  const scrapped = tires.filter((t) => t.status === 'scrapped')

  // ยางที่ถึงเกณฑ์แจ้งเตือน: ดอกยางต่ำมาก่อน (อันตราย) แล้วค่อยเรียงตามระยะรอบนี้
  const alerts = mounted
    .map((t) => ({ tire: t, level: alertLevel(true, t.current_run_km, alertKm, t.tread_mm, alertTread) }))
    .filter((a) => a.level !== 'none')
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === 'danger' ? -1 : 1
      return b.tire.current_run_km - a.tire.current_run_km
    })
  const dangerCount = alerts.filter((a) => a.level === 'danger').length
  const warnCount = alerts.length - dangerCount

  const totalKm = tires.reduce((sum, t) => sum + t.lifetime_km, 0)

  const chartEvents = chartEventRows ?? []
  const chartSeries = buildEventSeries(chartEvents, range)
  const mountCount = chartEvents.filter((e) => e.event_type === 'mount').length
  const unmountCount = chartEvents.length - mountCount
  const rangeLabel = dateRangeLabel(range, (iso) => formatThaiDate(iso))
  const chartTitle = hasRange ? `การถอด-ใส่ยาง ${rangeLabel}` : 'การถอด-ใส่ยางทั้งหมด'

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

  // ส่งเฉพาะฟิลด์ที่ตารางใช้ ให้ payload ฝั่ง client ไม่บวมตามจำนวนยาง
  const topMileageRows: TopMileageRow[] = tires.map((t) => ({
    id: t.id,
    serialNo: t.serial_no,
    imageUrl: t.image_url,
    brandName: t.brand_name,
    modelName: t.model_name,
    size: t.size,
    status: t.status,
    plateNo: t.plate_no,
    positionCode: t.position_code,
    lifetimeKm: t.lifetime_km,
  }))

  return (
    <>
      <PageHeader
        title="ภาพรวมการใช้งานยาง"
        subtitle={company?.name ?? undefined}
        action={
          <Link
            href="/tires"
            className="inline-flex min-h-13 items-center gap-2 rounded-xl border-2 border-brand-600 bg-white px-5 text-base font-semibold text-brand-700 hover:bg-brand-50"
          >
            ดูคลังยางทั้งหมด
            <ArrowRight className="size-5" />
          </Link>
        }
      />

      {/* กรองช่วงวันที่ (between) — มีผลกับกราฟถอด-ใส่ และรายงานสาเหตุการถอด; ตัวเลขสถานะปัจจุบันไม่เปลี่ยน */}
      <DashboardDateFilter />

      {/* คำอธิบายสี */}
{/*       <ul className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-ink-700" aria-label="ความหมายของสี">
        {COLOR_LEGEND.map((c) => (
          <li key={c.label} className="inline-flex items-center gap-2">
            <span className={cn('size-3.5 rounded', c.className)} aria-hidden />
            {c.label}
          </li>
        ))}
      </ul> */}

      {/* ต้องทำวันนี้ */}
      <section className="grid gap-4 md:grid-cols-2" aria-label="สิ่งที่ต้องทำวันนี้">
        <TodayCard
          href="#alerts"
          count={alerts.length}
          unit="เส้น"
          title="ยางต้องตรวจ"
          okTitle="ยางทุกเส้นยังไม่ถึงเกณฑ์เตือน"
          detail={
            alerts.length > 0
              ? `ดอกยางต่ำ ${formatNumber(dangerCount)} เส้น · วิ่งเกิน ${formatNumber(alertKm)} กม. ${formatNumber(warnCount)} เส้น`
              : `เกณฑ์: วิ่งเกิน ${formatNumber(alertKm)} กม. หรือดอกยางเหลือไม่เกิน ${alertTread} มม.`
          }
          icon={<AlertTriangle />}
        />
        <TodayCard
          href="#vehicles"
          count={vehicleAlerts.length}
          unit="คัน"
          title="เปลี่ยนยางบ่อยผิดปกติ"
          okTitle="ไม่มีรถที่เปลี่ยนยางถี่ผิดปกติ"
          detail={`ถอดยางตั้งแต่ ${formatNumber(changeCount)} ครั้งขึ้นไป ใน ${formatNumber(changeDays)} วัน`}
          icon={<Repeat />}
        />
      </section>

      {/* ตัวเลขสรุป */}
      <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="ตัวเลขสรุป">
        <KpiCard label="ยางทั้งหมด" value={formatNumber(tires.length)} unit="เส้น" icon={<CircleDot />} />
        <KpiCard label="ใช้งานอยู่บนรถ" value={formatNumber(mounted.length)} unit="เส้น" tone="good" icon={<Truck />} />
        <KpiCard label="อยู่ในคลัง" value={formatNumber(inStock.length)} unit="เส้น" tone="info" icon={<Package />} />
        <KpiCard
          label="ถึงเกณฑ์เตือนเปลี่ยนยาง"
          value={formatNumber(alerts.length)}
          unit="เส้น"
          tone={alerts.length > 0 ? 'bad' : 'good'}
          icon={<AlertTriangle />}
        />
        {alertLifetimeKm !== null && (
          <KpiCard
            label="ครบระยะสะสม"
            value={formatNumber(lifetimeReached.total)}
            unit="เส้น"
            tone={lifetimeReached.total > 0 ? 'bad' : 'good'}
            icon={<Gauge />}
          />
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={<span className="text-lg">{chartTitle}</span>}
            description={
              <span className="text-[15px] text-ink-700">
                ใส่ยาง {formatNumber(mountCount)} ครั้ง · ถอดยาง {formatNumber(unmountCount)} ครั้ง
                {' · '}ระยะสะสมทั้งหมด {formatKm(totalKm)} · รถที่ใช้งาน {formatNumber(vehicleCount ?? 0)} คัน
              </span>
            }
          />
          <CardBody>
            <DashboardMonthlyChart data={chartSeries} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={<span className="text-lg">สถานะยาง</span>}
            description={<span className="text-[15px] text-ink-700">สัดส่วนยางทั้งหมด {formatNumber(tires.length)} เส้น</span>}
          />
          <CardBody>
            <DashboardStatusDonut
              data={[
                { key: 'mounted', name: 'ใช้งานอยู่', value: mounted.length },
                { key: 'inStock', name: 'อยู่ในคลัง', value: inStock.length },
                { key: 'scrapped', name: 'ตัดจำหน่าย', value: scrapped.length },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      {/* แจ้งเตือน */}
      <Card className="mt-4 scroll-mt-24" id="alerts">
        <CardHeader
          title={<span className="text-lg">ยางที่ถึงเกณฑ์แจ้งเตือน</span>}
          description={<span className="text-[15px] text-ink-700">วิ่งเกิน {formatNumber(alertKm)} กม. ในรอบปัจจุบัน หรือดอกยางเหลือไม่เกิน {alertTread} มม.</span>}
          action={
            <StatusChip tone={alerts.length ? 'bad' : 'good'} icon={alerts.length ? <AlertTriangle /> : <Check strokeWidth={3} />} className="rounded-full px-3.5 py-1.5 text-base">
              {formatNumber(alerts.length)} เส้น
            </StatusChip>
          }
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
                  <Th className={TH_LG}>สถานะ</Th>
                  <Th className={TH_LG}>เลขยาง</Th>
                  <Th className={TH_LG}>ทะเบียนรถ</Th>
                  <Th className={cn(TH_LG, 'hidden md:table-cell')}>ตำแหน่ง</Th>
                  <Th className={cn(TH_LG, 'text-right')}>ระยะรอบนี้</Th>
                  <Th className={cn(TH_LG, 'hidden text-right lg:table-cell')}>ระยะสะสม</Th>
                  <Th className={cn(TH_LG, 'hidden sm:table-cell')}>ดอกยางเหลือ</Th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 10).map(({ tire: t, level }) => {
                  const pct = treadPercent(t.tread_mm, t.new_tread_mm)
                  const isDanger = level === 'danger'
                  return (
                    <tr key={t.id} className={ALERT_ROW[level]}>
                      <Td className={TD_LG}>
                        {isDanger
                          ? <StatusChip tone="bad" icon={<Ban />}>ดอกยางต่ำ</StatusChip>
                          : <StatusChip tone="warn" icon={<AlertTriangle />}>วิ่งเกินระยะ</StatusChip>}
                      </Td>
                      <Td className={TD_LG}>
                        <div className="flex items-center gap-3">
                          <TireThumb
                            src={t.image_url}
                            alt={[t.brand_name, t.model_name].filter(Boolean).join(' ')}
                            size="md"
                            className="hidden sm:flex"
                          />
                          <span className="min-w-0">
                            <Link href={`/tires/${t.id}`} className="text-base font-bold text-brand-700 underline underline-offset-4 hover:text-brand-800">
                              {t.serial_no}
                            </Link>
                            <TireSpec size={t.size} brandName={t.brand_name} modelName={t.model_name} className="mt-0.5" />
                          </span>
                        </div>
                      </Td>
                      <Td className={cn(TD_LG, 'text-lg font-bold text-ink-900')}>{t.plate_no ?? '-'}</Td>
                      <Td className={cn(TD_LG, 'hidden md:table-cell')}>{positionLabel(t.position_code)}</Td>
                      <Td className={cn(TD_LG, 'text-right font-semibold', !isDanger && 'text-lg font-bold text-orange-700')}>
                        {formatKm(t.current_run_km)}
                      </Td>
                      <Td className={cn(TD_LG, 'hidden text-right lg:table-cell')}>{formatKm(t.lifetime_km)}</Td>
                      <Td className={cn(TD_LG, 'hidden sm:table-cell', isDanger && 'text-lg font-bold text-rose-700')}>
                        {t.tread_mm !== null ? `${t.tread_mm} มม.${pct !== null ? ` (${pct}%)` : ''}` : '-'}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
        {alerts.length > 10 && (
          <p className="border-t border-line px-5 py-3 text-[15px] text-ink-700">
            แสดง 10 จาก {formatNumber(alerts.length)} เส้น · ดูทั้งหมดได้ที่หน้า{' '}
            <Link href="/tires" className="font-semibold text-brand-700 underline underline-offset-4">คลังยาง</Link>
          </p>
        )}
      </Card>

      {/* ยางครบระยะสะสมตลอดอายุ — ซ่อนทั้งการ์ดถ้าบริษัทยังไม่ได้เปิดใช้เกณฑ์นี้ */}
      {alertLifetimeKm !== null && (
        <LifetimeAlertCard
          reached={lifetimeReached.items}
          soon={lifetimeSoon}
          threshold={alertLifetimeKm}
          soonDays={LIFETIME_SOON_DAYS}
          reachedTotal={lifetimeReached.total}
        />
      )}

      {/* รถเปลี่ยนยางบ่อย — โชว์ทะเบียนรถให้เห็นชัด */}
      <Card className="mt-4 scroll-mt-24" id="vehicles">
        <CardHeader
          title={<span className="text-lg">รถที่เปลี่ยนยางบ่อย</span>}
          description={<span className="text-[15px] text-ink-700">ถอดยางตั้งแต่ {formatNumber(changeCount)} ครั้งขึ้นไป ภายใน {formatNumber(changeDays)} วันล่าสุด (ตั้งค่าได้ที่หน้าข้อมูลบริษัท)</span>}
          action={
            <StatusChip tone={vehicleAlerts.length ? 'bad' : 'good'} icon={vehicleAlerts.length ? <Repeat /> : <Check strokeWidth={3} />} className="rounded-full px-3.5 py-1.5 text-base">
              {formatNumber(vehicleAlerts.length)} คัน
            </StatusChip>
          }
        />
        {vehicleAlerts.length === 0 ? (
          <EmptyState
            icon={<Repeat className="size-6" />}
            title="ยังไม่มีรถที่เปลี่ยนยางถี่ผิดปกติ"
            description="ระบบจะแจ้งเตือนเมื่อรถคันใดถอดยางถึงเกณฑ์ที่ตั้งไว้"
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th className={TH_LG}>ทะเบียนรถ</Th>
                  <Th className={cn(TH_LG, 'hidden sm:table-cell')}>จังหวัด</Th>
                  <Th className={cn(TH_LG, 'text-right')}>ถอดยาง (ครั้ง)</Th>
                  <Th className={cn(TH_LG, 'hidden md:table-cell')}>ถอดล่าสุด</Th>
                  <Th className={cn(TH_LG, 'hidden sm:table-cell')}><span className="sr-only">ดูรายละเอียด</span></Th>
                </tr>
              </thead>
              <tbody>
                {vehicleAlerts.slice(0, 10).map((v) => (
                  <tr key={v.vehicleId} className={ALERT_ROW.danger}>
                    <Td className={TD_LG}>
                      <Link href={`/vehicles/${v.vehicleId}`} className="text-xl font-bold text-ink-900 hover:text-brand-700">
                        {v.plateNo}
                      </Link>
                    </Td>
                    <Td className={cn(TD_LG, 'hidden sm:table-cell')}>{v.province}</Td>
                    <Td className={cn(TD_LG, 'text-right')}>
                      <span className="text-2xl font-bold text-rose-700">{formatNumber(v.changeCount)}</span>
                      <span className="ml-1.5 text-ink-700">ครั้ง</span>
                    </Td>
                    <Td className={cn(TD_LG, 'hidden md:table-cell')}>{formatThaiDate(v.lastEventDate)}</Td>
                    <Td className={cn(TD_LG, 'hidden sm:table-cell text-right')}>
                      <Link
                        href={`/vehicles/${v.vehicleId}`}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 border-brand-600 bg-white px-3.5 text-[15px] font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        ดูประวัติรถ <ArrowRight className="size-4" />
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <RemovalReport
        companyName={company?.name ?? 'Dream Tire'}
        rows={removalRows}
        reasons={removalReasons}
        range={range}
      />

      <TopMileageTable rows={topMileageRows} />

    </>
  )
}
