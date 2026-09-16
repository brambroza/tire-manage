'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle, CalendarDays, CircleDot, History, Package, Pencil, Plus, Trash2, Truck, Undo2, X,
} from 'lucide-react'
import {
  ALERT_ROW, Card, CardHeader, EmptyState, Field, Input, Select, Table, TableWrap, Td, Th, alertLevel,
} from '@/components/ui'
import { ConfirmDialog } from '@/components/ui/modal'
import { Pagination, SMALL_PAGE_SIZE_OPTIONS, usePagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/search-input'
import { ExportButtons } from '@/components/export-buttons'
import { TireThumb } from '@/components/tire-thumb'
import { TireHistoryModal } from '@/components/history-modal'
import { KpiCard, StatusChip, TH_LG, TIRE_STATUS_CHIP } from '@/app/(app)/dashboard/dashboard-ui'
import { dateRangeLabel } from '@/app/(app)/dashboard/removal-report-types'
import { positionLabel, type AxleTypeLayoutSource } from '@/lib/axle-layouts'
import { tireBrandModelLabel, tireSizeLabel } from '@/lib/tire-display'
import {
  TIRE_STATUS_LABEL, cn, diffDays, formatDuration, formatKm, formatKmApprox, formatNumber,
  formatThaiDate, treadPercent,
} from '@/lib/utils'
import type { LastRemoval } from '@/lib/tire-events'
import { TIRE_DATE_FIELDS, parseTireDateFilter, type TireDateField, type TireStats } from './tire-filters'
import { TireFormModal, type ModelOption } from './tire-form'
import { restoreTire, scrapTire } from './actions'
import type { Tire, TireOverview, TireStatus } from '@/lib/database.types'

const FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'mounted', label: 'อยู่บนรถ' },
  { value: 'in_stock', label: 'อยู่ในคลัง' },
  { value: 'scrapped', label: 'ตัดจำหน่าย' },
  { value: 'alert', label: 'ถึงเกณฑ์เตือน' },
]

/** ข้อความบอกว่ายางที่ไม่ได้อยู่บนรถตอนนี้อยู่ที่ไหน — ตามสถานะจริง ไม่ใช่ "คลังสินค้า" ทุกกรณี */
const LOCATION_LABEL: Record<TireStatus, string> = {
  mounted: 'อยู่บนรถ',
  in_stock: 'คลังสินค้า',
  retreading: 'ส่งหล่อดอก',
  scrapped: 'ตัดจำหน่ายแล้ว',
}

/** เซลล์ตาราง: สูงคงที่ 76px (รูป 56 + padding) จัดกลางแนวตั้ง ตัวเลขเรียงหลักตรงกัน */
const CELL = 'h-[76px] px-3.5 py-3 align-middle text-[15px] text-ink-700 tabular-nums'
/** บรรทัดแรกของเซลล์ = ค่าหลัก ตัดด้วย ellipsis ไม่ขึ้นบรรทัดใหม่ */
const LINE1 = 'block truncate'
/** บรรทัดสองของเซลล์ = บริบท ตัวเล็กสีเทา */
const LINE2 = 'mt-0.5 block truncate text-[13px] text-ink-500'
/** ป้ายเตือนใต้ chip สถานะ: จุดสี + ข้อความสั้น (ไม่ใช้ chip ที่สองเพื่อคุมความสูงแถว) */
const FLAG =
  'mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold before:size-2 before:shrink-0 before:rounded-full before:bg-current'

