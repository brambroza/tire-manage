import { positionLabel } from '@/lib/axle-layouts'
import { tireBrandModelLabel, tireSizeLabel, tireSpecLabel } from '@/lib/tire-display'
import { formatNumber, formatThaiDate, todayISO } from '@/lib/utils'
import { summarizeRemovalRows, type DateRange, type RemovalReportRow } from './removal-report-types'
import type { Cell, Row, Sheet, SheetData } from 'write-excel-file/browser'

interface RemovalExportInput {
  companyName: string
  /** ข้อความตัวกรองที่ใช้ (สาเหตุ + ช่วงวันที่) สำหรับหัวรายงาน */
  filterLabel: string
  /** ช่วงวันที่ที่กรอง — ใช้ตั้งชื่อไฟล์ (ไม่ส่งมา = ทุกช่วงเวลา) */
  range?: DateRange
  rows: RemovalReportRow[]
}

const BRAND = '#0D6EE0'
const BRAND_LIGHT = '#F0F8FF'
const INK = '#0F1C2E'
const MUTED = '#5B7089'
const LINE = '#E3EDF9'

/**
 * ชื่อไฟล์ส่งออก — ใส่ช่วงวันที่ที่กรองไว้ด้วยเพื่อให้แยกไฟล์ได้เมื่อออกหลายรอบ
 * เช่น dream-tire-removal-report_2569-08-01_2569-09-15.xlsx
 * @param extension นามสกุลไฟล์
 * @param range ช่วงวันที่ที่กรอง (ว่าง = ใช้วันที่ส่งออก)
 */
function reportFilename(extension: 'xlsx' | 'pdf', range?: DateRange) {
  const suffix =
    range && (range.from || range.to)
      ? `_${range.from || 'start'}_${range.to || todayISO()}`
      : `-${todayISO()}`
  return `dream-tire-removal-report${suffix}.${extension}`
}

/** สร้างไฟล์ .xlsx สองชีต: สรุป และรายการที่ผ่านตัวกรอง */
export function buildRemovalReportExcelSheets(
  input: RemovalExportInput,
  exportedAt = new Date(),
): Sheet<Blob>[] {
  const summary = summarizeRemovalRows(input.rows)

  const titleRow: Row = [
    {
      value: 'รายงานสาเหตุการถอดและเปลี่ยนยาง',
      columnSpan: 8,
      height: 34,
      fontSize: 18,
      fontWeight: 'bold',
      textColor: INK,
      alignVertical: 'center',
    },
    null, null, null, null, null, null, null,
  ]
  const metaRow: Row = [
    {
      value: `${input.companyName} · ตัวกรอง: ${input.filterLabel} · ส่งออก ${formatThaiDate(exportedAt, true)}`,
      columnSpan: 8,
      height: 24,
      fontSize: 10,
      textColor: MUTED,
    },
    null, null, null, null, null, null, null,
  ]
  const metricLabel = (value: string): Cell => ({ value, textColor: MUTED, height: 25 })
  const metricValue = (value: string | number): Cell => ({
    value,
    fontWeight: 'bold',
    fontSize: 14,
    textColor: INK,
    align: 'right',
    format: typeof value === 'number' ? '#,##0' : undefined,
    height: 25,
  })
  const summaryData: SheetData = [
    titleRow,
    metaRow,
    [],
    [metricLabel('จำนวนครั้งที่ถอด'), metricValue(summary.totalEvents), null, metricLabel('จำนวนยางไม่ซ้ำ'), metricValue(summary.uniqueTires)],
    [metricLabel('ระยะรวมก่อนถอด (กม.)'), metricValue(summary.totalDistanceKm), null, metricLabel('ระยะเฉลี่ยต่อครั้ง (กม.)'), metricValue(summary.averageDistanceKm ?? '-')],
    [],
    ['สาเหตุ', 'จำนวนครั้ง', 'สัดส่วน'].map((value) => ({
      value,
      height: 25,
      fontWeight: 'bold' as const,
      textColor: '#FFFFFF',
      backgroundColor: BRAND,
      alignVertical: 'center' as const,
    })),
    ...summary.reasons.map((reason, index): Row => {
      const backgroundColor = index % 2 === 1 ? BRAND_LIGHT : '#FFFFFF'
      return [
        { value: reason.name, height: 23, backgroundColor, bottomBorderColor: LINE, bottomBorderStyle: 'hair' },
        { value: reason.count, format: '#,##0', align: 'right', backgroundColor, bottomBorderColor: LINE, bottomBorderStyle: 'hair' },
        { value: reason.percentage / 100, format: '0.0%', align: 'right', backgroundColor, bottomBorderColor: LINE, bottomBorderStyle: 'hair' },
      ]
    }),
  ]

  const headers = [
    'วันที่', 'เลขยาง', 'ขนาด / ยี่ห้อ รุ่น', 'ทะเบียนรถ', 'ตำแหน่ง',
    'เลขไมล์รถ (กม.)', 'ระยะรอบนี้ (กม.)', 'ดอกยาง (มม.)', 'สาเหตุ', 'หมายเหตุ',
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
    ...input.rows.map((row, index): Row => {
      const backgroundColor = index % 2 === 1 ? BRAND_LIGHT : '#FFFFFF'
      const base = {
        height: 24,
        backgroundColor,
        bottomBorderColor: LINE,
        bottomBorderStyle: 'hair' as const,
        alignVertical: 'center' as const,
      }
      return [
        { ...base, value: new Date(row.eventDate), type: Date, format: 'dd/mm/yyyy' },
        { ...base, value: row.serialNo, type: String },
        {
          ...base,
          value: tireSpecLabel(
            { size: row.size, brandName: row.brandName, modelName: row.modelName },
            { sizeFallback: '-', brandModelFallback: '-' },
          ),
          wrap: true,
        },
        { ...base, value: [row.plateNo, row.province].filter(Boolean).join(' · ') || '-', wrap: true },
        { ...base, value: positionLabel(row.positionCode, row.axleType), wrap: true },
        { ...base, value: row.odometer, format: '#,##0', align: 'right' },
        row.distanceKm === null ? { ...base, value: '-' } : { ...base, value: row.distanceKm, format: '#,##0', align: 'right' },
        row.treadMm === null ? { ...base, value: '-' } : { ...base, value: row.treadMm, format: '0.0', align: 'right' },
        { ...base, value: row.reasonName ?? 'ไม่ระบุสาเหตุ', wrap: true },
        { ...base, value: row.note ?? '', wrap: true },
      ]
    }),
  ]

  return [
    {
      data: summaryData,
      sheet: 'สรุป',
      columns: [24, 16, 4, 24, 16, 4, 16, 16].map((width) => ({ width })),
      showGridLines: false,
      zoomScale: 1,
    },
    {
      data: detailData,
      sheet: 'รายการเปลี่ยนยาง',
      columns: [15, 20, 28, 20, 24, 18, 20, 17, 24, 34].map((width) => ({ width })),
      stickyRowsCount: 1,
      showGridLines: false,
      orientation: 'landscape',
      zoomScale: 0.9,
    },
  ]
}

