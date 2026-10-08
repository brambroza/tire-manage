/**
 * ส่งออกรายงานรถและการตรวจยางเป็น Excel / PDF — แยกตามการ์ด (จำนวนรถ, ไม่ได้ตรวจนาน, ดอกยางต่ำ)
 * แนวทางเดียวกับ removal-report-export.ts: Excel ด้วย write-excel-file, PDF วาด DOM ซ่อนแล้วแปลงเป็นภาพ
 * เพื่อให้ตัวอักษรไทยแสดงครบ
 */
import { tireBrandModelLabel } from '@/lib/tire-display'
import { formatNumber, formatThaiDate } from '@/lib/utils'
import { NO_BRANCH_LABEL, type BranchMatrix, type LowTreadSummary, type StaleSummary } from './fleet-report'
import type { Cell, Row, Sheet, SheetData } from 'write-excel-file/browser'

/** การ์ดที่ส่งออกได้ */
export type FleetExportSection = 'vehicles' | 'stale' | 'low-tread'

/** ข้อมูลหัวรายงานและชื่อไฟล์ */
export interface FleetExportMeta {
  companyName: string
  /** ข้อความตัวกรอง เช่น "ตุลาคม 2569 · ทุกสาขา · ทุกประเภทรถ" */
  filterLabel: string
  /** ส่วนของชื่อไฟล์จากสาขา (จาก branchFileSlug) */
  branchSlug: string
  /** เดือนที่เลือกแบบ YYYYMM สำหรับชื่อไฟล์ */
  yyyymm: string
}

export interface FleetExportInput {
  meta: FleetExportMeta
  matrix: BranchMatrix
  stale: StaleSummary
  lowTread: LowTreadSummary
}

/** เซลล์ในตารางส่งออก — number จะถูกจัดรูปแบบตามคอลัมน์ */
type ExportCell = string | number | null

/** ตารางกลางที่ทั้ง Excel และ PDF ใช้ร่วมกัน */
interface ExportTable {
  sheet: string
  title: string
  headers: string[]
  /** ความกว้างคอลัมน์ใน Excel (หน่วยตัวอักษร) */
  excelWidths: number[]
  /** ความกว้างคอลัมน์ใน PDF (%) */
  pdfWidths: number[]
  /** รูปแบบตัวเลขต่อคอลัมน์ (undefined = ข้อความ) */
  formats: Array<string | undefined>
  rows: ExportCell[][]
  /** แถวสุดท้ายเป็นแถวรวม (ตัวหนา) */
  hasTotalRow: boolean
  summary: Array<{ label: string; value: string }>
}

const BRAND = '#0D6EE0'
const BRAND_LIGHT = '#F0F8FF'
const INK = '#0F1C2E'
const MUTED = '#5B7089'
const LINE = '#E3EDF9'

/**
 * ชื่อไฟล์ส่งออก เช่น fleet-report-vehicles-all-202610.xlsx
 * @param section การ์ดที่ส่งออก
 * @param meta ข้อมูลสาขา/เดือน
 * @param extension นามสกุลไฟล์
 */
export function fleetReportFilename(section: FleetExportSection, meta: FleetExportMeta, extension: 'xlsx' | 'pdf') {
  return `fleet-report-${section}-${meta.branchSlug}-${meta.yyyymm}.${extension}`
}

/**
 * แปลงข้อมูลของการ์ดเป็นตารางกลาง
 * @param section การ์ดที่ส่งออก
 * @param input ข้อมูลทั้งหมดของรายงาน
 */
