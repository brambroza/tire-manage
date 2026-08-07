'use client'

import * as React from 'react'
import {
  Award, CircleDot, Eye, FileSpreadsheet, Filter, Gauge, Route,
  TrendingDown, TrendingUp,
} from 'lucide-react'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Select,
  Table, TableWrap, Td, Th,
} from '@/components/ui'
import { Modal } from '@/components/ui/modal'
import { TireSpec } from '@/components/tire-spec'
import { cn, formatNumber } from '@/lib/utils'
import {
  ALL_FILTER,
  UNSPECIFIED_FILTER,
  performanceReasonKey,
  summarizeTirePerformance,
  type ModelPerformance,
  type ReportFilterOption,
  type TirePerformanceRow,
} from './tire-performance-types'

type RankingOrder = 'longest' | 'shortest'

function Metric({
  label,
  value,
  unit,
  detail,
  icon,
}: {
  label: string
  value: string
  unit?: string
  detail: string
  icon: React.ReactNode
}) {
  return (
    <div className="border-r border-line px-4 py-3 last:border-r-0 max-md:border-b max-md:border-r-0 max-md:last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-500">{label}</span>
        <span className="text-brand-600">{icon}</span>
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-ink-900">{value}</span>
        {unit ? <span className="text-xs text-ink-400">{unit}</span> : null}
      </p>
      <p className="mt-1 text-xs text-ink-400">{detail}</p>
    </div>
  )
}

