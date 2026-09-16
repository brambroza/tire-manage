import { positionLabel } from '@/lib/axle-layouts'
import { tireBrandModelLabel, tireSizeLabel } from '@/lib/tire-display'
import {
  TIRE_STATUS_LABEL, diffDays, formatNumber, formatThaiDate, todayISO, treadPercent,
} from '@/lib/utils'
import type { LastRemoval } from '@/lib/tire-events'
import type { Tire, TireOverview, TireStatus } from '@/lib/database.types'
import type { DateRange } from '@/app/(app)/dashboard/removal-report-types'
import type { Cell, Row, Sheet, SheetData } from 'write-excel-file/browser'

/** ข้อมูลที่ใช้สร้างไฟล์ส่งออกคลังยาง */
export interface TiresExportInput {
  companyName: string
  /** ข้อความตัวกรองที่ใช้ (สถานะ + คำค้น + ช่วงวันที่) สำหรับหัวรายงาน */
  filterLabel: string
  /** ช่วงวันที่ที่กรอง — ใช้ตั้งชื่อไฟล์ */
  range?: DateRange
  tires: TireOverview[]
  /** ข้อมูลดิบ key = tire id (ใช้ created_at, purchase_price, note) */
  rawTires: Record<string, Tire>
  /** การถอดครั้งล่าสุดของยางที่ไม่ได้อยู่บนรถ */
  lastRemovals: Record<string, LastRemoval>
}

const BRAND = '#0D6EE0'
const BRAND_LIGHT = '#F0F8FF'
const INK = '#0F1C2E'
const MUTED = '#5B7089'
const LINE = '#E3EDF9'
const DANGER = '#BE123C'

/** แถวยางหนึ่งเส้นหลังแปลงค่าให้พร้อมแสดงผล (ใช้ร่วมกันทั้ง Excel และ PDF) */
export interface TireExportRow {
  serialNo: string
  size: string
  brandModel: string
  dot: string
  status: TireStatus
  statusLabel: string
  /** ทะเบียนรถที่ติดตั้งอยู่ หรือคันที่ถอดออกมาล่าสุด */
  plateNo: string
  /** ตำแหน่งล้อปัจจุบัน หรือตอนถอด */
  position: string
  /** "อยู่บนรถ" / "คลังสินค้า (ถอดจาก ...)" สำหรับ PDF */
  locationLabel: string
  removalReason: string
  treadMm: number | null
  treadPercent: number | null
  treadAlert: boolean
  /** ระยะรอบล่าสุด: รอบปัจจุบัน (mounted) หรือรอบที่ถอดออก */
  runKm: number | null
  runAlert: boolean
  usageDays: number | null
  lifetimeKm: number
  isEstimated: boolean
  lifetimeAlert: boolean
  mountedAt: string | null
  createdAt: string | null
  purchasePrice: number | null
  note: string
}

/** สรุปตัวเลขภาพรวมของรายการยางที่ส่งออก */
export interface TiresExportSummary {
  total: number
  mounted: number
  inStock: number
  scrapped: number
  retreading: number
  /** ยางบนรถที่ถึงเกณฑ์เตือน (ระยะรอบ หรือดอกยาง) */
  alert: number
  totalLifetimeKm: number
}

/**
 * แปลง TireOverview เป็นแถวพร้อมส่งออก
 * @param input ข้อมูลยาง ข้อมูลดิบ และการถอดล่าสุด
 * @param now เวลาปัจจุบัน (ใส่ได้เพื่อทดสอบ)
 */
