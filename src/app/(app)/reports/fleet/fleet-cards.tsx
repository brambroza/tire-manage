'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Ban, Check, HelpCircle, Truck } from 'lucide-react'
import { ExportButtons } from '@/components/export-buttons'
import { Card, CardBody, CardHeader, EmptyState, Table, TableWrap, Td, Th } from '@/components/ui'
import { TireSpec } from '@/components/tire-spec'
import { cn, formatKm, formatNumber, formatThaiDate, treadPercent } from '@/lib/utils'
import { StatusChip, TD_LG, TH_LG } from '../../dashboard/dashboard-ui'
import { AxleTypeBarChart } from './fleet-charts'
import {
  CRITICAL_DAYS, NO_BRANCH_LABEL, STALE_DAYS, TREAD_LOW_MM, TREAD_MID_MM,
  type BranchMatrix, type LowTreadSummary, type StaleSummary,
} from './fleet-report'
import type { FleetExportInput, FleetExportSection } from './fleet-report-export'

/** จำนวนแถวสูงสุดในตารางรถที่ไม่ได้ตรวจนาน (ไฟล์ส่งออกมีครบทุกแถว) */
const STALE_TABLE_LIMIT = 50
/** จำนวนแถวสูงสุดในตารางยางดอกต่ำ (ไฟล์ส่งออกมีครบทุกแถว) */
const LOW_TREAD_TABLE_LIMIT = 100

/**
 * สถานะและตัวจัดการปุ่มส่งออกของการ์ด 1 ใบ — โหลดโมดูลส่งออกแบบ lazy เมื่อกดจริง
 * @param section การ์ดที่ส่งออก
 * @param input ข้อมูลรายงานทั้งหมด
 */
function useFleetExport(section: FleetExportSection, input: FleetExportInput) {
  const [exporting, setExporting] = React.useState<'excel' | 'pdf' | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function handleExport(format: 'excel' | 'pdf') {
    setExporting(format)
    setError(null)
    try {
      const exporter = await import('./fleet-report-export')
      if (format === 'excel') await exporter.exportFleetExcel(section, input)
      else await exporter.exportFleetPdf(section, input)
    } catch (err) {
      console.error(err)
      setError('สร้างไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setExporting(null)
    }
  }

  return { exporting, error, handleExport }
}

/** กล่องข้อความเมื่อส่งออกไม่สำเร็จ */
function ExportError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="mx-5 mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
      {message}
    </p>
  )
}

/**
 * การ์ด "จำนวนรถตามสาขาและประเภทรถ" — ตารางสาขา × ประเภทรถ + กราฟแท่งแนวนอนต่อประเภท
 * @param matrix ผลจาก buildBranchMatrix
 * @param perType ผลจาก vehiclesPerAxleType
 * @param exportInput ข้อมูลสำหรับไฟล์ส่งออก
 */