export function buildFleetExportTable(section: FleetExportSection, input: FleetExportInput): ExportTable {
  if (section === 'vehicles') {
    const { columns, rows, total } = input.matrix
    const toRow = (r: typeof total): ExportCell[] => [
      r.label,
      ...columns.map((c) => r.byType[c.code] ?? 0),
      r.total,
      r.mountedTires,
      r.alertTires,
    ]
    const typeWidth = 100 / (columns.length + 4)
    return {
      sheet: 'จำนวนรถ',
      title: 'จำนวนรถตามสาขาและประเภทรถ',
      headers: ['สาขา', ...columns.map((c) => c.name), 'รวม (คัน)', 'ยางบนรถ (เส้น)', 'ถึงเกณฑ์เตือน (เส้น)'],
      excelWidths: [26, ...columns.map(() => 16), 14, 16, 20],
      pdfWidths: [typeWidth * 1.6, ...columns.map(() => typeWidth * 0.9), typeWidth, typeWidth, typeWidth * 1.1],
      formats: [undefined, ...columns.map(() => '#,##0'), '#,##0', '#,##0', '#,##0'],
      rows: [...rows.map(toRow), toRow(total)],
      hasTotalRow: true,
      summary: [
        { label: 'รถทั้งหมด', value: `${formatNumber(total.total)} คัน` },
        { label: 'ยางบนรถ', value: `${formatNumber(total.mountedTires)} เส้น` },
        { label: 'ถึงเกณฑ์เตือน', value: `${formatNumber(total.alertTires)} เส้น` },
      ],
    }
  }

  if (section === 'stale') {
    const { rows, over60, between31And60, never } = input.stale
    return {
      sheet: 'ไม่ได้ตรวจนาน',
      title: 'รถที่ไม่ได้ตรวจยางนาน',
      headers: ['ทะเบียน', 'จังหวัด', 'สาขา', 'ประเภทรถ', 'ตรวจล่าสุด', 'จำนวนวัน', 'เลขไมล์ล่าสุด (กม.)'],
      excelWidths: [16, 16, 22, 22, 16, 12, 20],
      pdfWidths: [13, 12, 18, 18, 14, 10, 15],
      formats: [undefined, undefined, undefined, undefined, undefined, '#,##0', '#,##0'],
      rows: rows.map((r) => [
        r.plateNo,
        r.province,
        r.branch ?? NO_BRANCH_LABEL,
        r.axleTypeName,
        r.lastInspected ? formatThaiDate(r.lastInspected) : 'ไม่เคยบันทึก',
        r.days,
        r.mileage,
      ]),
      hasTotalRow: false,
      summary: [
        { label: 'เกิน 60 วัน', value: `${formatNumber(over60)} คัน` },
        { label: '31–60 วัน', value: `${formatNumber(between31And60)} คัน` },
        { label: 'ไม่เคยบันทึก', value: `${formatNumber(never)} คัน` },
      ],
    }
  }

  const { rows, low, mid } = input.lowTread
  return {
    sheet: 'ดอกยางต่ำ',
    title: 'ยางที่ดอกเหลือไม่เกิน 5 มม.',
    headers: ['ทะเบียน', 'จังหวัด', 'สาขา', 'ตำแหน่ง', 'ซีรีย์', 'ยี่ห้อ / รุ่น', 'ขนาด', 'ดอกเหลือ (มม.)', 'ระยะรอบนี้ (กม.)'],
    excelWidths: [14, 14, 20, 20, 20, 24, 16, 14, 18],
    pdfWidths: [10, 9, 13, 13, 12, 15, 10, 8, 10],
    formats: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, '0.0', '#,##0'],
    rows: rows.map((r) => [
      r.plateNo,
      r.province,
      r.branch ?? NO_BRANCH_LABEL,
      r.positionLabel,
      r.serialNo,
      tireBrandModelLabel(r.brandName, r.modelName, '-'),
      r.size ?? '-',
      r.treadMm,
      r.runKm,
    ]),
    hasTotalRow: false,
    summary: [
      { label: '0–3 มม.', value: `${formatNumber(low.tires)} เส้น / ${formatNumber(low.vehicles)} คัน` },
      { label: '3–5 มม.', value: `${formatNumber(mid.tires)} เส้น / ${formatNumber(mid.vehicles)} คัน` },
    ],
  }
}

/**
 * สร้างชีต Excel 1 ชีตของการ์ดที่เลือก
 * @param section การ์ดที่ส่งออก
 * @param input ข้อมูลรายงาน
 * @param exportedAt เวลาที่ส่งออก (ใส่ได้เพื่อทดสอบ)
 */