function PerformanceInsight({
  kind,
  model,
}: {
  kind: 'longest' | 'shortest'
  model: ModelPerformance | null
}) {
  const longest = kind === 'longest'
  const tone = longest
    ? {
        shell: 'border-emerald-200 bg-emerald-50/45',
        icon: 'bg-emerald-100 text-emerald-700',
        title: 'text-emerald-700',
        value: 'text-emerald-700',
      }
    : {
        shell: 'border-rose-200 bg-rose-50/40',
        icon: 'bg-rose-100 text-rose-700',
        title: 'text-rose-700',
        value: 'text-rose-700',
      }

  return (
    <section className={cn('rounded-2xl border p-5', tone.shell)}>
      <div className="flex items-start gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', tone.icon)}>
          {longest ? <Award className="size-5" /> : <TrendingDown className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={cn('font-semibold', tone.title)}>
            {longest ? 'รุ่นที่ใช้งานได้นานที่สุด' : 'รุ่นที่ใช้งานได้สั้นที่สุด'}
          </h3>
          <p className="mt-0.5 text-xs text-ink-400">จัดอันดับจากระยะเฉลี่ยต่อรอบ</p>
        </div>
      </div>

      {model ? (
        <div className="mt-5">
          <TireSpec
            size={model.size}
            brandName={model.brandName}
            modelName={model.modelName}
            sizeClassName="text-lg"
            detailClassName="text-sm text-ink-500"
          />
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={cn('text-3xl font-semibold tracking-tight', tone.value)}>
              {formatNumber(model.averageDistanceKm)}
            </span>
            <span className="text-sm text-ink-500">กม. เฉลี่ยต่อรอบ</span>
          </p>
          <dl className="mt-4 grid gap-3 border-t border-current/10 pt-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-400">ระยะสูงสุดที่บันทึก</dt>
              <dd className="mt-1 font-medium text-ink-800">{formatNumber(model.maximumDistanceKm)} กม.</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">จำนวนข้อมูลวัดระยะ</dt>
              <dd className="mt-1 font-medium text-ink-800">{formatNumber(model.measuredCount)} รอบ</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">
                {longest ? 'สาเหตุในรอบที่ยาวสุด' : 'สาเหตุในรอบที่สั้นสุด'}
              </dt>
              <dd className="mt-1 font-medium text-ink-800">
                {longest ? model.longestReason : model.shortestReason}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-white/70 px-4 py-8 text-center text-sm text-ink-400">
          ยังไม่มีข้อมูลระยะทางสำหรับจัดอันดับ
        </p>
      )}
    </section>
  )
}

/** รายงานอายุใช้งานและสาเหตุเปลี่ยนยางข้ามทุกบริษัท สำหรับ Super Admin */
export function TirePerformanceReport({
  rows,
  companies,
  reasons,
}: {
  rows: TirePerformanceRow[]
  companies: ReportFilterOption[]
  reasons: ReportFilterOption[]
}) {
  const [companyId, setCompanyId] = React.useState(ALL_FILTER)
  const [brand, setBrand] = React.useState(ALL_FILTER)
  const [reasonId, setReasonId] = React.useState(ALL_FILTER)
  const [rankingOrder, setRankingOrder] = React.useState<RankingOrder>('longest')
  const [exporting, setExporting] = React.useState<'excel' | 'pdf' | null>(null)
  const [exportError, setExportError] = React.useState<string | null>(null)
  const [pdfOpen, setPdfOpen] = React.useState(false)
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null)
  const [pdfBlob, setPdfBlob] = React.useState<Blob | null>(null)
  const pdfUrlRef = React.useRef<string | null>(null)

  React.useEffect(() => () => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
  }, [])

  const brands = React.useMemo(() => {
    const values = new Set(rows.map((row) => row.brandName?.trim() || UNSPECIFIED_FILTER))
    return Array.from(values).sort((a, b) => {
      if (a === UNSPECIFIED_FILTER) return 1
      if (b === UNSPECIFIED_FILTER) return -1
      return a.localeCompare(b, 'th')
    })
  }, [rows])

  const filteredRows = React.useMemo(() => rows.filter((row) => {
    if (companyId !== ALL_FILTER && row.companyId !== companyId) return false
    const rowBrand = row.brandName?.trim() || UNSPECIFIED_FILTER
    if (brand !== ALL_FILTER && rowBrand !== brand) return false
    return reasonId === ALL_FILTER || performanceReasonKey(row) === reasonId
  }), [brand, companyId, reasonId, rows])

  const summary = React.useMemo(() => summarizeTirePerformance(filteredRows), [filteredRows])
  const rankedModels = React.useMemo(() => {
    if (rankingOrder === 'longest') return summary.models.slice(0, 10)
    return [...summary.models]
      .sort((a, b) =>
        a.averageDistanceKm - b.averageDistanceKm
        || a.minimumDistanceKm - b.minimumDistanceKm
        || b.measuredCount - a.measuredCount,
      )
      .slice(0, 10)
  }, [rankingOrder, summary.models])

  const filterLabel = React.useMemo(() => {
    const company = companyId === ALL_FILTER
      ? 'ทุกบริษัท'
      : companies.find((option) => option.id === companyId)?.name ?? 'ทุกบริษัท'
    const brandLabel = brand === ALL_FILTER
      ? 'ทุกยี่ห้อ'
      : brand === UNSPECIFIED_FILTER ? 'ไม่ระบุยี่ห้อ' : brand
    const reason = reasonId === ALL_FILTER
      ? 'ทุกสาเหตุ'
      : reasonId === UNSPECIFIED_FILTER
        ? 'ไม่ระบุสาเหตุ'
        : reasons.find((option) => option.id === reasonId)?.name ?? 'ทุกสาเหตุ'
    return `${company} · ${brandLabel} · ${reason}`
  }, [brand, companies, companyId, reasonId, reasons])

  function replacePdfUrl(blob: Blob) {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    const url = URL.createObjectURL(blob)
    pdfUrlRef.current = url
    setPdfUrl(url)
    setPdfBlob(blob)
  }

  function closePdfPreview() {
    setPdfOpen(false)
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
    pdfUrlRef.current = null
    setPdfUrl(null)
    setPdfBlob(null)
  }

  async function exportExcel() {
    setExporting('excel')
    setExportError(null)
    try {
      const exporter = await import('./tire-performance-export')
      await exporter.exportTirePerformanceExcel({ filterLabel, rows: filteredRows })
    } catch (error) {
      console.error(error)
      setExportError('สร้างไฟล์ Excel ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setExporting(null)
    }
  }

  async function previewPdf() {
    setPdfOpen(true)
    setExporting('pdf')
    setExportError(null)
    try {
      const exporter = await import('./tire-performance-export')
      replacePdfUrl(await exporter.buildTirePerformancePdf({ filterLabel, rows: filteredRows }))
    } catch (error) {
      console.error(error)
      setExportError('สร้าง PDF Preview ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setExporting(null)
    }
  }

  async function downloadPdf() {
    if (!pdfBlob) return
    const exporter = await import('./tire-performance-export')
    exporter.downloadTirePerformancePdf(pdfBlob)
  }

  const measuredPercentage = summary.totalEvents === 0
    ? 0
    : (summary.measuredEvents / summary.totalEvents) * 100

  return (
    <>
      <Card className="mt-4 overflow-hidden">
        <CardHeader
          title="ประสิทธิภาพยางและสาเหตุการเปลี่ยน"
          description="เปรียบเทียบอายุใช้งานต่อหนึ่งรอบติดตั้ง-ถอด แยกตามยี่ห้อ รุ่น บริษัท และสาเหตุ"
        />
        <CardBody className="space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <Field label="บริษัท">
                <Select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                  <option value={ALL_FILTER}>ทุกบริษัท</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="ยี่ห้อ">
                <Select value={brand} onChange={(event) => setBrand(event.target.value)}>
                  <option value={ALL_FILTER}>ทุกยี่ห้อ</option>
                  {brands.map((option) => (
                    <option key={option} value={option}>
                      {option === UNSPECIFIED_FILTER ? 'ไม่ระบุยี่ห้อ' : option}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="สาเหตุการเปลี่ยน">
                <Select value={reasonId} onChange={(event) => setReasonId(event.target.value)}>
                  <option value={ALL_FILTER}>ทุกสาเหตุ</option>
                  {reasons.map((reason) => (
                    <option key={reason.id} value={reason.id}>{reason.name}</option>
                  ))}
                  {rows.some((row) => row.reasonId === null)
                    ? <option value={UNSPECIFIED_FILTER}>ไม่ระบุสาเหตุ</option>
                    : null}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={exporting === 'excel'}
                disabled={filteredRows.length === 0 || exporting !== null}
                onClick={exportExcel}
              >
                <FileSpreadsheet className="size-4" />
                Export Excel
              </Button>
              <Button
                type="button"
                size="sm"
                loading={exporting === 'pdf'}
                disabled={filteredRows.length === 0 || exporting !== null}
                onClick={previewPdf}
              >
                <Eye className="size-4" />
                Preview PDF
              </Button>
            </div>
          </div>

          {exportError && !pdfOpen ? (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              {exportError}
            </p>
          ) : null}

          <p className="flex items-start gap-2 rounded-xl bg-brand-50/60 px-4 py-3 text-sm text-ink-500 ring-1 ring-inset ring-brand-100">
            <Gauge className="mt-0.5 size-4 shrink-0 text-brand-600" />
            ระยะใช้งานคำนวณจากข้อมูล “ระยะรอบนี้” ตอนถอดยาง แถวที่ไม่มีระยะยังนับในสรุปสาเหตุ แต่ไม่นำมาคำนวณค่าเฉลี่ยและอันดับ
          </p>

          <div className="grid overflow-hidden rounded-2xl border border-line bg-white md:grid-cols-4">
            <Metric
              label="เหตุการณ์เปลี่ยนยาง"
              value={formatNumber(summary.totalEvents)}
              unit="ครั้ง"
              detail={`ตามตัวกรอง ${filterLabel}`}
              icon={<Filter className="size-4" />}
            />
            <Metric
              label="รายการที่มีระยะวัดได้"
              value={formatNumber(summary.measuredEvents)}
              unit="รอบ"
              detail={`${formatNumber(measuredPercentage, 1)}% ของเหตุการณ์ทั้งหมด`}
              icon={<CircleDot className="size-4" />}
            />
            <Metric
              label="ระยะเฉลี่ยต่อรอบ"
              value={summary.averageDistanceKm === null ? '-' : formatNumber(summary.averageDistanceKm)}
              unit="กม."
              detail="เฉพาะรายการที่มีระยะทาง"
              icon={<Route className="size-4" />}
            />
            <Metric
              label="รุ่นที่วิเคราะห์ได้"
              value={formatNumber(summary.uniqueModels)}
              unit="รุ่น"
              detail="แสดงจำนวนตัวอย่างกำกับทุกอันดับ"
              icon={<TrendingUp className="size-4" />}
            />
          </div>

          {summary.models.length === 0 ? (
            <EmptyState
              icon={<Gauge className="size-6" />}
              title="ยังไม่มีข้อมูลระยะทางสำหรับวิเคราะห์"
              description="เมื่อมีการถอดยางและบันทึกระยะรอบ ระบบจะจัดอันดับให้โดยอัตโนมัติ"
            />
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <PerformanceInsight kind="longest" model={summary.longestModel} />
                <PerformanceInsight kind="shortest" model={summary.shortestModel} />
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.45fr)]">
                <section className="rounded-2xl border border-line p-5">
                  <div>
                    <h3 className="font-semibold text-ink-900">สาเหตุการเปลี่ยนยาง</h3>
                    <p className="mt-0.5 text-sm text-ink-500">สัดส่วนและระยะเฉลี่ยก่อนเปลี่ยน</p>
                  </div>
                  <div className="mt-5 space-y-4">
                    {summary.reasons.slice(0, 7).map((reason) => (
                      <div key={reason.key}>
                        <div className="flex items-start justify-between gap-4 text-sm">
                          <span className="min-w-0 truncate font-medium text-ink-700">{reason.name}</span>
                          <span className="shrink-0 text-right text-ink-500">
                            {formatNumber(reason.count)} ครั้ง · {formatNumber(reason.percentage, 1)}%
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-50">
                          <div
                            role="progressbar"
                            aria-label={`${reason.name} ${formatNumber(reason.percentage, 1)}%`}
                            aria-valuenow={reason.percentage}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${Math.max(reason.percentage, 2)}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-ink-400">
                          ระยะเฉลี่ย {reason.averageDistanceKm === null
                            ? '-'
                            : `${formatNumber(reason.averageDistanceKm)} กม.`}
                          {' '}จาก {formatNumber(reason.measuredCount)} รอบที่มีระยะ
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl border border-line">
                  <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-ink-900">อันดับประสิทธิภาพตามขนาด / ยี่ห้อ รุ่น</h3>
                      <p className="mt-0.5 text-sm text-ink-500">เรียงจากระยะเฉลี่ยต่อรอบ พร้อมระยะสูงสุดและต่ำสุด</p>
                    </div>
                    <div className="inline-flex w-fit rounded-xl bg-brand-50 p-1">
                      {([
                        { key: 'longest', label: 'นานที่สุด' },
                        { key: 'shortest', label: 'สั้นที่สุด' },
                      ] as const).map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setRankingOrder(option.key)}
                          className={cn(
                            'h-9 rounded-lg px-3 text-sm font-medium transition-colors',
                            rankingOrder === option.key
                              ? 'bg-white text-brand-700 shadow-sm'
                              : 'text-ink-500 hover:text-ink-800',
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <TableWrap>
                    <Table className="min-w-[800px]">
                      <thead>
                        <tr>
                          <Th className="w-14 text-center">อันดับ</Th>
                          <Th>ขนาด / ยี่ห้อ รุ่น</Th>
                          <Th className="text-right">เฉลี่ย</Th>
                          <Th className="text-right">สูงสุด</Th>
                          <Th className="text-right">ต่ำสุด</Th>
                          <Th className="text-center">ตัวอย่าง</Th>
                          <Th>สาเหตุหลัก</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankedModels.map((model, index) => (
                          <tr key={model.key} className="transition-colors hover:bg-brand-50/40">
                            <Td className="text-center">
                              <span className={cn(
                                'inline-flex size-7 items-center justify-center rounded-lg text-xs font-semibold',
                                index === 0 ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700',
                              )}>
                                {index + 1}
                              </span>
                            </Td>
                            <Td>
                              <TireSpec
                                size={model.size}
                                brandName={model.brandName}
                                modelName={model.modelName}
                              />
                            </Td>
                            <Td className="text-right font-semibold text-brand-700">
                              {formatNumber(model.averageDistanceKm)} กม.
                            </Td>
                            <Td className="text-right">{formatNumber(model.maximumDistanceKm)} กม.</Td>
                            <Td className="text-right">{formatNumber(model.minimumDistanceKm)} กม.</Td>
                            <Td className="text-center"><Badge tone="slate">{model.measuredCount} รอบ</Badge></Td>
                            <Td>{model.primaryReason}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                </section>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Modal
        open={pdfOpen}
        onClose={closePdfPreview}
        size="xl"
        title="ตัวอย่างรายงาน PDF"
        description={filterLabel}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closePdfPreview}>ปิด</Button>
            <Button type="button" disabled={!pdfBlob} onClick={downloadPdf}>
              ดาวน์โหลด PDF
            </Button>
          </>
        }
      >
        {exporting === 'pdf' ? (
          <div className="flex h-[65dvh] flex-col items-center justify-center gap-3 rounded-xl bg-brand-50/50 text-center">
            <div className="size-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
            <p className="font-medium text-ink-700">กำลังจัดหน้ารายงาน PDF...</p>
            <p className="text-sm text-ink-400">จำนวน {formatNumber(filteredRows.length)} รายการ</p>
          </div>
        ) : pdfUrl ? (
          <iframe
            title="ตัวอย่างรายงานประสิทธิภาพยาง PDF"
            src={`${pdfUrl}#toolbar=0&navpanes=0`}
            className="h-[65dvh] w-full rounded-xl border border-line bg-slate-100"
          />
        ) : (
          <div className="flex h-[65dvh] items-center justify-center rounded-xl bg-rose-50 px-6 text-center text-sm text-rose-700">
            {exportError ?? 'ไม่สามารถแสดงตัวอย่าง PDF ได้'}
          </div>
        )}
      </Modal>
    </>
  )
}