export function toTireExportRows(
  input: Pick<TiresExportInput, 'tires' | 'rawTires' | 'lastRemovals'>,
  now = new Date(),
): TireExportRow[] {
  const nowISO = now.toISOString()
  return input.tires.map((t) => {
    const raw = input.rawTires[t.id]
    const removal = t.status !== 'mounted' ? input.lastRemovals[t.id] : undefined
    const mounted = t.status === 'mounted'
    const usageDays = mounted && t.mounted_at
      ? diffDays(t.mounted_at, nowISO)
      : removal?.mounted_at
        ? diffDays(removal.mounted_at, removal.event_date)
        : null
    const plateNo = mounted ? (t.plate_no ?? '') : (removal?.plate_no ?? '')
    const position = mounted
      ? positionLabel(t.position_code)
      : removal?.position_code
        ? positionLabel(removal.position_code)
        : ''
    const locationLabel = mounted
      ? [plateNo, position].filter(Boolean).join(' · ')
      : removal
        ? `คลังสินค้า · ถอดจาก ${removal.plate_no ?? 'รถที่ถูกลบแล้ว'} ${formatThaiDate(removal.event_date)}`
        : 'คลังสินค้า'
    const treadAlert = t.tread_mm !== null && t.tread_mm <= t.alert_tread_mm
    const runAlert = mounted && t.current_run_km >= t.alert_km
    return {
      serialNo: t.serial_no,
      size: tireSizeLabel(t.size, ''),
      brandModel: tireBrandModelLabel(t.brand_name, t.model_name, ''),
      dot: t.dot ?? '',
      status: t.status,
      statusLabel: TIRE_STATUS_LABEL[t.status],
      plateNo,
      position,
      locationLabel,
      removalReason: removal ? [removal.reason, removal.note].filter(Boolean).join(' · ') : '',
      treadMm: t.tread_mm,
      treadPercent: treadPercent(t.tread_mm, t.new_tread_mm),
      treadAlert,
      runKm: mounted ? t.current_run_km : removal?.distance_km ?? null,
      runAlert,
      usageDays,
      lifetimeKm: t.estimated_lifetime_km,
      isEstimated: t.is_estimated,
      lifetimeAlert:
        t.alert_lifetime_km !== null && t.status !== 'scrapped' && t.estimated_lifetime_km >= t.alert_lifetime_km,
      mountedAt: mounted ? t.mounted_at : null,
      createdAt: raw?.created_at ?? null,
      purchasePrice: raw?.purchase_price ?? null,
      note: raw?.note ?? '',
    }
  })
}

/**
 * สรุปจำนวนยางตามสถานะและเกณฑ์เตือน
 * @param rows แถวที่แปลงแล้วจาก toTireExportRows
 */
export function summarizeTireRows(rows: TireExportRow[]): TiresExportSummary {
  return {
    total: rows.length,
    mounted: rows.filter((r) => r.status === 'mounted').length,
    inStock: rows.filter((r) => r.status === 'in_stock').length,
    scrapped: rows.filter((r) => r.status === 'scrapped').length,
    retreading: rows.filter((r) => r.status === 'retreading').length,
    alert: rows.filter((r) => r.status === 'mounted' && (r.runAlert || r.treadAlert)).length,
    totalLifetimeKm: rows.reduce((sum, r) => sum + r.lifetimeKm, 0),
  }
}

/**
 * ชื่อไฟล์ส่งออก — ใส่ช่วงวันที่ที่กรองไว้เพื่อแยกไฟล์เมื่อออกหลายรอบ
 * @param extension นามสกุลไฟล์
 * @param range ช่วงวันที่ที่กรอง (ว่าง = ใช้วันที่ส่งออก)
 */
function exportFilename(extension: 'xlsx' | 'pdf', range?: DateRange) {
  const suffix =
    range && (range.from || range.to)
      ? `_${range.from || 'start'}_${range.to || todayISO()}`
      : `-${todayISO()}`
  return `dream-tire-tires${suffix}.${extension}`
}

/** ข้อความบรรทัดรองใต้หัวรายงาน */
function metaLabel(input: TiresExportInput, exportedAt: Date) {
  return `${input.companyName} · ตัวกรอง: ${input.filterLabel} · ส่งออก ${formatThaiDate(exportedAt, true)}`
}

/** เซลล์วันที่ — คืน "-" เมื่อไม่มีค่าหรือแปลงไม่ได้ */
function dateCell(base: Partial<Cell>, iso: string | null): Cell {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return { ...base, value: '-', type: String } as Cell
  return { ...base, value: d, type: Date, format: 'dd/mm/yyyy' } as Cell
}

/**
 * สร้างชีต Excel สองชีต: สรุป และรายการยาง
 * @param input ข้อมูลยางและบริษัท
 * @param exportedAt เวลาที่ส่งออก (ใส่ได้เพื่อทดสอบ)
 */