export function buildFleetExcelSheets(
  section: FleetExportSection,
  input: FleetExportInput,
  exportedAt = new Date(),
): Sheet<Blob>[] {
  const table = buildFleetExportTable(section, input)
  const span = table.headers.length
  const pad = (n: number) => Array.from({ length: n }, () => null)

  const titleRow: Row = [
    { value: table.title, columnSpan: span, height: 34, fontSize: 18, fontWeight: 'bold', textColor: INK, alignVertical: 'center' },
    ...pad(span - 1),
  ]
  const metaRow: Row = [
    {
      value: `${input.meta.companyName} · ${input.meta.filterLabel} · ส่งออก ${formatThaiDate(exportedAt, true)}`,
      columnSpan: span,
      height: 24,
      fontSize: 10,
      textColor: MUTED,
    },
    ...pad(span - 1),
  ]
  const summaryRow: Row = [
    { value: table.summary.map((s) => `${s.label}: ${s.value}`).join('   ·   '), columnSpan: span, height: 24, fontWeight: 'bold', textColor: INK },
    ...pad(span - 1),
  ]
  const headerRow: Row = table.headers.map((value) => ({
    value,
    height: 29,
    fontWeight: 'bold' as const,
    textColor: '#FFFFFF',
    backgroundColor: BRAND,
    alignVertical: 'center' as const,
    wrap: true,
  }))

  const bodyRows: Row[] = table.rows.map((row, index): Row => {
    const isTotal = table.hasTotalRow && index === table.rows.length - 1
    const backgroundColor = isTotal ? '#E6F0FC' : index % 2 === 1 ? BRAND_LIGHT : '#FFFFFF'
    const base: Partial<Cell> = {
      height: 24,
      backgroundColor,
      bottomBorderColor: LINE,
      bottomBorderStyle: 'hair',
      alignVertical: 'center',
      fontWeight: isTotal ? 'bold' : undefined,
    }
    return row.map((cell, col): Cell => {
      if (typeof cell === 'number') return { ...base, value: cell, type: Number, format: table.formats[col] ?? '#,##0', align: 'right' } as Cell
      return { ...base, value: cell ?? '-', type: String, wrap: true } as Cell
    })
  })

  const data: SheetData = [titleRow, metaRow, summaryRow, [], headerRow, ...bodyRows]
  return [
    {
      data,
      sheet: table.sheet,
      columns: table.excelWidths.map((width) => ({ width })),
      stickyRowsCount: 5,
      showGridLines: false,
      orientation: 'landscape',
      zoomScale: 0.9,
    },
  ]
}

/**
 * ดาวน์โหลดไฟล์ .xlsx ของการ์ดที่เลือก
 * @param section การ์ดที่ส่งออก
 * @param input ข้อมูลรายงาน
 */
export async function exportFleetExcel(section: FleetExportSection, input: FleetExportInput) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile(
    buildFleetExcelSheets(section, input),
    { fontFamily: 'Aptos', fontSize: 11 },
  ).toFile(fleetReportFilename(section, input.meta, 'xlsx'))
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

/** แบ่งแถวเป็นหน้า — หน้าแรกมีสรุปจึงใส่แถวได้น้อยกว่า */
function chunkRows<T>(rows: T[]): T[][] {
  const firstPageSize = 16
  const followingPageSize = 22
  const pages: T[][] = [rows.slice(0, firstPageSize)]
  for (let index = firstPageSize; index < rows.length; index += followingPageSize) {
    pages.push(rows.slice(index, index + followingPageSize))
  }
  return pages
}

/** ข้อความของเซลล์ใน PDF (ตัวเลขจัดรูปแบบตาม format ของคอลัมน์) */
function pdfCellText(cell: ExportCell, format: string | undefined): string {
  if (cell === null) return '-'
  if (typeof cell === 'number') return formatNumber(cell, format === '0.0' ? 1 : 0)
  return cell
}