export function BranchMatrixCard({
  matrix,
  perType,
  exportInput,
}: {
  matrix: BranchMatrix
  perType: Array<{ code: string; name: string; count: number }>
  exportInput: FleetExportInput
}) {
  const { exporting, error, handleExport } = useFleetExport('vehicles', exportInput)
  const hasData = matrix.rows.length > 0

  return (
    <Card className="mt-4">
      <CardHeader
        title={<span className="text-lg">จำนวนรถตามสาขาและประเภทรถ</span>}
        description={
          <span className="text-[15px] text-ink-700">
            รถ {formatNumber(matrix.total.total)} คัน · ยางบนรถ {formatNumber(matrix.total.mountedTires)} เส้น · ถึงเกณฑ์เตือน {formatNumber(matrix.total.alertTires)} เส้น
          </span>
        }
        action={<ExportButtons exporting={exporting} disabled={!hasData} onExport={handleExport} />}
      />
      <ExportError message={error} />
      {!hasData ? (
        <EmptyState icon={<Truck className="size-6" />} title="ไม่พบรถตามตัวกรอง" description="ลองเปลี่ยนสาขาหรือประเภทรถ" />
      ) : (
        <div className="grid gap-4 p-5 lg:grid-cols-3">
          <TableWrap className="lg:col-span-2">
            <Table>
              <thead>
                <tr>
                  <Th className={TH_LG}>สาขา</Th>
                  {matrix.columns.map((c) => (
                    <Th key={c.code} className={cn(TH_LG, 'text-right')}>{c.name}</Th>
                  ))}
                  <Th className={cn(TH_LG, 'text-right')}>รวม</Th>
                  <Th className={cn(TH_LG, 'text-right')}>ยางบนรถ</Th>
                  <Th className={cn(TH_LG, 'text-right')}>ถึงเกณฑ์เตือน</Th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.branch ?? '__none__'} className="transition-colors odd:bg-surface-alt/60 hover:bg-brand-50/60">
                    <Td className={cn(TD_LG, 'font-semibold text-ink-900', row.branch === null && 'text-ink-500')}>{row.label}</Td>
                    {matrix.columns.map((c) => (
                      <Td key={c.code} className={cn(TD_LG, 'text-right')}>{formatNumber(row.byType[c.code] ?? 0)}</Td>
                    ))}
                    <Td className={cn(TD_LG, 'text-right font-bold text-ink-900')}>{formatNumber(row.total)}</Td>
                    <Td className={cn(TD_LG, 'text-right')}>{formatNumber(row.mountedTires)}</Td>
                    <Td className={cn(TD_LG, 'text-right font-bold', row.alertTires > 0 ? 'text-rose-700' : 'text-ink-700')}>
                      {formatNumber(row.alertTires)}
                    </Td>
                  </tr>
                ))}
                <tr className="bg-brand-50 font-bold text-ink-900">
                  <Td className={cn(TD_LG, 'font-bold text-ink-900')}>รวม</Td>
                  {matrix.columns.map((c) => (
                    <Td key={c.code} className={cn(TD_LG, 'text-right font-bold text-ink-900')}>{formatNumber(matrix.total.byType[c.code] ?? 0)}</Td>
                  ))}
                  <Td className={cn(TD_LG, 'text-right font-bold text-ink-900')}>{formatNumber(matrix.total.total)}</Td>
                  <Td className={cn(TD_LG, 'text-right font-bold text-ink-900')}>{formatNumber(matrix.total.mountedTires)}</Td>
                  <Td className={cn(TD_LG, 'text-right font-bold', matrix.total.alertTires > 0 ? 'text-rose-700' : 'text-ink-900')}>
                    {formatNumber(matrix.total.alertTires)}
                  </Td>
                </tr>
              </tbody>
            </Table>
          </TableWrap>
          <div>
            <h3 className="mb-2 text-base font-bold text-ink-900">รถแต่ละประเภท (คัน)</h3>
            <AxleTypeBarChart data={perType} />
          </div>
        </div>
      )}
    </Card>
  )
}

/**
 * การ์ด "รถที่ไม่ได้ตรวจยางนาน" — ชิปสรุป + ตารางเรียงจากนานที่สุด
 * @param stale ผลจาก buildStaleVehicles
 * @param referenceISO วันอ้างอิงที่ใช้นับวัน
 * @param exportInput ข้อมูลสำหรับไฟล์ส่งออก
 */
