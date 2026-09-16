'use client'

import * as React from 'react'
import { CalendarDays, CircleDot, Filter, Route, TrendingUp } from 'lucide-react'
import { ExportButtons } from '@/components/export-buttons'
import {
  Badge, Card, CardBody, CardHeader, EmptyState, Field, Select, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { positionLabel } from '@/lib/axle-layouts'
import { TireSpec } from '@/components/tire-spec'
import { cn, formatKm, formatNumber, formatThaiDate } from '@/lib/utils'
import { StatusChip, TD_LG, TH_LG } from './dashboard-ui'
import {
  ALL_REASONS,
  UNSPECIFIED_REASON,
  dateRangeLabel,
  removalReasonKey,
  summarizeRemovalRows,
  type DateRange,
  type RemovalReasonOption,
  type RemovalReportRow,
} from './removal-report-types'

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
    <div className="rounded-xl border border-line bg-surface-alt p-4">
      <div className="flex items-center justify-between gap-3 text-[15px] font-semibold text-ink-700">
        <span>{label}</span>
        <span className="text-brand-700 [&>svg]:size-5">{icon}</span>
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tracking-tight text-ink-900">{value}</span>
        {unit ? <span className="text-[15px] text-ink-500">{unit}</span> : null}
      </p>
    </div>
  )
}

/**
 * รายงานสาเหตุการถอด/เปลี่ยนยาง พร้อมตัวกรองสาเหตุและไฟล์ส่งออก
 * ช่วงวันที่ใช้ตัวกรองระดับหน้า dashboard (server กรอง rows มาให้แล้ว) — รับมาเพื่อแสดงหัวรายงานและตั้งชื่อไฟล์
 * @param range ช่วงวันที่ที่หน้ากรองอยู่ (ว่างทั้งคู่ = ทั้งหมด)
 */
export function RemovalReport({
  companyName,
  rows,
  reasons,
  range,
}: {
  companyName: string
  rows: RemovalReportRow[]
  reasons: RemovalReasonOption[]
  range: DateRange
}) {
  const [reasonId, setReasonId] = React.useState(ALL_REASONS)
  const [exporting, setExporting] = React.useState<'excel' | 'pdf' | null>(null)
  const [exportError, setExportError] = React.useState<string | null>(null)

  const filteredRows = React.useMemo(
    () =>
      rows.filter((row) => reasonId === ALL_REASONS || removalReasonKey(row) === reasonId),
    [reasonId, rows],
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
        title={<span className="text-lg">สรุปสาเหตุการถอดและเปลี่ยนยาง</span>}
        description={<span className="text-[15px] text-ink-700">วิเคราะห์จากประวัติ {formatNumber(rows.length)} รายการ · {rangeLabel} (เปลี่ยนช่วงได้ที่ตัวกรองด้านบน)</span>}
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

          <ExportButtons
            exporting={exporting}
            disabled={filteredRows.length === 0}
            onExport={handleExport}
            className="xl:ml-auto"
          />
        </div>

        {exportError ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            {exportError}
          </p>
        ) : null}

        <p className="inline-flex items-center gap-1.5 text-[15px] text-ink-700">
          <CalendarDays className="size-4.5 text-brand-700" />
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
              <h3 className="text-base font-bold text-ink-900">สัดส่วนตามสาเหตุ</h3>
              {summary.topReason ? (
                <StatusChip tone="brand" icon={<TrendingUp />}>
                  มากที่สุด: {summary.topReason.name} · {formatNumber(summary.topReason.count)} ครั้ง
                </StatusChip>
              ) : null}
            </div>
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
              {summary.reasons.map((reason) => (
                <div key={reason.key}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-base">
                    <span className="truncate font-semibold text-ink-900">{reason.name}</span>
                    <span className="shrink-0 font-bold text-ink-900">
                      {formatNumber(reason.count)} <span className="font-normal text-ink-500">ครั้ง ({formatNumber(reason.percentage, 0)}%)</span>
                    </span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-md border border-line bg-surface-alt">
                    <div
                      className="h-full rounded-md bg-brand-600"
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
          description="ลองเลือกสาเหตุอื่น หรือขยายช่วงวันที่ที่ตัวกรองด้านบนของหน้า"
        />
      ) : (
        <>
          <div className="border-y border-line bg-surface-alt px-5 py-3 text-[15px] text-ink-700">
            แสดง 10 รายการล่าสุดจาก {formatNumber(filteredRows.length)} รายการ · ไฟล์ส่งออกจะมีข้อมูลตามตัวกรองทั้งหมด
          </div>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th className={TH_LG}>วันที่</Th>
                  <Th className={TH_LG}>เลขยาง</Th>
                  <Th className={cn(TH_LG, 'hidden sm:table-cell')}>ถอดจากรถ</Th>
                  <Th className={cn(TH_LG, 'hidden md:table-cell')}>ตำแหน่ง</Th>
                  <Th className={cn(TH_LG, 'text-right')}>ระยะรอบนี้</Th>
                  <Th className={TH_LG}>สาเหตุ</Th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 10).map((row) => (
                  <tr key={row.id} className="transition-colors odd:bg-surface-alt/60 hover:bg-brand-50/60">
                    <Td className={cn(TD_LG, 'whitespace-nowrap')}>{formatThaiDate(row.eventDate)}</Td>
                    <Td className={TD_LG}>
                      <span className="text-base font-bold text-ink-900">{row.serialNo}</span>
                      <TireSpec
                        size={row.size}
                        brandName={row.brandName}
                        modelName={row.modelName}
                        className="mt-1"
                      />
                    </Td>
                    <Td className={cn(TD_LG, 'hidden sm:table-cell text-lg font-bold text-ink-900')}>{row.plateNo ?? '-'}</Td>
                    <Td className={cn(TD_LG, 'hidden md:table-cell')}>{positionLabel(row.positionCode, row.axleType)}</Td>
                    <Td className={cn(TD_LG, 'text-right font-semibold')}>{formatKm(row.distanceKm)}</Td>
                    <Td className={TD_LG}><Badge tone="slate" className="px-3 py-1.5 text-sm">{row.reasonName ?? 'ไม่ระบุสาเหตุ'}</Badge></Td>
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
