'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, ArrowLeft, Check, Download, FileSpreadsheet, Upload, X,
} from 'lucide-react'
import {
  Badge, Button, Card, CardBody, CardHeader, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { cn, formatNumber } from '@/lib/utils'
import {
  IMPORT_TEMPLATE_COLUMNS, MAX_IMPORT_ROWS, OTHER_BRAND, parseCsv, parseImportMatrix,
  type TireImportRow,
} from '@/lib/tire-import'
import {
  commitTireImport, previewTireImport, type TireImportCommitResult, type TireImportPreviewRow,
} from '../import-actions'
import type { Row, SheetData } from 'write-excel-file/browser'

/** ขั้นตอนบนหน้าจอ — ทีละหน้า ไม่เลื่อนยาว */
type Step = 'file' | 'preview' | 'done'

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'file', label: 'เลือกไฟล์' },
  { key: 'preview', label: 'ตรวจสอบก่อนนำเข้า' },
  { key: 'done', label: 'นำเข้าเสร็จ' },
]

/** ชื่อไฟล์ต้นแบบที่ให้ดาวน์โหลด */
const TEMPLATE_FILE_NAME = 'dream-tire-import-template.xlsx'

/** สีแถวตามผลตรวจ — โทนเดียวกับ ALERT_ROW (เขียวผ่าน / แดงติดปัญหา) */
const PREVIEW_ROW: Record<TireImportPreviewRow['status'], string> = {
  ok: 'bg-emerald-50/60 transition-colors hover:bg-emerald-100/60',
  error: 'bg-rose-50 transition-colors hover:bg-rose-100/70',
}

/**
 * ถอดรหัสไฟล์ CSV — ลอง UTF-8 ก่อน ถ้าไม่ใช่ (Excel ไทยมักบันทึกเป็น Windows-874) ค่อยลอง TIS-620
 * @param file ไฟล์ที่ผู้ใช้เลือก
 */
async function readCsvText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    try {
      return new TextDecoder('windows-874').decode(buffer)
    } catch {
      return new TextDecoder('utf-8').decode(buffer)
    }
  }
}

/**
 * อ่านไฟล์ที่ผู้ใช้เลือกเป็นตารางดิบ — .xlsx ผ่าน read-excel-file, .csv ผ่าน parser ของเรา
 * @param file ไฟล์ที่ผู้ใช้เลือก
 */
async function readFileMatrix(file: File): Promise<unknown[][]> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'xlsx') {
    const { default: readXlsxFile } = await import('read-excel-file')
    return readXlsxFile(file)
  }
  if (ext === 'csv' || ext === 'txt') {
    return parseCsv(await readCsvText(file))
  }
  throw new Error('รองรับเฉพาะไฟล์ .xlsx หรือ .csv — ไฟล์ .xls รุ่นเก่าให้บันทึกเป็น .xlsx ก่อน')
}

/**
 * สร้างไฟล์ต้นแบบ .xlsx (หัวตาราง + ตัวอย่าง 2 แถว) ให้ผู้ใช้กรอกตาม
 */
async function downloadTemplate() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const headerRow: Row = IMPORT_TEMPLATE_COLUMNS.map((c) => ({
    value: c.required === true ? `${c.header} *` : c.header,
    fontWeight: 'bold',
    textColor: '#FFFFFF',
    backgroundColor: '#0D6EE0',
    height: 28,
    alignVertical: 'center',
  }))
  const exampleRows: Row[] = [0, 1].map((i) =>
    IMPORT_TEMPLATE_COLUMNS.map((c) => ({ value: c.examples[i], type: String })),
  )
  const data: SheetData = [headerRow, ...exampleRows]
  await writeXlsxFile(
    [
      {
        data,
        sheet: 'ซีรีย์ยาง',
        columns: [16, 22, 16, 20, 10, 40].map((width) => ({ width })),
        stickyRowsCount: 1,
      },
    ],
    { fontFamily: 'Aptos', fontSize: 11 },
  ).toFile(TEMPLATE_FILE_NAME)
}