export function StaleVehiclesCard({
  stale,
  referenceISO,
  exportInput,
}: {
  stale: StaleSummary
  referenceISO: string
  exportInput: FleetExportInput
}) {
  const { exporting, error, handleExport } = useFleetExport('stale', exportInput)
  const rows = stale.rows.slice(0, STALE_TABLE_LIMIT)

  return (
    <Card className="mt-4">
      <CardHeader
        title={<span className="text-lg">รถที่ไม่ได้ตรวจยางนาน</span>}
        description={
          <span className="text-[15px] text-ink-700">
            ไม่มีการถอด-ใส่ยางหรือบันทึกเลขไมล์เกิน {STALE_DAYS} วัน · นับถึง {formatThaiDate(referenceISO)}
          </span>
        }
        action={<ExportButtons exporting={exporting} disabled={stale.rows.length === 0} onExport={handleExport} />}
      />
      <ExportError message={error} />
      <CardBody className="flex flex-wrap gap-2">
        <StatusChip tone={stale.over60 > 0 ? 'bad' : 'good'} icon={<Ban />}>เกิน {CRITICAL_DAYS} วัน {formatNumber(stale.over60)} คัน</StatusChip>
        <StatusChip tone={stale.between31And60 > 0 ? 'warn' : 'good'} icon={<AlertTriangle />}>{STALE_DAYS + 1}–{CRITICAL_DAYS} วัน {formatNumber(stale.between31And60)} คัน</StatusChip>
        <StatusChip tone={stale.never > 0 ? 'scrap' : 'good'} icon={<HelpCircle />}>ไม่เคยบันทึก {formatNumber(stale.never)} คัน</StatusChip>
      </CardBody>
      {stale.rows.length === 0 ? (
        <EmptyState
          icon={<Check className="size-6" strokeWidth={3} />}
          title="รถทุกคันมีการบันทึกภายใน 30 วัน"
          description="ไม่มีรถที่ขาดการตรวจยางตามตัวกรองนี้"
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th className={TH_LG}>ทะเบียน</Th>
                  <Th className={cn(TH_LG, 'hidden md:table-cell')}>สาขา</Th>
                  <Th className={cn(TH_LG, 'hidden lg:table-cell')}>ประเภทรถ</Th>
                  <Th className={TH_LG}>ตรวจล่าสุด</Th>
                  <Th className={cn(TH_LG, 'text-right')}>จำนวนวัน</Th>
                  <Th className={cn(TH_LG, 'hidden text-right sm:table-cell')}>เลขไมล์ล่าสุด</Th>
                  <Th className={cn(TH_LG, 'hidden sm:table-cell')}><span className="sr-only">ดูประวัติรถ</span></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isCritical = r.days === null || r.days > CRITICAL_DAYS
                  return (
                    <tr key={r.vehicleId} className={cn('transition-colors', isCritical ? 'bg-rose-50/60 hover:bg-rose-100/70' : 'bg-amber-50/60 hover:bg-amber-100/70')}>
                      <Td className={TD_LG}>
                        <Link href={`/vehicles/${r.vehicleId}`} className="text-lg font-bold text-ink-900 hover:text-brand-700">{r.plateNo}</Link>
                        <span className="block text-sm text-ink-500">{r.province}</span>
                      </Td>
                      <Td className={cn(TD_LG, 'hidden md:table-cell', r.branch === null && 'text-ink-500')}>{r.branch ?? NO_BRANCH_LABEL}</Td>
                      <Td className={cn(TD_LG, 'hidden lg:table-cell')}>{r.axleTypeName}</Td>
                      <Td className={cn(TD_LG, 'whitespace-nowrap')}>{r.lastInspected ? formatThaiDate(r.lastInspected) : <span className="text-ink-500">ไม่เคยบันทึก</span>}</Td>
                      <Td className={cn(TD_LG, 'text-right text-lg font-bold', isCritical ? 'text-rose-700' : 'text-orange-700')}>
                        {r.days === null ? '-' : `${formatNumber(r.days)} วัน`}
                      </Td>
                      <Td className={cn(TD_LG, 'hidden text-right sm:table-cell')}>{formatKm(r.mileage)}</Td>
                      <Td className={cn(TD_LG, 'hidden text-right sm:table-cell')}>
                        <Link
                          href={`/vehicles/${r.vehicleId}`}
                          className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg border-2 border-brand-600 bg-white px-3.5 text-[15px] font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          ดูประวัติรถ <ArrowRight className="size-4" />
                        </Link>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
          {stale.rows.length > rows.length && (
            <p className="border-t border-line px-5 py-3 text-[15px] text-ink-700">
              แสดง {formatNumber(rows.length)} จาก {formatNumber(stale.rows.length)} คัน · ไฟล์ส่งออกมีข้อมูลครบทุกคัน
            </p>
          )}
        </>
      )}
    </Card>
  )
}

/**
 * การ์ด "ยางที่ดอกเหลือไม่เกิน 5 มม." — ชิปสรุปสองช่วง + ตารางเรียงดอกน้อยไปมาก
 * @param lowTread ผลจาก buildLowTread
 * @param exportInput ข้อมูลสำหรับไฟล์ส่งออก
 */
export function LowTreadCard({
  lowTread,
  exportInput,
}: {
  lowTread: LowTreadSummary
  exportInput: FleetExportInput
}) {
  const { exporting, error, handleExport } = useFleetExport('low-tread', exportInput)
  const rows = lowTread.rows.slice(0, LOW_TREAD_TABLE_LIMIT)

  return (
    <Card className="mt-4">
      <CardHeader
        title={<span className="text-lg">ยางที่ดอกเหลือไม่เกิน {TREAD_MID_MM} มม.</span>}
        description={<span className="text-[15px] text-ink-700">ยางบนรถที่ควรวางแผนเปลี่ยน เรียงจากดอกเหลือน้อยที่สุด</span>}
        action={<ExportButtons exporting={exporting} disabled={lowTread.rows.length === 0} onExport={handleExport} />}
      />
      <ExportError message={error} />
      <CardBody className="flex flex-wrap gap-2">
        <StatusChip tone={lowTread.low.tires > 0 ? 'bad' : 'good'} icon={<Ban />}>
          0–{TREAD_LOW_MM} มม. {formatNumber(lowTread.low.tires)} เส้น / {formatNumber(lowTread.low.vehicles)} คัน
        </StatusChip>
        <StatusChip tone={lowTread.mid.tires > 0 ? 'warn' : 'good'} icon={<AlertTriangle />}>
          {TREAD_LOW_MM}–{TREAD_MID_MM} มม. {formatNumber(lowTread.mid.tires)} เส้น / {formatNumber(lowTread.mid.vehicles)} คัน
        </StatusChip>
      </CardBody>
      {lowTread.rows.length === 0 ? (
        <EmptyState
          icon={<Check className="size-6" strokeWidth={3} />}
          title={`ไม่มียางบนรถที่ดอกเหลือไม่เกิน ${TREAD_MID_MM} มม.`}
          description="ยางทุกเส้นที่วัดดอกแล้วยังอยู่ในเกณฑ์ปกติ"
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th className={TH_LG}>ทะเบียน</Th>
                  <Th className={cn(TH_LG, 'hidden lg:table-cell')}>สาขา</Th>
                  <Th className={cn(TH_LG, 'hidden md:table-cell')}>ตำแหน่ง</Th>
                  <Th className={TH_LG}>ซีรีย์</Th>
                  <Th className={cn(TH_LG, 'hidden sm:table-cell')}>ยี่ห้อ / รุ่น</Th>
                  <Th className={cn(TH_LG, 'text-right')}>ดอกเหลือ</Th>
                  <Th className={cn(TH_LG, 'hidden text-right sm:table-cell')}>ระยะรอบนี้</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = treadPercent(r.treadMm, r.newTreadMm)
                  const isLow = r.band === 'low'
                  return (
                    <tr key={r.tireId} className={cn('transition-colors', isLow ? 'bg-rose-50/60 hover:bg-rose-100/70' : 'bg-amber-50/60 hover:bg-amber-100/70')}>
                      <Td className={TD_LG}>
                        <Link href={`/vehicles/${r.vehicleId}`} className="text-lg font-bold text-ink-900 hover:text-brand-700">{r.plateNo}</Link>
                        <span className="block text-sm text-ink-500">{r.province}</span>
                      </Td>
                      <Td className={cn(TD_LG, 'hidden lg:table-cell', r.branch === null && 'text-ink-500')}>{r.branch ?? NO_BRANCH_LABEL}</Td>
                      <Td className={cn(TD_LG, 'hidden md:table-cell')}>{r.positionLabel}</Td>
                      <Td className={TD_LG}>
                        <Link href={`/tires/${r.tireId}`} className="text-base font-bold text-brand-700 underline underline-offset-4 hover:text-brand-800">
                          {r.serialNo}
                        </Link>
                        <TireSpec size={r.size} brandName={r.brandName} modelName={r.modelName} className="mt-0.5 sm:hidden" />
                      </Td>
                      <Td className={cn(TD_LG, 'hidden sm:table-cell')}>
                        <TireSpec size={r.size} brandName={r.brandName} modelName={r.modelName} />
                      </Td>
                      <Td className={cn(TD_LG, 'whitespace-nowrap text-right text-lg font-bold', isLow ? 'text-rose-700' : 'text-orange-700')}>
                        {formatNumber(r.treadMm, 1)} มม.{pct !== null ? <span className="ml-1 text-sm font-normal text-ink-500">({pct}%)</span> : null}
                      </Td>
                      <Td className={cn(TD_LG, 'hidden text-right sm:table-cell')}>{formatKm(r.runKm)}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
          {lowTread.rows.length > rows.length && (
            <p className="border-t border-line px-5 py-3 text-[15px] text-ink-700">
              แสดง {formatNumber(rows.length)} จาก {formatNumber(lowTread.rows.length)} เส้น · ไฟล์ส่งออกมีข้อมูลครบทุกเส้น
            </p>
          )}
        </>
      )}
    </Card>
  )
}
