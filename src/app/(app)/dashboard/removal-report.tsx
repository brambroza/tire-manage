'use client'

import * as React from 'react'
import { CircleDot, FileSpreadsheet, FileText, Filter, Route, TrendingUp } from 'lucide-react'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Select, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { positionLabel } from '@/lib/axle-layouts'
import { TireSpec } from '@/components/tire-spec'
import { formatKm, formatNumber, formatThaiDate } from '@/lib/utils'
import {
  ALL_REASONS,
  UNSPECIFIED_REASON,
  removalReasonKey,
  summarizeRemovalRows,
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
  const [exporting, setExporting] = React.useState<'excel' | 'pdf' | null>(null)
  const [exportError, setExportError] = React.useState<string | null>(null)

  const filteredRows = React.useMemo(
    () => reasonId === ALL_REASONS ? rows : rows.filter((row) => removalReasonKey(row) === reasonId),
    [reasonId, rows],
  )
  const summary = React.useMemo(() => summarizeRemovalRows(filteredRows), [filteredRows])
  const filterLabel = reasonId === ALL_REASONS
    ? 'ทุกสาเหตุ'
    : reasonId === UNSPECIFIED_REASON
      ? 'ไม่ระบุสาเหตุ'
      : reasons.find((reason) => reason.id === reasonId)?.name ?? 'ทุกสาเหตุ'
  const hasUnspecifiedReason = rows.some((row) => row.reasonId === null)

  async function handleExport(format: 'excel' | 'pdf') {
    setExporting(format)
    setExportError(null)

    try {
      const exporter = await import('./removal-report-export')
      const input = { companyName, filterLabel, rows: filteredRows }
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <Field label="กรองตามสาเหตุ" className="w-full lg:max-w-sm">
            <Select value={reasonId} onChange={(event) => setReasonId(event.target.value)}>
              <option value={ALL_REASONS}>ทุกสาเหตุ</option>
              {reasons.map((reason) => (
                <option key={reason.id} value={reason.id}>{reason.name}</option>
              ))}
              {hasUnspecifiedReason ? <option value={UNSPECIFIED_REASON}>ไม่ระบุสาเหตุ</option> : null}
            </Select>
          </Field>

          <div className="flex flex-wrap gap-2 lg:ml-auto">
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
          title="ไม่พบประวัติที่ตรงกับสาเหตุนี้"
          description="ลองเลือกสาเหตุอื่น หรือเลือกทุกสาเหตุ"
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