export function buildTiresExcelSheets(
  input: TiresExportInput,
  exportedAt = new Date(),
): Sheet<Blob>[] {
  const rows = toTireExportRows(input, exportedAt)
  const summary = summarizeTireRows(rows)

  const titleRow: Row = [
    {
      value: 'รายการคลังยาง',
      columnSpan: 6,
      height: 34,
      fontSize: 18,
      fontWeight: 'bold',
      textColor: INK,
      alignVertical: 'center',
    },
    null, null, null, null, null,
  ]
  const metaRow: Row = [
    { value: metaLabel(input, exportedAt), columnSpan: 6, height: 24, fontSize: 10, textColor: MUTED },
    null, null, null, null, null,
  ]
  const metricLabel = (value: string): Cell => ({ value, textColor: MUTED, height: 25 })
  const metricValue = (value: number): Cell => ({
    value,
    fontWeight: 'bold',
    fontSize: 14,
    textColor: INK,
    align: 'right',
    format: '#,##0',
    height: 25,
  })
  const summaryData: SheetData = [
    titleRow,
    metaRow,
    [],
    [metricLabel('จำนวนยางทั้งหมด'), metricValue(summary.total), null, metricLabel('ถึงเกณฑ์เตือน (บนรถ)'), metricValue(summary.alert)],
    [metricLabel('อยู่บนรถ'), metricValue(summary.mounted), null, metricLabel('ระยะสะสมรวม (กม.)'), metricValue(summary.totalLifetimeKm)],
    [metricLabel('อยู่ในคลัง'), metricValue(summary.inStock)],
    [metricLabel('ตัดจำหน่าย'), metricValue(summary.scrapped)],
    [metricLabel('ส่งหล่อดอก'), metricValue(summary.retreading)],
  ]

  const headers = [
    'เลขยาง', 'ขนาด', 'ยี่ห้อ / รุ่น', 'DOT', 'สถานะ', 'ทะเบียนรถ', 'ตำแหน่ง', 'สาเหตุที่ถอด',
    'ดอกยาง (มม.)', 'ดอกยาง (%)', 'ระยะรอบล่าสุด (กม.)', 'ระยะเวลาใช้งาน (วัน)', 'ระยะสะสม (กม.)', 'ประมาณการ',
    'วันที่ติดตั้ง', 'วันที่รับเข้าระบบ', 'ราคาซื้อ (บาท)', 'หมายเหตุ',
  ]
  const detailData: SheetData = [
    headers.map((value) => ({
      value,
      height: 29,
      fontWeight: 'bold' as const,
      textColor: '#FFFFFF',
      backgroundColor: BRAND,
      alignVertical: 'center' as const,
      wrap: true,
    })),
    ...rows.map((row, index): Row => {
      const backgroundColor = index % 2 === 1 ? BRAND_LIGHT : '#FFFFFF'
      const base = {
        height: 24,
        backgroundColor,
        bottomBorderColor: LINE,
        bottomBorderStyle: 'hair' as const,
        alignVertical: 'center' as const,
      }
      const num = (value: number | null, alert = false, format = '#,##0'): Cell =>
        value === null
          ? { ...base, value: '-', type: String, align: 'right' }
          : { ...base, value, format, align: 'right', ...(alert ? { textColor: DANGER, fontWeight: 'bold' } : {}) }
      return [
        { ...base, value: row.serialNo, type: String, fontWeight: 'bold' },
        { ...base, value: row.size || '-', type: String },
        { ...base, value: row.brandModel || '-', type: String, wrap: true },
        { ...base, value: row.dot || '-', type: String },
        { ...base, value: row.statusLabel, type: String },
        { ...base, value: row.plateNo || '-', type: String },
        { ...base, value: row.position || '-', type: String, wrap: true },
        { ...base, value: row.removalReason || '-', type: String, wrap: true },
        num(row.treadMm, row.treadAlert, '0.0'),
        num(row.treadPercent, row.treadAlert),
        num(row.runKm, row.runAlert),
        num(row.usageDays),
        num(row.lifetimeKm, row.lifetimeAlert),
        { ...base, value: row.isEstimated ? 'ใช่' : '', type: String },
        dateCell(base, row.mountedAt),
        dateCell(base, row.createdAt),
        num(row.purchasePrice, false, '#,##0.00'),
        { ...base, value: row.note, type: String, wrap: true },
      ]
    }),
  ]

  return [
    {
      data: summaryData,
      sheet: 'สรุป',
      columns: [26, 14, 4, 30, 16, 4].map((width) => ({ width })),
      showGridLines: false,
      zoomScale: 1,
    },
    {
      data: detailData,
      sheet: 'รายการยาง',
      columns: [18, 14, 26, 10, 12, 16, 18, 26, 12, 12, 16, 16, 16, 10, 14, 16, 14, 30].map((width) => ({ width })),
      stickyRowsCount: 1,
      showGridLines: false,
      orientation: 'landscape',
      zoomScale: 0.85,
    },
  ]
}