/** ตารางคลังยาง + ตัวกรองสถานะ/วันที่ + ฟอร์มเพิ่ม/แก้ไข — โทนสีและขนาดตัวอักษรชุดเดียวกับหน้า dashboard */
export function TiresClient({
  tires,
  rawTires,
  models,
  lastRemovals = {},
  canManage,
  canAdd = false,
  companyId,
  basePath = '/tires',
  enableLinks = true,
  enableHistory = false,
  axleTypes,
  companyName = 'Dream Tire',
  stats,
}: {
  tires: TireOverview[]
  /** ข้อมูลดิบสำหรับเปิดฟอร์มแก้ไข */
  rawTires: Record<string, Tire>
  models: ModelOption[]
  /** การถอดครั้งล่าสุดของยางที่ไม่ได้อยู่บนรถ (key = tire id) */
  lastRemovals?: Record<string, LastRemoval>
  /** แก้ไข/ตัดจำหน่ายยางได้ */
  canManage: boolean
  /** เพิ่มยางเข้าคลังได้ — เปิดเฉพาะ super admin (ลูกค้าเพิ่มยางเองไม่ได้ตามที่ตกลง) */
  canAdd?: boolean
  /** ระบุเมื่อ super admin จัดการคลังยางแทนลูกค้า */
  companyId?: string
  /** route ของหน้านี้ ใช้ตอนอัปเดตตัวกรองใน query string */
  basePath?: string
  /** ปิดลิงก์ไปหน้ารายละเอียด (หน้า super admin ยังไม่มี route เหล่านั้น) */
  enableLinks?: boolean
  /** เปิดปุ่มดูประวัติแบบ modal — ใช้กับหน้า super admin ที่ไม่มี route รายละเอียด */
  enableHistory?: boolean
  /** นิยามเพลา ใช้แปลรหัสตำแหน่งล้อในตารางประวัติ */
  axleTypes?: readonly AxleTypeLayoutSource[]
  /** ชื่อบริษัทสำหรับหัวรายงานที่ส่งออก */
  companyName?: string
  /** ตัวเลขสรุปทั้งบริษัท (ไม่ส่ง = ไม่แสดงการ์ด KPI) */
  stats?: TireStats
}) {
  const router = useRouter()
  const params = useSearchParams()
  const status = params.get('status') ?? 'all'
  const searchTerm = params.get('q') ?? ''
  /** ตัวกรองวันที่จาก URL — server กรองให้แล้ว ฝั่งนี้ใช้แสดงค่าในฟอร์มและหัวรายงาน */
  const dateFilter = parseTireDateFilter({
    date_field: params.get('date_field') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  })
  const hasDateFilter = Boolean(dateFilter.range.from || dateFilter.range.to)
  const rangeInvalid =
    dateFilter.range.from !== '' && dateFilter.range.to !== '' && dateFilter.range.from > dateFilter.range.to

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Tire | null>(null)
  const [confirm, setConfirm] = React.useState<TireOverview | null>(null)
  /** ยางที่กำลังเปิดดูประวัติ (null = ปิด modal) */
  const [history, setHistory] = React.useState<TireOverview | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  /** รูปแบบไฟล์ที่กำลังสร้างอยู่ (null = ว่าง) */
  const [exporting, setExporting] = React.useState<'excel' | 'pdf' | null>(null)
  /** แบ่งหน้าฝั่ง client — เริ่มต้น 10 เส้น/หน้า, กลับหน้าแรกเองเมื่อค้นหา/เปลี่ยนตัวกรอง */
  const pagination = usePagination(tires)

  /** อัปเดต query string หลายค่าพร้อมกัน (ค่าว่าง = ลบ param นั้น) */
  function updateParams(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const qs = next.toString()
    router.replace(`${basePath}${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  function setFilter(value: string) {
    updateParams({ status: value === 'all' ? '' : value })
  }

  function setDateField(value: TireDateField) {
    updateParams({ date_field: value === 'created' ? '' : value })
  }

  function setRange(side: 'from' | 'to', value: string) {
    updateParams({ [side]: value })
  }

  function clearDateFilter() {
    updateParams({ from: '', to: '', date_field: '' })
  }

  /** ข้อความตัวกรองที่ใช้อยู่ สำหรับหัวรายงานและบรรทัด "กำลังแสดง" */
  const filterLabel = [
    FILTERS.find((f) => f.value === status)?.label ?? 'ทั้งหมด',
    searchTerm.trim() ? `ค้นหา "${searchTerm.trim()}"` : null,
    hasDateFilter
      ? `${TIRE_DATE_FIELDS.find((f) => f.value === dateFilter.field)?.label} ${dateRangeLabel(dateFilter.range, (iso) => formatThaiDate(iso))}`
      : null,
  ].filter(Boolean).join(' · ')

  /** ส่งออกรายการยางที่ผ่านตัวกรองอยู่เป็น Excel หรือ PDF */
  async function handleExport(format: 'excel' | 'pdf') {
    setExporting(format)
    setMessage(null)
    try {
      const exporter = await import('./tires-export')
      const input = {
        companyName,
        filterLabel,
        range: hasDateFilter ? dateFilter.range : undefined,
        tires,
        rawTires,
        lastRemovals,
      }
      if (format === 'excel') await exporter.exportTiresExcel(input)
      else await exporter.exportTiresPdf(input)
    } catch (error) {
      console.error(error)
      setMessage('สร้างไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setExporting(null)
    }
  }

  async function toggleScrap(t: TireOverview) {
    setBusy(true)
    const result = t.status === 'scrapped' ? await restoreTire(t.id) : await scrapTire(t.id)
    setBusy(false)
    setConfirm(null)
    if (!result.ok) setMessage(result.error)
    else router.refresh()
  }

  return (
    <>
      {/* ตัวเลขสรุป — การ์ดชุดเดียวกับ dashboard */}
     {/*  {stats && (
        <section className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="ตัวเลขสรุปคลังยาง">
          <KpiCard label="ยางทั้งหมด" value={formatNumber(stats.total)} unit="เส้น" icon={<CircleDot />} />
          <KpiCard label="ใช้งานอยู่บนรถ" value={formatNumber(stats.mounted)} unit="เส้น" tone="good" icon={<Truck />} />
          <KpiCard label="อยู่ในคลัง" value={formatNumber(stats.inStock)} unit="เส้น" tone="info" icon={<Package />} />
          <KpiCard
            label="ถึงเกณฑ์เตือนเปลี่ยนยาง"
            value={formatNumber(stats.alert)}
            unit="เส้น"
            tone={stats.alert > 0 ? 'bad' : 'good'}
            icon={<AlertTriangle />}
          />
        </section>
      )} */}

      {/* ตัวกรอง */}
      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <SearchInput placeholder="ค้นหาเลขยาง, ยี่ห้อ, รุ่น, ทะเบียนรถ..." className="lg:max-w-md" />

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  'min-h-12 rounded-xl border-2 px-4 text-base font-semibold transition-colors',
                  status === f.value
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-line bg-white text-ink-900 hover:border-brand-300 hover:bg-brand-50',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <ExportButtons
              exporting={exporting}
              disabled={tires.length === 0}
              onExport={handleExport}
            />
            {canAdd && (
              <button
                type="button"
                onClick={() => { setEditing(null); setFormOpen(true) }}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-brand-600 bg-brand-600 px-4.5 text-[15px] font-semibold text-white hover:bg-brand-700"
              >
                <Plus className="size-5" />
                เพิ่มยาง
              </button>
            )}
          </div>
        </div>

        {/* กรองตามช่วงวันที่ (between) — เลือกได้ว่าใช้วันที่รับเข้าระบบหรือวันที่ติดตั้งล่าสุด */}
        <div className="flex flex-col gap-3 border-t border-line px-4 py-4 xl:flex-row xl:items-end">
          <Field label="กรองตามวันที่" className="w-full xl:max-w-xs">
            <Select
              value={dateFilter.field}
              onChange={(event) => setDateField(event.target.value as TireDateField)}
              aria-label="ฟิลด์วันที่"
            >
              {TIRE_DATE_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="ช่วงวันที่"
            className="w-full xl:max-w-md"
            error={rangeInvalid ? 'วันเริ่มต้นต้องไม่เกินวันสิ้นสุด' : undefined}
          >
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFilter.range.from}
                max={dateFilter.range.to || undefined}
                onChange={(event) => setRange('from', event.target.value)}
                aria-label="วันเริ่มต้น"
              />
              <span className="text-ink-400">–</span>
              <Input
                type="date"
                value={dateFilter.range.to}
                min={dateFilter.range.from || undefined}
                onChange={(event) => setRange('to', event.target.value)}
                aria-label="วันสิ้นสุด"
              />
            </div>
          </Field>

          {hasDateFilter && (
            <button
              type="button"
              onClick={clearDateFilter}
              className="inline-flex min-h-12 items-center gap-1.5 self-start rounded-xl border-2 border-line bg-white px-4 text-[15px] font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50 xl:self-auto"
            >
              <X className="size-4" />
              ล้างวันที่
            </button>
          )}

          <p className="inline-flex items-center gap-1.5 text-[15px] text-ink-700 xl:ml-auto xl:pb-3">
            <CalendarDays className="size-4.5 text-brand-700" />
            กำลังแสดง: {filterLabel} · {formatNumber(tires.length)} เส้น
          </p>
        </div>
      </Card>

      {message && (
        <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[15px] text-rose-700 ring-1 ring-inset ring-rose-200">
          {message}
        </div>
      )}

      <Card>
        <CardHeader
          title={<span className="text-lg">รายการยาง</span>}
          description={<span className="text-[15px] text-ink-700">{filterLabel}</span>}
          action={
            <StatusChip tone="brand" icon={<CircleDot />} className="rounded-full px-3.5 py-1.5 text-base">
              {formatNumber(tires.length)} เส้น
            </StatusChip>
          }
        />
        {tires.length === 0 ? (
          <EmptyState
            icon={<CircleDot className="size-6" />}
            title="ไม่พบยางตามเงื่อนไขที่ค้นหา"
            description="ลองเปลี่ยนคำค้นหา ตัวกรองสถานะ หรือช่วงวันที่"
          />
        ) : (
          <TableWrap>
            {/* table-fixed + ความกว้างคงที่บน th: คอลัมน์ไม่ขยับตามเนื้อหา ทุกเซลล์จำกัด 2 บรรทัด แถวสูงเท่ากัน */}
            <Table className="min-w-[900px] table-fixed">
              <thead>
                <tr>
                  <Th className={cn(TH_LG, 'w-[280px]')}>ยาง</Th>
                  <Th className={cn(TH_LG, 'w-[150px]')}>สถานะ</Th>
                  <Th className={cn(TH_LG, 'w-[230px]')}>ตำแหน่ง / ที่มา</Th>
                  <Th className={cn(TH_LG, 'hidden w-[200px] xl:table-cell')}>สาเหตุที่ถอด</Th>
                  <Th className={cn(TH_LG, 'hidden w-[110px] text-right lg:table-cell')}>ดอกยาง</Th>
                  <Th className={cn(TH_LG, 'hidden w-[120px] text-right xl:table-cell')}>ระยะรอบนี้</Th>
                  <Th className={cn(TH_LG, 'hidden w-[110px] text-right xl:table-cell')}>ใช้งาน</Th>
                  <Th className={cn(TH_LG, 'w-[130px] text-right')}>ระยะสะสม</Th>
                  {canManage && <Th className={cn(TH_LG, 'w-[120px] text-right')}>จัดการ</Th>}
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((t) => {
                  const pct = treadPercent(t.tread_mm, t.new_tread_mm)
                  const runAlert = t.status === 'mounted' && t.current_run_km >= t.alert_km
                  const treadAlert = t.tread_mm !== null && t.tread_mm <= t.alert_tread_mm
                  // ครบระยะสะสมตลอดอายุยาง — คนละเกณฑ์กับ alert_km ที่นับเฉพาะรอบปัจจุบัน
                  const lifetimeReached =
                    t.alert_lifetime_km !== null &&
                    t.status !== 'scrapped' &&
                    t.estimated_lifetime_km >= t.alert_lifetime_km
                  const level = alertLevel(
                    t.status === 'mounted', t.current_run_km, t.alert_km, t.tread_mm, t.alert_tread_mm,
                  )
                  const chip = TIRE_STATUS_CHIP[t.status as TireStatus]
                  // ยางในคลัง/ตัดจำหน่าย: บอกที่มาว่าถอดจากรถคันไหน ที่เลขไมล์เท่าไร
                  const removal = t.status !== 'mounted' ? lastRemovals[t.id] : undefined
                  // ระยะเวลาใช้งาน: มีเลขไมล์หรือไม่ก็นับได้ — mounted นับถึงวันนี้, ถอดแล้วนับถึงวันที่ถอด
                  const usageDays = t.status === 'mounted' && t.mounted_at
                    ? diffDays(t.mounted_at, new Date().toISOString())
                    : removal?.mounted_at
                      ? diffDays(removal.mounted_at, removal.event_date)
                      : null
                  const specLine = [
                    `${tireSizeLabel(t.size)} - ${tireSizeLabel(t.model_name, 'ไม่ระบุรุ่น')}`,
                    tireBrandModelLabel(t.brand_name, '', ''),
                    t.dot ? `DOT ${t.dot}` : '',
                  ].filter(Boolean).join(' · ')
                  const removedPlate = removal?.plate_no ?? 'รถที่ถูกลบแล้ว'
                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        level === 'none' ? 'transition-colors odd:bg-surface-alt/60 hover:bg-brand-50/60' : ALERT_ROW[level],
                        t.status === 'scrapped' && 'opacity-70',
                      )}
                    >
                      {/* ยาง: รูป + เลขยาง + สเปกบรรทัดเดียว */}
                      <Td className={CELL}>
                        <div className="flex min-w-0 items-center gap-3">
                          <TireThumb
                            src={t.image_url}
                            alt={[t.model_name, t.brand_name].filter(Boolean).join(' ')}
                            size="md"
                          />
                          <span className="min-w-0">
                            <span className={LINE1}>
                              {enableLinks ? (
                                <Link
                                  href={`/tires/${t.id}`}
                                  className="text-base font-bold text-brand-700 underline underline-offset-4 hover:text-brand-800"
                                >
                                  {t.serial_no}
                                </Link>
                              ) : enableHistory ? (
                                <button
                                  type="button"
                                  onClick={() => setHistory(t)}
                                  className="text-base font-bold text-brand-700 underline decoration-dotted underline-offset-4 hover:text-brand-800"
                                >
                                  {t.serial_no}
                                </button>
                              ) : (
                                <span className="text-base font-bold text-ink-900">{t.serial_no}</span>
                              )}
                            </span>
                            <span className={LINE2} title={specLine}>{specLine}</span>
                          </span>
                        </div>
                      </Td>

                      {/* สถานะ: chip เดียว + จุดสีบอกระดับเตือน */}
                      <Td className={CELL}>
                        <StatusChip tone={chip.tone} icon={chip.icon}>
                          {TIRE_STATUS_LABEL[t.status as TireStatus]}
                        </StatusChip>
                        {level === 'danger' && <span className={cn(FLAG, 'text-rose-700')}>ดอกยางต่ำ</span>}
                        {level === 'warn' && <span className={cn(FLAG, 'text-orange-700')}>วิ่งเกินระยะ</span>}
                      </Td>

                      {/* ตำแหน่ง / ที่มา: 2 บรรทัดเสมอ */}
                      <Td className={CELL}>
                        {t.status === 'mounted' ? (
                          <>
                            <span className={LINE1}>
                              {enableLinks ? (
                                <Link href={`/vehicles/${t.vehicle_id}`} className="text-[17px] font-bold text-ink-900 hover:text-brand-700">
                                  {t.plate_no}
                                </Link>
                              ) : (
                                <span className="text-[17px] font-bold text-ink-900">{t.plate_no}</span>
                              )}
                              <span className="text-ink-500"> · {positionLabel(t.position_code)}</span>
                            </span>
                            <span className={LINE2}>
                              {t.mounted_at ? `ติดตั้ง ${formatThaiDate(t.mounted_at)}` : LOCATION_LABEL.mounted}
                            </span>
                          </>
                        ) : removal ? (
                          <>
                            <span className={LINE1} title={`${removedPlate}${removal.position_code ? ` · ${positionLabel(removal.position_code)}` : ''}`}>
                              <span className="text-ink-500">ถอดจาก </span>
                              {enableLinks && removal.vehicle_id ? (
                                <Link href={`/vehicles/${removal.vehicle_id}`} className="text-[17px] font-bold text-ink-900 hover:text-brand-700">
                                  {removedPlate}
                                </Link>
                              ) : (
                                <span className="text-[17px] font-bold text-ink-900">{removedPlate}</span>
                              )}
                              {removal.position_code && (
                                <span className="text-ink-500"> · {positionLabel(removal.position_code)}</span>
                              )}
                            </span>
                            <span className={LINE2}>
                              ถอด {formatThaiDate(removal.event_date)}
                              {/* จอใหญ่มีคอลัมน์สาเหตุแยก จึงโชว์เลขไมล์; จอเล็กยุบสาเหตุมาไว้ตรงนี้แทน */}
                              <span className="hidden xl:inline"> · ไมล์ {formatKm(removal.odometer)}</span>
                              <span className="xl:hidden">
                                {' · '}
                                {removal.reason
                                  ? <span className="font-semibold text-ink-700">{removal.reason}</span>
                                  : <span className="italic text-ink-400">ไม่ระบุสาเหตุ</span>}
                              </span>
                            </span>
                          </>
                        ) : (
                          <>
                            <span className={cn(LINE1, 'font-bold text-ink-900')}>{LOCATION_LABEL[t.status as TireStatus]}</span>
                            <span className={LINE2}>ยังไม่มีประวัติการถอด</span>
                          </>
                        )}
                      </Td>

                      {/* สาเหตุที่ถอด: คอลัมน์แยก ยางบนรถแสดง — */}
                      <Td className={cn(CELL, 'hidden xl:table-cell')}>
                        {t.status === 'mounted' || !removal ? (
                          <span className="text-ink-400">—</span>
                        ) : removal.reason ? (
                          <>
                            <span className={cn(LINE1, 'font-bold text-ink-900')} title={removal.reason}>{removal.reason}</span>
                            {removal.note && <span className={LINE2} title={removal.note}>{removal.note}</span>}
                          </>
                        ) : (
                          <span className={cn(LINE1, 'italic text-ink-400')}>ไม่ระบุสาเหตุ</span>
                        )}
                      </Td>

                      {/* ดอกยาง: มม. บรรทัด 1, % บรรทัด 2 */}
                      <Td className={cn(CELL, 'hidden text-right lg:table-cell')}>
                        {t.tread_mm !== null ? (
                          <>
                            <span className={cn(LINE1, 'text-[17px] font-bold', treadAlert ? 'text-rose-700' : 'text-ink-900')}>
                              {formatNumber(t.tread_mm, 1)} มม.
                            </span>
                            {pct !== null && <span className={LINE2}>({pct}%)</span>}
                          </>
                        ) : (
                          <span className="text-ink-400">-</span>
                        )}
                      </Td>

                      {/* ระยะรอบนี้: รอบปัจจุบัน หรือรอบที่ถอดออก */}
                      <Td className={cn(CELL, 'hidden text-right xl:table-cell')}>
                        {t.status === 'mounted' ? (
                          <span className={cn(runAlert && 'text-[17px] font-bold text-orange-700')}>
                            {formatKm(t.current_run_km)}
                          </span>
                        ) : removal?.distance_km !== null && removal?.distance_km !== undefined ? (
                          <span className="text-ink-500">{formatKm(removal.distance_km)}</span>
                        ) : (
                          <span className="text-ink-400">-</span>
                        )}
                      </Td>

                      <Td className={cn(CELL, 'hidden text-right xl:table-cell')}>{formatDuration(usageDays)}</Td>

                      {/* ระยะสะสมใช้ค่าที่รวมการประมาณ เพื่อให้ตรงกับตัวเลขที่ใช้แจ้งเตือน
                          ตัวเลขที่มี ~ คือมีค่าประมาณปนอยู่ ห้ามแสดงปนกับค่าจริงโดยไม่บอก */}
                      <Td
                        className={cn(CELL, 'text-right')}
                        title={t.is_estimated ? 'รวมค่าประมาณจากค่าเฉลี่ยที่รถวิ่งต่อเดือน' : undefined}
                      >
                        <span className={cn(LINE1, 'text-[17px] font-bold', lifetimeReached ? 'text-rose-700' : 'text-ink-900')}>
                          {formatKmApprox(t.estimated_lifetime_km, t.is_estimated)}
                        </span>
                        {t.is_estimated && <span className={LINE2}>รวมประมาณการ</span>}
                      </Td>

                      {canManage && (
                        <Td className={CELL}>
                          <div className="flex items-center justify-end gap-0.5">
                            {enableHistory && (
                              <button
                                type="button"
                                onClick={() => setHistory(t)}
                                aria-label="ดูประวัติ"
                                className="flex size-10 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                              >
                                <History className="size-5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setEditing(rawTires[t.id] ?? null); setFormOpen(true) }}
                              aria-label="แก้ไข"
                              className="flex size-10 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                            >
                              <Pencil className="size-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirm(t)}
                              aria-label={t.status === 'scrapped' ? 'นำกลับเข้าคลัง' : 'ตัดจำหน่าย'}
                              className="flex size-10 items-center justify-center rounded-lg text-ink-500 hover:bg-rose-50 hover:text-rose-600"
                            >
                              {t.status === 'scrapped'
                                ? <Undo2 className="size-5" />
                                : <Trash2 className="size-5" />}
                            </button>
                          </div>
                        </Td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            <Pagination state={pagination} itemLabel="เส้น" sizeOptions={SMALL_PAGE_SIZE_OPTIONS} />
          </TableWrap>
        )}
      </Card>

      <TireFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        tire={editing}
        models={models}
        companyId={companyId}
      />

      <TireHistoryModal
        tireId={history?.id ?? null}
        serialNo={history?.serial_no ?? ''}
        subtitle={[history?.size, history?.brand_name, history?.model_name]
          .filter(Boolean)
          .join(' · ') || undefined}
        axleTypes={axleTypes}
        onClose={() => setHistory(null)}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && toggleScrap(confirm)}
        loading={busy}
        title={confirm?.status === 'scrapped' ? 'นำยางกลับเข้าคลัง?' : 'ตัดจำหน่ายยางเส้นนี้?'}
        confirmLabel={confirm?.status === 'scrapped' ? 'นำกลับเข้าคลัง' : 'ตัดจำหน่าย'}
        message={
          confirm?.status === 'scrapped'
            ? `ยาง ${confirm?.serial_no} จะกลับมาใช้งานได้อีกครั้ง`
            : `ยาง ${confirm?.serial_no} จะถูกตัดออกจากคลัง แต่ประวัติการใช้งานทั้งหมดยังคงอยู่`
        }
      />
    </>
  )
}