/** สร้าง DOM ของหน้า PDF 1 หน้า (ซ่อนนอกจอ) — ผู้เรียกต้อง remove() เองเมื่อเสร็จ */
function createPdfPage(
  table: ExportTable,
  meta: FleetExportMeta,
  rows: ExportCell[][],
  pageNumber: number,
  pageCount: number,
  totalRows: number,
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

  const summaryHtml = pageNumber === 1
    ? `<div class="metrics">${table.summary.map((s) => `<div><span>${escapeHtml(s.label)}</span><strong>${escapeHtml(s.value)}</strong></div>`).join('')}</div>`
    : ''

  const isLastPage = pageNumber === pageCount
  const rowHtml = rows.length === 0
    ? `<tr><td colspan="${table.headers.length}" class="empty">ไม่พบข้อมูลตามตัวกรอง</td></tr>`
    : rows.map((row, index) => {
      const isTotal = table.hasTotalRow && isLastPage && index === rows.length - 1
      return `<tr class="${isTotal ? 'total' : ''}">${row.map((cell, col) => {
        const numeric = table.formats[col] !== undefined
        return `<td class="${numeric ? 'number' : ''}">${escapeHtml(pdfCellText(cell, table.formats[col]))}</td>`
      }).join('')}</tr>`
    }).join('')

  page.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .heading { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; }
      h1 { margin:0; font-size:25px; line-height:1.3; color:#0f1c2e; }
      .meta { margin:7px 0 0; font-size:13px; color:#5b7089; }
      .page-no { white-space:nowrap; font-size:12px; color:#8397ad; }
      .metrics { display:flex; flex-wrap:wrap; gap:10px; margin:22px 0 18px; }
      .metrics div { min-width:200px; padding:13px 15px; border:1px solid #dcefff; border-radius:10px; background:#f0f8ff; }
      .metrics span { display:block; font-size:12px; color:#5b7089; }
      .metrics strong { display:block; margin-top:5px; font-size:18px; color:#0f1c2e; }
      table { width:100%; margin-top:${pageNumber === 1 ? '0' : '22px'}; border-collapse:collapse; table-layout:fixed; }
      th { padding:9px 7px; background:#0d6ee0; color:white; font-size:11px; text-align:left; }
      td { padding:8px 7px; border-bottom:1px solid #e3edf9; font-size:11px; color:#2c405b; vertical-align:top; word-break:break-word; }
      tbody tr:nth-child(even) { background:#f7fbff; }
      tbody tr.total td { background:#e6f0fc; font-weight:700; color:#0f1c2e; }
      .number { text-align:right; }
      .empty { padding:42px; text-align:center; color:#8397ad; }
      .footer { margin-top:13px; text-align:right; font-size:10px; color:#8397ad; }
    </style>
    <div class="heading">
      <div>
        <h1>${escapeHtml(table.title)}</h1>
        <p class="meta">${escapeHtml(meta.companyName)} · ${escapeHtml(meta.filterLabel)} · ส่งออก ${escapeHtml(formatThaiDate(new Date(), true))}</p>
      </div>
      <span class="page-no">หน้า ${pageNumber} / ${pageCount}</span>
    </div>
    ${summaryHtml}
    <table>
      <colgroup>${table.pdfWidths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>
      <thead><tr>${table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
    <div class="footer">Dream Tire Management · ${formatNumber(totalRows)} รายการ</div>
  `
  document.body.appendChild(page)
  return page
}

/**
 * ดาวน์โหลด PDF (A4 แนวนอน) ของการ์ดที่เลือก — วาด DOM แล้วแปลงเป็นภาพเพื่อให้ตัวอักษรไทยครบถ้วน
 * @param section การ์ดที่ส่งออก
 * @param input ข้อมูลรายงาน
 */
export async function exportFleetPdf(section: FleetExportSection, input: FleetExportInput) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  await document.fonts.ready

  const table = buildFleetExportTable(section, input)
  const pages = chunkRows(table.rows)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  for (let index = 0; index < pages.length; index++) {
    const page = createPdfPage(table, input.meta, pages[index], index + 1, pages.length, table.rows.length)
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

  pdf.save(fleetReportFilename(section, input.meta, 'pdf'))
}