/**
 * หน้านำเข้าซีรีย์ยางจากไฟล์ — ใช้ทั้งฝั่งลูกค้า (Premium) และ super admin ทำแทน
 */
export function TireImportClient({
  companyName,
  companyId,
  basePath,
}: {
  companyName: string
  /** บริษัทเป้าหมาย — ใส่เฉพาะเมื่อ super admin ทำแทน */
  companyId?: string
  /** ลิงก์กลับไปหน้าคลังยางของบริษัทนี้ */
  basePath: string
}) {
  const router = useRouter()
  const [step, setStep] = React.useState<Step>('file')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [fileName, setFileName] = React.useState('')
  /** แถวดิบที่อ่านจากไฟล์ — ส่งชุดเดิมให้ server ตรวจซ้ำตอนบันทึก */
  const [rows, setRows] = React.useState<TireImportRow[]>([])
  const [preview, setPreview] = React.useState<TireImportPreviewRow[]>([])
  const [onlyErrors, setOnlyErrors] = React.useState(false)
  const [result, setResult] = React.useState<TireImportCommitResult | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const okCount = preview.filter((r) => r.status === 'ok').length
  const errorCount = preview.length - okCount
  const visibleRows = onlyErrors ? preview.filter((r) => r.status === 'error') : preview

  /** อ่านไฟล์ → ตรวจรูปแบบ → ส่งให้ server ตรวจกับฐานข้อมูล แล้วไปขั้นพรีวิว */
  async function handleFile(file: File | undefined) {
    if (!file || busy) return
    setError(null)
    setBusy(true)
    try {
      const matrix = await readFileMatrix(file)
      const parsed = parseImportMatrix(matrix)
      if (!parsed.ok) {
        setError(parsed.error)
        return
      }
      if (parsed.rows.length === 0) {
        setError('ไม่พบข้อมูลใต้หัวตาราง — กรอกข้อมูลอย่างน้อย 1 แถว')
        return
      }
      if (parsed.rows.length > MAX_IMPORT_ROWS) {
        setError(
          `ไฟล์มี ${formatNumber(parsed.rows.length)} แถว เกินกำหนด ${formatNumber(MAX_IMPORT_ROWS)} แถวต่อครั้ง — แบ่งไฟล์แล้วนำเข้าทีละส่วน`,
        )
        return
      }

      const res = await previewTireImport(parsed.rows, companyId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setFileName(file.name)
      setRows(parsed.rows)
      setPreview(res.data?.rows ?? [])
      setOnlyErrors(false)
      setStep('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อ่านไฟล์ไม่สำเร็จ')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  /** ตรวจกับฐานข้อมูลใหม่ (เช่น หลัง Dreammaker เปิดสิทธิ์รุ่นให้) */
  async function recheck() {
    if (busy) return
    setError(null)
    setBusy(true)
    const res = await previewTireImport(rows, companyId)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setPreview(res.data?.rows ?? [])
  }

  /** นำเข้าเฉพาะแถวที่ผ่าน */
  async function commit() {
    if (busy || okCount === 0) return
    setError(null)
    setBusy(true)
    const res = await commitTireImport(rows, companyId, fileName)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setResult(res.data ?? { inserted: okCount, skipped: errorCount })
    setStep('done')
    router.refresh()
  }

  /** เริ่มใหม่กับไฟล์อื่น */
  function reset() {
    setStep('file')
    setError(null)
    setFileName('')
    setRows([])
    setPreview([])
    setResult(null)
    setOnlyErrors(false)
  }

  return (
    <div className="space-y-4">
      <StepIndicator current={step} />

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ------------------------------------------------ ขั้นที่ 1: เลือกไฟล์ */}
      {step === 'file' && (
        <>
          <Card>
            <CardHeader
              title="เลือกไฟล์ซีรีย์ยาง"
              description={`นำเข้าเข้าคลังของ ${companyName} — รองรับ .xlsx และ .csv ครั้งละไม่เกิน ${formatNumber(MAX_IMPORT_ROWS)} แถว`}
              action={
                <Button variant="secondary" onClick={() => void downloadTemplate()} className="min-h-12">
                  <Download className="size-5" />
                  ดาวน์โหลดไฟล์ต้นแบบ
                </Button>
              }
            />
            <CardBody>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    inputRef.current?.click()
                  }
                }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  void handleFile(e.dataTransfer.files?.[0])
                }}
                className={cn(
                  'flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                  dragging ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface-alt/60 hover:border-brand-300 hover:bg-brand-50/50',
                  busy && 'pointer-events-none opacity-60',
                )}
              >
                <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
                  <FileSpreadsheet className="size-7" />
                </span>
                <p className="text-base font-medium text-ink-800">
                  {busy ? 'กำลังอ่านและตรวจสอบไฟล์…' : 'ลากไฟล์มาวางที่นี่ หรือแตะเพื่อเลือกไฟล์'}
                </p>
                <p className="text-sm text-ink-500">.xlsx หรือ .csv — แถวแรกต้องเป็นหัวตารางตามไฟล์ต้นแบบ</p>
                <Button type="button" loading={busy} className="min-h-12 pointer-events-none" tabIndex={-1}>
                  <Upload className="size-5" />
                  เลือกไฟล์
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="คอลัมน์ในไฟล์"
              description="จับคู่จากชื่อหัวคอลัมน์ (ไทยหรืออังกฤษ) สลับลำดับคอลัมน์ได้"
            />
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>คอลัมน์</Th>
                    <Th>บังคับ</Th>
                    <Th>คำอธิบาย</Th>
                  </tr>
                </thead>
                <tbody>
                  {IMPORT_TEMPLATE_COLUMNS.map((c) => (
                    <tr key={c.key}>
                      <Td className="font-medium text-ink-900">
                        {c.header}
                        {c.required === true && <span className="ml-0.5 text-rose-500">*</span>}
                      </Td>
                      <Td>
                        {c.required === true ? (
                          <Badge tone="rose">บังคับ</Badge>
                        ) : c.required === 'other' ? (
                          <Badge tone="amber">บังคับเมื่อยี่ห้อ = {OTHER_BRAND}</Badge>
                        ) : (
                          <Badge>ไม่บังคับ</Badge>
                        )}
                      </Td>
                      <Td className="text-ink-600">{c.hint}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
        </>
      )}

      {/* ------------------------------------------- ขั้นที่ 2: ตรวจสอบก่อนนำเข้า */}
      {step === 'preview' && (
        <Card>
          <CardHeader
            title="ตรวจสอบก่อนนำเข้า"
            description={
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="truncate">{fileName}</span>
                <Badge tone="emerald">
                  <Check className="size-3.5" strokeWidth={3} />
                  พร้อมนำเข้า {formatNumber(okCount)}
                </Badge>
                <Badge tone={errorCount > 0 ? 'rose' : 'slate'}>
                  <X className="size-3.5" strokeWidth={3} />
                  ติดปัญหา {formatNumber(errorCount)}
                </Badge>
              </span>
            }
            action={
              <Button variant="secondary" className="min-h-12" onClick={reset} disabled={busy}>
                <ArrowLeft className="size-5" />
                เลือกไฟล์ใหม่
              </Button>
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <label className="flex min-h-12 cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={onlyErrors}
                onChange={(e) => setOnlyErrors(e.target.checked)}
                className="size-5 rounded border-line accent-brand-600"
              />
              แสดงเฉพาะแถวที่ติดปัญหา
            </label>
            <Button variant="ghost" className="min-h-12" onClick={() => void recheck()} loading={busy}>
              ตรวจสอบใหม่
            </Button>
          </div>

          <TableWrap className="max-h-[60vh] overflow-y-auto">
            <Table>
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th>แถว</Th>
                  <Th>ซีรีย์</Th>
                  <Th>ยี่ห้อ / รุ่น</Th>
                  <Th>ขนาด</Th>
                  <Th>DOT</Th>
                  <Th>หมายเหตุ</Th>
                  <Th>ผลตรวจ</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && (
                  <tr>
                    <Td colSpan={7} className="py-10 text-center text-ink-500">
                      ไม่มีแถวที่ติดปัญหา
                    </Td>
                  </tr>
                )}
                {visibleRows.map((r) => (
                  <tr key={r.rowNo} className={PREVIEW_ROW[r.status]}>
                    <Td className="tabular-nums text-ink-500">{r.rowNo}</Td>
                    <Td className="font-semibold uppercase text-ink-900">{r.serial || '-'}</Td>
                    <Td>
                      <span className="block">{(r.resolved?.brand_name ?? r.brand) || '-'}</span>
                      <span className="block text-[13px] text-ink-500">{(r.resolved?.model_name ?? r.model) || '-'}</span>
                    </Td>
                    <Td>{(r.resolved?.size ?? r.size) || '-'}</Td>
                    <Td>{r.dot || '-'}</Td>
                    <Td className="max-w-xs truncate text-ink-600" title={r.note}>{r.note || '-'}</Td>
                    <Td>
                      {r.status === 'ok' && r.willCreate ? (
                        <span className="inline-flex items-start gap-1.5 text-sm font-medium text-amber-700">
                          <Check className="mt-0.5 size-4 shrink-0" strokeWidth={3} />
                          {r.message}
                        </span>
                      ) : r.status === 'ok' ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                          <Check className="size-4" strokeWidth={3} />
                          ผ่าน
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1.5 text-sm font-medium text-rose-700">
                          <AlertCircle className="mt-0.5 size-4 shrink-0" />
                          {r.message}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>

          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-500">
              {errorCount > 0
                ? 'แถวที่ติดปัญหาจะถูกข้าม — แก้ไฟล์แล้วนำเข้าเพิ่มภายหลังได้ ซีรีย์ที่นำเข้าแล้วจะไม่ซ้ำ'
                : 'ทุกแถวผ่านการตรวจ พร้อมนำเข้าเข้าคลัง'}
            </p>
            <Button
              variant="success"
              size="lg"
              className="min-h-12"
              disabled={okCount === 0}
              loading={busy}
              onClick={() => void commit()}
            >
              <Upload className="size-5" />
              นำเข้า {formatNumber(okCount)} เส้นที่ผ่าน
            </Button>
          </CardBody>
        </Card>
      )}

      {/* ------------------------------------------------ ขั้นที่ 3: เสร็จ */}
      {step === 'done' && result && (
        <Card>
          <CardBody className="flex flex-col items-center py-12 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="size-8" strokeWidth={3} />
            </span>
            <p className="mt-4 text-xl font-semibold text-ink-900">
              นำเข้าเรียบร้อย {formatNumber(result.inserted)} เส้น
            </p>
            <p className="mt-1 text-sm text-ink-500">
              {result.skipped > 0
                ? `ข้ามแถวที่ติดปัญหา ${formatNumber(result.skipped)} แถว — แก้ไฟล์แล้วนำเข้าเพิ่มได้`
                : 'ยางทั้งหมดอยู่ในคลังแล้ว ช่างเลือกซีรีย์จากคลังได้ทันทีตอนใส่ยาง'}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href={basePath}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-600 px-5 text-[15px] font-medium text-white hover:bg-brand-700"
              >
                ไปที่คลังยาง
              </Link>
              <Button variant="secondary" className="min-h-12" onClick={reset}>
                นำเข้าไฟล์อื่น
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

/** แถบ 3 ขั้นตอนด้านบน — ขั้นที่ผ่านแล้วติ๊กถูก ขั้นปัจจุบันเน้นสี */
function StepIndicator({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current)
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {STEPS.map((s, index) => {
        const done = index < currentIndex
        const active = index === currentIndex
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-inset',
                active && 'bg-brand-600 text-white ring-brand-600',
                done && 'bg-emerald-100 text-emerald-700 ring-emerald-300',
                !active && !done && 'bg-white text-ink-400 ring-line',
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
            </span>
            <span
              className={cn(
                'truncate text-sm',
                active ? 'font-semibold text-ink-900' : done ? 'text-emerald-700' : 'text-ink-400',
              )}
            >
              {s.label}
            </span>
            {index < STEPS.length - 1 && (
              <span className={cn('hidden h-px flex-1 sm:block', done ? 'bg-emerald-300' : 'bg-line')} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