/**
 * ดาวน์โหลดไฟล์ .xlsx รายการยาง
 * @param input ข้อมูลยางและบริษัท
 */
export async function exportTiresExcel(input: TiresExportInput) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile(
    buildTiresExcelSheets(input),
    { fontFamily: 'Aptos', fontSize: 11 },
  ).toFile(exportFilename('xlsx', input.range))
}

/** escape ข้อความก่อนใส่ใน innerHTML ของหน้า PDF */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

/** แบ่งแถวเป็นหน้า — หน้าแรกมีกล่องสรุปจึงใส่แถวได้น้อยกว่า */
function chunkRows(rows: TireExportRow[]): TireExportRow[][] {
  const firstPageSize = 10
  const followingPageSize = 15
  const pages: TireExportRow[][] = [rows.slice(0, firstPageSize)]
  for (let index = firstPageSize; index < rows.length; index += followingPageSize) {
    pages.push(rows.slice(index, index + followingPageSize))
  }
  return pages
}

/**
 * สร้าง DOM ของหน้า PDF หนึ่งหน้า (วางนอกจอ) เพื่อให้ html2canvas ถ่ายภาพ
 * @param input ข้อมูลยางและบริษัท
 * @param rows แถวของหน้านี้
 * @param summary ตัวเลขสรุปทั้งรายงาน
 * @param pageNumber ลำดับหน้า เริ่มที่ 1
 * @param pageCount จำนวนหน้าทั้งหมด
 */