/** สร้างไฟล์ .xlsx สองชีต: สรุป และรายการที่ผ่านตัวกรอง */
export async function exportRemovalReportExcel(input: RemovalExportInput) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile(
    buildRemovalReportExcelSheets(input),
    { fontFamily: 'Aptos', fontSize: 11 },
  ).toFile(reportFilename('xlsx', input.range))
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function chunkRows(rows: RemovalReportRow[]): RemovalReportRow[][] {
  const firstPageSize = 8
  const followingPageSize = 16
  const pages: RemovalReportRow[][] = [rows.slice(0, firstPageSize)]
  for (let index = firstPageSize; index < rows.length; index += followingPageSize) {
    pages.push(rows.slice(index, index + followingPageSize))
  }
  return pages
}

function createPdfPage(
  input: RemovalExportInput,
  rows: RemovalReportRow[],
  pageNumber: number,
  pageCount: number,
) {
  const summary = summarizeRemovalRows(input.rows)
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
      <div><span>จำนวนครั้งที่ถอด</span><strong>${formatNumber(summary.totalEvents)} ครั้ง</strong></div>
      <div><span>จำนวนยางไม่ซ้ำ</span><strong>${formatNumber(summary.uniqueTires)} เส้น</strong></div>
      <div><span>ระยะรวมก่อนถอด</span><strong>${formatNumber(summary.totalDistanceKm)} กม.</strong></div>
      <div><span>ระยะเฉลี่ยต่อครั้ง</span><strong>${summary.averageDistanceKm === null ? '-' : `${formatNumber(summary.averageDistanceKm)} กม.`}</strong></div>
    </div>
    <div class="reasons">
      ${summary.reasons.slice(0, 6).map((reason) => `
        <span>${escapeHtml(reason.name)} <b>${formatNumber(reason.count)}</b> (${formatNumber(reason.percentage, 1)}%)</span>
      `).join('')}
    </div>
  ` : ''

  const rowHtml = rows.length === 0
    ? '<tr><td colspan="9" class="empty">ไม่พบข้อมูลตามตัวกรอง</td></tr>'
    : rows.map((row) => `
      <tr>
        <td>${escapeHtml(formatThaiDate(row.eventDate))}</td>
        <td><b>${escapeHtml(row.serialNo)}</b></td>
        <td><b>${escapeHtml(tireSizeLabel(row.size, '-'))}</b><br><span class="tire-detail">${escapeHtml(tireBrandModelLabel(row.brandName, row.modelName, '-'))}</span></td>
        <td>${escapeHtml(row.plateNo ?? '-')}</td>
        <td>${escapeHtml(positionLabel(row.positionCode, row.axleType))}</td>
        <td class="number">${escapeHtml(formatNumber(row.odometer))}</td>
        <td class="number">${row.distanceKm === null ? '-' : escapeHtml(formatNumber(row.distanceKm))}</td>
        <td class="number">${row.treadMm === null ? '-' : escapeHtml(formatNumber(row.treadMm, 1))}</td>
        <td>${escapeHtml(row.reasonName ?? 'ไม่ระบุสาเหตุ')}</td>
      </tr>
    `).join('')

  page.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .heading { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; }
      h1 { margin:0; font-size:25px; line-height:1.3; color:#0f1c2e; }
      .meta { margin:7px 0 0; font-size:13px; color:#5b7089; }
      .page-no { white-space:nowrap; font-size:12px; color:#8397ad; }
      .metrics { display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-top:22px; }
      .metrics div { padding:13px 15px; border:1px solid #dcefff; border-radius:10px; background:#f0f8ff; }
      .metrics span { display:block; font-size:12px; color:#5b7089; }
      .metrics strong { display:block; margin-top:5px; font-size:18px; color:#0f1c2e; }
      .reasons { display:flex; flex-wrap:wrap; gap:7px; margin:13px 0 18px; }
      .reasons span { padding:5px 9px; border-radius:999px; background:#f1f5f9; font-size:11px; color:#2c405b; }
      table { width:100%; margin-top:${pageNumber === 1 ? '0' : '22px'}; border-collapse:collapse; table-layout:fixed; }
      th { padding:9px 7px; background:#0d6ee0; color:white; font-size:11px; text-align:left; }
      td { padding:8px 7px; border-bottom:1px solid #e3edf9; font-size:11px; color:#2c405b; vertical-align:top; word-break:break-word; }
      tbody tr:nth-child(even) { background:#f7fbff; }
      .tire-detail { color:#5b7089; font-size:10px; }
      .number { text-align:right; }
      .empty { padding:42px; text-align:center; color:#8397ad; }
      .footer { margin-top:13px; text-align:right; font-size:10px; color:#8397ad; }
    </style>
    <div class="heading">
      <div>
        <h1>รายงานสาเหตุการถอดและเปลี่ยนยาง</h1>
        <p class="meta">${escapeHtml(input.companyName)} · ตัวกรอง: ${escapeHtml(input.filterLabel)} · ส่งออก ${escapeHtml(formatThaiDate(new Date(), true))}</p>
      </div>
      <span class="page-no">หน้า ${pageNumber} / ${pageCount}</span>
    </div>
    ${summaryHtml}
    <table>
      <colgroup>
        <col style="width:10%"><col style="width:11%"><col style="width:15%"><col style="width:10%"><col style="width:14%">
        <col style="width:10%"><col style="width:10%"><col style="width:8%"><col style="width:12%">
      </colgroup>
      <thead><tr><th>วันที่</th><th>เลขยาง</th><th>ขนาด / ยี่ห้อ รุ่น</th><th>รถ</th><th>ตำแหน่ง</th><th>เลขไมล์</th><th>ระยะรอบนี้</th><th>ดอกยาง</th><th>สาเหตุ</th></tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
    <div class="footer">Dream Tire Management · ${formatNumber(input.rows.length)} รายการ</div>
  `
  document.body.appendChild(page)
  return page
}

/** สร้าง PDF แนวนอนด้วยภาพจาก DOM เพื่อให้ตัวอักษรภาษาไทยแสดงได้ครบถ้วน */
export async function exportRemovalReportPdf(input: RemovalExportInput) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  await document.fonts.ready

  const pages = chunkRows(input.rows)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  for (let index = 0; index < pages.length; index++) {
    const page = createPdfPage(input, pages[index], index + 1, pages.length)
    try {
      const canvas = await html2canvas(page, {
        backgroundColor: '#ffffff',
        logging: false,
        scale: 1.5,
        useCORS: true,
      })
      const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
      const imageWidth = canvas.width * scale
      const imageHeight = canvas.height * scale
      if (index > 0) pdf.addPage('a4', 'landscape')
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, imageWidth, imageHeight)
    } finally {
      page.remove()
    }
  }

  pdf.save(reportFilename('pdf', input.range))
}
