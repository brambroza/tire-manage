'use client'

import * as React from 'react'
import { CalendarDays, CircleDot, FileSpreadsheet, FileText, Filter, Route, TrendingUp } from 'lucide-react'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { positionLabel } from '@/lib/axle-layouts'
import { TireSpec } from '@/components/tire-spec'
import { cn, formatKm, formatNumber, formatThaiDate, todayISO } from '@/lib/utils'
import {
  ALL_REASONS,
  UNSPECIFIED_REASON,
  dateRangeLabel,
  isWithinDateRange,
  removalReasonKey,
  summarizeRemovalRows,
  type DateRange,
  type RemovalReasonOption,
  type RemovalReportRow,
} from './removal-report-types'

/**
 * วันที่ย้อนหลังจากวันนี้ตามจำนวนเดือน (YYYY-MM-DD) — ใช้กับปุ่มลัดช่วงเวลา
 * @param months จำนวนเดือนที่ย้อนกลับ (0 = วันที่ 1 ของเดือนนี้)
 */
function monthsAgoISO(months: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (months === 0) {
    d.setDate(1)
  } else {
    d.setMonth(d.getMonth() - months)
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const EMPTY_RANGE: DateRange = { from: '', to: '' }

/** ปุ่มลัดช่วงเวลา: เดือนนี้ / 3 เดือน / 6 เดือน / ทั้งหมด */
const RANGE_PRESETS: Array<{ key: string; label: string; range: () => DateRange }> = [
  { key: 'month', label: 'เดือนนี้', range: () => ({ from: monthsAgoISO(0), to: todayISO() }) },
  { key: '3m', label: '3 เดือน', range: () => ({ from: monthsAgoISO(3), to: todayISO() }) },
  { key: '6m', label: '6 เดือน', range: () => ({ from: monthsAgoISO(6), to: todayISO() }) },
  { key: 'all', label: 'ทั้งหมด', range: () => EMPTY_RANGE },
]

function SummaryItem({
  label,
  value,
  unit,
  icon,
}: {
  label: string
  value: string
  unit?: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-brand-50/70 p-4 ring-1 ring-inset ring-brand-100">
      <div className="flex items-center justify-between gap-3 text-sm text-ink-500">
        <span>{label}</span>
        <span className="text-brand-600">{icon}</span>
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-ink-900">{value}</span>
        {unit ? <span className="text-xs text-ink-400">{unit}</span> : null}
      </p>
    </div>
  )
}

/** รายงานสาเหตุการถอด/เปลี่ยนยาง พร้อมตัวกรองและไฟล์ส่งออก */
export function RemovalReport({
  companyName,
  rows,
  reasons,
}: {
  companyName: string
  rows: RemovalReportRow[]
  reasons: RemovalReasonOption[]
}) {
  const [reasonId, setReasonId] = React.useState(ALL_REASONS)
  const [range, setRange] = React.useState<DateRange>(EMPTY_RANGE)
  const [exporting, setExporting] = React.useState<'excel' | 'pdf' | null>(null)
  const [exportError, setExportError] = React.useState<string | null>(null)

  const filteredRows = React.useMemo(
    () =>
      rows.filter(
        (row) =>
          (reasonId === ALL_REASONS || removalReasonKey(row) === reasonId) &&
          isWithinDateRange(row.eventDate, range),
      ),
    [reasonId, range, rows],
  )
  const summary = React.useMemo(() => summarizeRemovalRows(filteredRows), [filteredRows])
  const reasonLabel = reasonId === ALL_REASONS
    ? 'ทุกสาเหตุ'
    : reasonId === UNSPECIFIED_REASON
      ? 'ไม่ระบุสาเหตุ'
      : reasons.find((reason) => reason.id === reasonId)?.name ?? 'ทุกสาเหตุ'
  const rangeLabel = dateRangeLabel(range, (iso) => formatThaiDate(iso))
  const filterLabel = `${reasonLabel} · ${rangeLabel}`
  const hasUnspecifiedReason = rows.some((row) => row.reasonId === null)
  const rangeInvalid = range.from !== '' && range.to !== '' && range.from > range.to

  /** preset ที่ตรงกับช่วงปัจจุบัน (ใช้ไฮไลต์ปุ่มลัด) */
  const activePreset = RANGE_PRESETS.find((p) => {
    const r = p.range()
    return r.from === range.from && r.to === range.to
  })?.key

  async function handleExport(format: 'excel' | 'pdf') {
    setExporting(format)
    setExportError(null)

    try {
      const exporter = await import('./removal-report-export')
      const input = { companyName, filterLabel, range, rows: filteredRows }
      if (format === 'excel') await exporter.exportRemovalReportExcel(input)
      else await exporter.exportRemovalReportPdf(input)
    } catch (error) {
      console.error(error)
      setExportError('สร้างไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setExporting(null)
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader
        title="สรุปสาเหตุการถอดและเปลี่ยนยาง"
        description={`วิเคราะห์จากประวัติ ${formatNumber(rows.length)} รายการล่าสุดในระบบ`}
      />

      <CardBody className="space-y-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <Field label="กรองตามสาเหตุ" className="w-full xl:max-w-xs">
            <Select value={reasonId} onChange={(event) => setReasonId(event.target.value)}>
              <option value={ALL_REASONS}>ทุกสาเหตุ</option>
              {reasons.map((reason) => (
                <option key={reason.id} value={reason.id}>{reason.name}</option>
              ))}
              {hasUnspecifiedReason ? <option value={UNSPECIFIED_REASON}>ไม่ระบุสาเหตุ</option> : null}
            </Select>
          </Field>

          <Field
            label="ช่วงวันที่ถอด"
            className="w-full xl:max-w-md"
            error={rangeInvalid ? 'วันเริ่มต้นต้องไม่เกินวันสิ้นสุด' : undefined}
          >
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={range.from}
                max={range.to || undefined}
                onChange={(event) => setRange((r) => ({ ...r, from: event.target.value }))}
                aria-label="วันเริ่มต้น"
              />
              <span className="text-ink-400">–</span>
              <Input
                type="date"
                value={range.to}
                min={range.from || undefined}
                onChange={(event) => setRange((r) => ({ ...r, to: event.target.value }))}
                aria-label="วันสิ้นสุด"
              />
            </div>
          </Field>

          <div className="flex flex-wrap gap-1.5 rounded-xl bg-brand-50 p-1 self-start xl:self-auto">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setRange(preset.range())}
                className={cn(
                  'tap-target rounded-lg px-3 text-sm font-medium transition-colors',
                  activePreset === preset.key
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-ink-500 hover:text-ink-700',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 xl:ml-auto">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={exporting === 'excel'}
              disabled={filteredRows.length === 0 || exporting !== null}
              onClick={() => handleExport('excel')}
            >
              <FileSpreadsheet className="size-4" />
              Export Excel
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={exporting === 'pdf'}
              disabled={filteredRows.length === 0 || exporting !== null}
              onClick={() => handleExport('pdf')}
            >
              <FileText className="size-4" />
              Export PDF
            </Button>
          </div>
        </div>

        {exportError ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            {exportError}
          </p>
        ) : null}

        <p className="inline-flex items-center gap-1.5 text-sm text-ink-500">
          <CalendarDays className="size-4 text-brand-600" />
          กำลังแสดง: {reasonLabel} · {rangeLabel} · {formatNumber(filteredRows.length)} รายการ
        </p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryItem
            label="จำนวนครั้งที่ถอด"
            value={formatNumber(summary.totalEvents)}
            unit="ครั้ง"
            icon={<Filter className="size-4" />}
          />
          <SummaryItem
            label="จำนวนยางไม่ซ้ำ"
            value={formatNumber(summary.uniqueTires)}
            unit="เส้น"
            icon={<CircleDot className="size-4" />}
          />
          <SummaryItem
            label="ระยะรวมก่อนถอด"
            value={formatNumber(summary.totalDistanceKm)}
            unit="กม."
            icon={<Route className="size-4" />}
          />
          <SummaryItem
            label="ระยะเฉลี่ยต่อครั้ง"
            value={summary.averageDistanceKm === null ? '-' : formatNumber(summary.averageDistanceKm)}
            unit="กม."
            icon={<TrendingUp className="size-4" />}
          />
        </div>

        {summary.reasons.length > 0 ? (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink-800">สัดส่วนตามสาเหตุ</h3>
              {summary.topReason ? (
                <Badge tone="brand">มากที่สุด: {summary.topReason.name} · {formatNumber(summary.topReason.count)} ครั้ง</Badge>
              ) : null}
            </div>
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
              {summary.reasons.map((reason) => (
                <div key={reason.key}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-ink-700">{reason.name}</span>
                    <span className="shrink-0 text-ink-500">
                      {formatNumber(reason.count)} ครั้ง · {formatNumber(reason.percentage, 1)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-brand-50">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.max(reason.percentage, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardBody>

      {filteredRows.length === 0 ? (
        <EmptyState
          icon={<Filter className="size-6" />}
          title="ไม่พบประวัติที่ตรงกับตัวกรอง"
          description="ลองเลือกสาเหตุอื่น หรือขยายช่วงวันที่"
        />
      ) : (
        <>
          <div className="border-y border-line bg-brand-50/30 px-5 py-3 text-sm text-ink-500">
            แสดง 10 รายการล่าสุดจาก {formatNumber(filteredRows.length)} รายการ · ไฟล์ส่งออกจะมีข้อมูลตามตัวกรองทั้งหมด
          </div>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>วันที่</Th>
                  <Th>เลขยาง</Th>
                  <Th className="hidden sm:table-cell">ถอดจากรถ</Th>
                  <Th className="hidden md:table-cell">ตำแหน่ง</Th>
                  <Th className="text-right">ระยะรอบนี้</Th>
                  <Th>สาเหตุ</Th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 10).map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-brand-50/40">
                    <Td className="whitespace-nowrap">{formatThaiDate(row.eventDate)}</Td>
                    <Td>
                      <span className="font-medium text-ink-900">{row.serialNo}</span>
                      <TireSpec
                        size={row.size}
                        brandName={row.brandName}
                        modelName={row.modelName}
                        className="mt-1"
                      />
                    </Td>
                    <Td className="hidden sm:table-cell">{row.plateNo ?? '-'}</Td>
                    <Td className="hidden md:table-cell">{positionLabel(row.positionCode, row.axleType)}</Td>
                    <Td className="text-right">{formatKm(row.distanceKm)}</Td>
                    <Td><Badge tone="slate">{row.reasonName ?? 'ไม่ระบุสาเหตุ'}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </>
      )}
    </Card>
  )
}