function createPdfPage(
  input: TiresExportInput,
  rows: TireExportRow[],
  summary: TiresExportSummary,
  pageNumber: number,
  pageCount: number,
) {
  const page = document.createElement('section')
  page.style.cssText = [
    'position:fixed',
    'left:-12000px',
    'top:0',
    'width:1120px',
    'box-sizing:border-box',
    'padding:38px 42px 30px',
    'background:#ffffff',
    'color:#0f1c2e',
    `font-family:${getComputedStyle(document.body).fontFamily}`,
  ].join(';')

  const summaryHtml = pageNumber === 1 ? `
    <div class="metrics">
      <div><span>จำนวนยางทั้งหมด</span><strong>${formatNumber(summary.total)} เส้น</strong></div>
      <div><span>บนรถ / ในคลัง / หล่อดอก / ตัดจำหน่าย</span><strong>${formatNumber(summary.mounted)} / ${formatNumber(summary.inStock)} / ${formatNumber(summary.retreading)} / ${formatNumber(summary.scrapped)}</strong></div>
      <div><span>ถึงเกณฑ์เตือน (บนรถ)</span><strong>${formatNumber(summary.alert)} เส้น</strong></div>
      <div><span>ระยะสะสมรวม</span><strong>${formatNumber(summary.totalLifetimeKm)} กม.</strong></div>
    </div>
  ` : ''

  const statusClass: Record<TireStatus, string> = {
    mounted: 'st-mounted', in_stock: 'st-stock', scrapped: 'st-scrap', retreading: 'st-retread',
  }
  const rowHtml = rows.length === 0
    ? '<tr><td colspan="9" class="empty">ไม่พบข้อมูลตามตัวกรอง</td></tr>'
    : rows.map((row) => `
      <tr>
        <td><b>${escapeHtml(row.serialNo)}</b>${row.dot ? `<br><span class="sub">DOT ${escapeHtml(row.dot)}</span>` : ''}</td>
        <td><b>${escapeHtml(row.size || '-')}</b><br><span class="sub">${escapeHtml(row.brandModel || '-')}</span></td>
        <td><span class="pill ${statusClass[row.status]}">${escapeHtml(row.statusLabel)}</span></td>
        <td>${escapeHtml(row.locationLabel)}${row.removalReason ? `<br><span class="sub">${escapeHtml(row.removalReason)}</span>` : ''}</td>
        <td class="number${row.treadAlert ? ' danger' : ''}">${row.treadMm === null ? '-' : `${escapeHtml(formatNumber(row.treadMm, 1))} มม.${row.treadPercent === null ? '' : ` (${row.treadPercent}%)`}`}</td>
        <td class="number${row.runAlert ? ' danger' : ''}">${row.runKm === null ? '-' : escapeHtml(formatNumber(row.runKm))}</td>
        <td class="number">${row.usageDays === null ? '-' : escapeHtml(formatNumber(row.usageDays))}</td>
        <td class="number${row.lifetimeAlert ? ' danger' : ''}">${row.isEstimated ? '~' : ''}${escapeHtml(formatNumber(row.lifetimeKm))}</td>
        <td>${escapeHtml(row.mountedAt ? formatThaiDate(row.mountedAt) : '-')}<br><span class="sub">รับเข้า ${escapeHtml(row.createdAt ? formatThaiDate(row.createdAt) : '-')}</span></td>
      </tr>
    `).join('')

  page.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .heading { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; }
      h1 { margin:0; font-size:25px; line-height:1.3; color:#0f1c2e; }
      .meta { margin:7px 0 0; font-size:13px; color:#5b7089; }
      .page-no { white-space:nowrap; font-size:12px; color:#8397ad; }
      .metrics { display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin:22px 0 18px; }
      .metrics div { padding:13px 15px; border:1px solid #dcefff; border-radius:10px; background:#f0f8ff; }
      .metrics span { display:block; font-size:12px; color:#5b7089; }
      .metrics strong { display:block; margin-top:5px; font-size:18px; color:#0f1c2e; }
      table { width:100%; margin-top:${pageNumber === 1 ? '0' : '22px'}; border-collapse:collapse; table-layout:fixed; }
      th { padding:9px 7px; background:#0d6ee0; color:white; font-size:11px; text-align:left; }
      td { padding:8px 7px; border-bottom:1px solid #e3edf9; font-size:11px; color:#2c405b; vertical-align:top; word-break:break-word; }
      tbody tr:nth-child(even) { background:#f7fbff; }
      .sub { color:#5b7089; font-size:10px; }
      .number { text-align:right; }
      .danger { color:#be123c; font-weight:600; }
      .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:600; }
      .st-mounted { background:#d1fae5; color:#047857; }
      .st-stock { background:#e0f2fe; color:#0369a1; }
      .st-scrap { background:#ffe4e6; color:#be123c; }
      .st-retread { background:#fef3c7; color:#b45309; }
      .empty { padding:42px; text-align:center; color:#8397ad; }
      .footer { margin-top:13px; text-align:right; font-size:10px; color:#8397ad; }
    </style>
    <div class="heading">
      <div>
        <h1>รายการคลังยาง</h1>
        <p class="meta">${escapeHtml(metaLabel(input, new Date()))}</p>
      </div>
      <span class="page-no">หน้า ${pageNumber} / ${pageCount}</span>
    </div>
    ${summaryHtml}
    <table>
      <colgroup>
        <col style="width:12%"><col style="width:15%"><col style="width:9%"><col style="width:20%">
        <col style="width:11%"><col style="width:9%"><col style="width:7%"><col style="width:8%"><col style="width:9%">
      </colgroup>
      <thead><tr>
        <th>เลขยาง</th><th>ขนาด / ยี่ห้อ รุ่น</th><th>สถานะ</th><th>ตำแหน่งปัจจุบัน</th>
        <th>ดอกยาง</th><th>ระยะรอบล่าสุด</th><th>ใช้งาน (วัน)</th><th>ระยะสะสม</th><th>วันที่ติดตั้ง</th>
      </tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
    <div class="footer">Dream Tire Management · ${formatNumber(input.tires.length)} เส้น · ตัวเลขที่มี ~ รวมค่าประมาณ</div>
  `
  document.body.appendChild(page)
  return page
}

/**
 * ดาวน์โหลด PDF แนวนอน โดยถ่ายภาพจาก DOM เพื่อให้ตัวอักษรภาษาไทยแสดงถูกต้อง
 * @param input ข้อมูลยางและบริษัท
 */
export async function exportTiresPdf(input: TiresExportInput) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  await document.fonts.ready

  const rows = toTireExportRows(input)
  const summary = summarizeTireRows(rows)
  const pages = chunkRows(rows)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  for (let index = 0; index < pages.length; index++) {
    const page = createPdfPage(input, pages[index], summary, index + 1, pages.length)
    try {
      const canvas = await html2canvas(page, {
        backgroundColor: '#ffffff',
        logging: false,
        scale: 1.5,
        useCORS: true,
      })
      const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
      if (index > 0) pdf.addPage('a4', 'landscape')
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, canvas.width * scale, canvas.height * scale)
    } finally {
      page.remove()
    }
  }

  pdf.save(exportFilename('pdf', input.range))
}
