import { formatNumber, formatThaiDate, todayISO } from '@/lib/utils'
import { tireBrandModelLabel, tireSizeLabel } from '@/lib/tire-display'
import {
  performanceModelLabel,
  summarizeTirePerformance,
  type TirePerformanceRow,
} from './tire-performance-types'
import type { Cell, Row, Sheet, SheetData } from 'write-excel-file/browser'

export interface TirePerformanceExportInput {
  filterLabel: string
  rows: TirePerformanceRow[]
}

const BRAND = '#0D6EE0'
const BRAND_LIGHT = '#F0F8FF'
const INK = '#0F1C2E'
const MUTED = '#5B7089'
const LINE = '#E3EDF9'
const EMERALD = '#047857'
const EMERALD_LIGHT = '#ECFDF5'
const ROSE = '#BE123C'
const ROSE_LIGHT = '#FFF1F2'

export function tirePerformanceFilename(extension: 'xlsx' | 'pdf') {
  return `dream-tire-performance-${todayISO()}.${extension}`
}

const tableHeader = (value: string): Cell => ({
  value,
  height: 29,
  fontWeight: 'bold',
  textColor: '#FFFFFF',
  backgroundColor: BRAND,
  alignVertical: 'center',
  wrap: true,
})

const dataCell = (value: string | number | Date, index: number): Cell => ({
  value,
  height: 24,
  backgroundColor: index % 2 === 1 ? BRAND_LIGHT : '#FFFFFF',
  bottomBorderColor: LINE,
  bottomBorderStyle: 'hair',
  alignVertical: 'center',
})

/** สร้าง workbook 3 ชีต: ภาพรวม, อันดับรุ่น และรายการเปลี่ยนยาง */
export function buildTirePerformanceExcelSheets(
  input: TirePerformanceExportInput,
  exportedAt = new Date(),
): Sheet<Blob>[] {
  const summary = summarizeTirePerformance(input.rows)
  const titleRow: Row = [
    {
      value: 'รายงานประสิทธิภาพยางและสาเหตุการเปลี่ยน',
      columnSpan: 9,
      height: 36,
      fontSize: 18,
      fontWeight: 'bold',
      textColor: INK,
      alignVertical: 'center',
    },
    null, null, null, null, null, null, null, null,
  ]
  const metaRow: Row = [
    {
      value: `${input.filterLabel} · ส่งออก ${formatThaiDate(exportedAt, true)}`,
      columnSpan: 9,
      height: 25,
      fontSize: 10,
      textColor: MUTED,
    },
    null, null, null, null, null, null, null, null,
  ]
  const metricLabel = (value: string): Cell => ({
    value,
    columnSpan: 2,
    height: 24,
    textColor: MUTED,
    backgroundColor: BRAND_LIGHT,
    alignVertical: 'center',
  })
  const metricValue = (value: string | number): Cell => ({
    value,
    columnSpan: 2,
    height: 30,
    fontSize: 15,
    fontWeight: 'bold',
    textColor: INK,
    backgroundColor: BRAND_LIGHT,
    format: typeof value === 'number' ? '#,##0' : undefined,
    alignVertical: 'center',
  })

  const summaryData: SheetData = [
    titleRow,
    metaRow,
    [],
    [
      metricLabel('เหตุการณ์เปลี่ยนยาง'), null,
      metricLabel('รายการที่มีระยะ'), null,
      metricLabel('ระยะเฉลี่ยต่อรอบ (กม.)'), null,
      metricLabel('รุ่นที่วิเคราะห์ได้'), null,
    ],
    [
      metricValue(summary.totalEvents), null,
      metricValue(summary.measuredEvents), null,
      metricValue(summary.averageDistanceKm ?? '-'), null,
      metricValue(summary.uniqueModels), null,
    ],
    [],
    [
      { value: 'รุ่นที่ใช้งานได้นานที่สุด', columnSpan: 4, height: 25, fontWeight: 'bold', textColor: EMERALD, backgroundColor: EMERALD_LIGHT },
      null, null, null,
      { value: 'รุ่นที่ใช้งานได้สั้นที่สุด', columnSpan: 4, height: 25, fontWeight: 'bold', textColor: ROSE, backgroundColor: ROSE_LIGHT },
      null, null, null,
    ],
    [
      {
        value: summary.longestModel
          ? `${performanceModelLabel(summary.longestModel)} · เฉลี่ย ${formatNumber(summary.longestModel.averageDistanceKm)} กม. · ${summary.longestModel.measuredCount} รอบ`
          : 'ยังไม่มีข้อมูล',
        columnSpan: 4,
        height: 34,
        wrap: true,
        backgroundColor: EMERALD_LIGHT,
        textColor: INK,
      },
      null, null, null,
      {
        value: summary.shortestModel
          ? `${performanceModelLabel(summary.shortestModel)} · เฉลี่ย ${formatNumber(summary.shortestModel.averageDistanceKm)} กม. · ${summary.shortestModel.measuredCount} รอบ · รอบสั้นสุด: ${summary.shortestModel.shortestReason}`
          : 'ยังไม่มีข้อมูล',
        columnSpan: 4,
        height: 34,
        wrap: true,
        backgroundColor: ROSE_LIGHT,
        textColor: INK,
      },
      null, null, null,
    ],
    [],
    ['สาเหตุ', 'จำนวนครั้ง', 'สัดส่วน', 'รายการมีระยะ', 'ระยะเฉลี่ย (กม.)'].map(tableHeader),
    ...summary.reasons.map((reason, index): Row => [
      { ...dataCell(reason.name, index), wrap: true },
      { ...dataCell(reason.count, index), format: '#,##0', align: 'right' },
      { ...dataCell(reason.percentage / 100, index), format: '0.0%', align: 'right' },
      { ...dataCell(reason.measuredCount, index), format: '#,##0', align: 'right' },
      reason.averageDistanceKm === null
        ? dataCell('-', index)
        : { ...dataCell(reason.averageDistanceKm, index), format: '#,##0', align: 'right' },
    ]),
  ]

  const modelHeaders = [
    'อันดับ', 'ขนาด', 'ยี่ห้อ', 'รุ่น', 'จำนวนรอบที่มีระยะ',
    'ระยะเฉลี่ย (กม.)', 'ระยะสูงสุด (กม.)', 'ระยะต่ำสุด (กม.)', 'สาเหตุหลัก',
  ]
  const modelData: SheetData = [
    modelHeaders.map(tableHeader),
    ...summary.models.map((model, index): Row => [
      { ...dataCell(index + 1, index), format: '#,##0', align: 'center' },
      dataCell(model.size ?? '-', index),
      dataCell(model.brandName, index),
      dataCell(model.modelName, index),
      { ...dataCell(model.measuredCount, index), format: '#,##0', align: 'right' },
      { ...dataCell(model.averageDistanceKm, index), format: '#,##0', align: 'right' },
      { ...dataCell(model.maximumDistanceKm, index), format: '#,##0', align: 'right' },
      { ...dataCell(model.minimumDistanceKm, index), format: '#,##0', align: 'right' },
      { ...dataCell(model.primaryReason, index), wrap: true },
    ]),
  ]

  const detailHeaders = [
    'วันที่', 'บริษัท', 'เลขยาง', 'ขนาด', 'ยี่ห้อ', 'รุ่น',
    'ระยะรอบนี้ (กม.)', 'ดอกยาง (มม.)', 'สาเหตุ', 'หมายเหตุ',
  ]
  const detailData: SheetData = [
    detailHeaders.map(tableHeader),
    ...input.rows.map((row, index): Row => [
      { ...dataCell(new Date(row.eventDate), index), type: Date, format: 'dd/mm/yyyy' },
      { ...dataCell(row.companyName, index), wrap: true },
      { ...dataCell(row.serialNo, index), type: String },
      dataCell(row.size ?? '-', index),
      dataCell(row.brandName ?? '-', index),
      dataCell(row.modelName ?? '-', index),
      row.distanceKm === null
        ? dataCell('-', index)
        : { ...dataCell(row.distanceKm, index), format: '#,##0', align: 'right' },
      row.treadMm === null
        ? dataCell('-', index)
        : { ...dataCell(row.treadMm, index), format: '0.0', align: 'right' },
      { ...dataCell(row.reasonName ?? 'ไม่ระบุสาเหตุ', index), wrap: true },
      { ...dataCell(row.note ?? '', index), wrap: true },
    ]),
  ]

  return [
    {
      data: summaryData,
      sheet: 'ภาพรวม',
      columns: [28, 16, 4, 28, 16, 4, 28, 16, 4].map((width) => ({ width })),
      showGridLines: false,
      zoomScale: 0.9,
    },
    {
      data: modelData,
      sheet: 'อันดับขนาดและรุ่น',
      columns: [10, 18, 22, 24, 20, 20, 20, 20, 28].map((width) => ({ width })),
      stickyRowsCount: 1,
      showGridLines: false,
      orientation: 'landscape',
      zoomScale: 0.9,
    },
    {
      data: detailData,
      sheet: 'รายการเปลี่ยนยาง',
      columns: [15, 30, 20, 18, 20, 24, 20, 17, 25, 36].map((width) => ({ width })),
      stickyRowsCount: 1,
      showGridLines: false,
      orientation: 'landscape',
      zoomScale: 0.85,
    },
  ]
}

export async function exportTirePerformanceExcel(input: TirePerformanceExportInput) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile(
    buildTirePerformanceExcelSheets(input),
    { fontFamily: 'Aptos', fontSize: 11 },
  ).toFile(tirePerformanceFilename('xlsx'))
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function createPdfPage(pageNumber: number, pageCount: number) {
  const page = document.createElement('section')
  page.style.cssText = [
    'position:fixed',
    'left:-12000px',
    'top:0',
    'width:1120px',
    'height:792px',
    'overflow:hidden',
    'box-sizing:border-box',
    'padding:34px 40px 26px',
    'background:#ffffff',
    'color:#0f1c2e',
    `font-family:${getComputedStyle(document.body).fontFamily}`,
  ].join(';')
  page.dataset.pageNumber = `${pageNumber} / ${pageCount}`
  document.body.appendChild(page)
  return page
}

const basePdfStyles = `
  * { box-sizing:border-box; }
  .heading { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; }
  h1 { margin:0; color:#0f1c2e; font-size:24px; line-height:1.3; }
  h2 { margin:0; color:#0f1c2e; font-size:14px; }
  .meta { margin:6px 0 0; color:#5b7089; font-size:12px; }
  .page-no { color:#8397ad; font-size:11px; white-space:nowrap; }
  .footer { position:absolute; right:40px; bottom:18px; color:#8397ad; font-size:9px; }
  table { width:100%; border-collapse:collapse; table-layout:fixed; }
  th { padding:8px 7px; background:#0d6ee0; color:#fff; font-size:10px; text-align:left; }
  td { padding:7px; border-bottom:1px solid #e3edf9; color:#2c405b; font-size:10px; vertical-align:top; word-break:break-word; }
  tbody tr:nth-child(even) { background:#f7fbff; }
  .number { text-align:right; }
`

function buildSummaryPdfPage(
  input: TirePerformanceExportInput,
  pageNumber: number,
  pageCount: number,
) {
  const summary = summarizeTirePerformance(input.rows)
  const page = createPdfPage(pageNumber, pageCount)
  const longest = summary.longestModel
  const shortest = summary.shortestModel
  const reasonHtml = summary.reasons.slice(0, 6).map((reason) => `
    <div class="reason-row">
      <div class="reason-line"><b>${escapeHtml(reason.name)}</b><span>${formatNumber(reason.count)} ครั้ง · ${formatNumber(reason.percentage, 1)}%</span></div>
      <div class="bar"><i style="width:${Math.max(reason.percentage, 2)}%"></i></div>
      <small>เฉลี่ย ${reason.averageDistanceKm === null ? '-' : `${formatNumber(reason.averageDistanceKm)} กม.`} · ${formatNumber(reason.measuredCount)} รอบที่มีระยะ</small>
    </div>
  `).join('')
  const modelHtml = summary.models.slice(0, 6).map((model, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><b>${escapeHtml(tireSizeLabel(model.size))}</b><br><span class="tire-detail">${escapeHtml(tireBrandModelLabel(model.brandName, model.modelName))}</span></td>
      <td class="number"><b>${formatNumber(model.averageDistanceKm)}</b></td>
      <td class="number">${formatNumber(model.maximumDistanceKm)}</td>
      <td class="number">${formatNumber(model.minimumDistanceKm)}</td>
      <td class="number">${formatNumber(model.measuredCount)}</td>
      <td>${escapeHtml(model.primaryReason)}</td>
    </tr>
  `).join('')

  page.innerHTML = `
    <style>
      ${basePdfStyles}
      .metrics { display:grid; grid-template-columns:repeat(4,1fr); margin-top:18px; border:1px solid #e3edf9; border-radius:12px; overflow:hidden; }
      .metric { padding:12px 14px; border-right:1px solid #e3edf9; }
      .metric:last-child { border-right:0; }
      .metric span { display:block; color:#5b7089; font-size:10px; }
      .metric strong { display:block; margin-top:4px; color:#0f1c2e; font-size:18px; }
      .insights { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:13px; }
      .insight { padding:13px 15px; border:1px solid; border-radius:11px; }
      .insight h2 { margin-bottom:7px; }
      .insight p { margin:3px 0; color:#2c405b; font-size:10px; }
      .insight strong { font-size:19px; }
      .long { border-color:#a7f3d0; background:#ecfdf5; }
      .long h2,.long strong { color:#047857; }
      .short { border-color:#fecdd3; background:#fff1f2; }
      .short h2,.short strong { color:#be123c; }
      .analysis { display:grid; grid-template-columns:0.75fr 1.35fr; gap:14px; margin-top:14px; }
      .panel { padding:13px; border:1px solid #e3edf9; border-radius:11px; overflow:hidden; }
      .panel-title { margin-bottom:10px; }
      .reason-row { margin-top:8px; }
      .reason-line { display:flex; justify-content:space-between; gap:10px; color:#2c405b; font-size:9px; }
      .bar { height:5px; margin-top:4px; overflow:hidden; border-radius:99px; background:#f0f8ff; }
      .bar i { display:block; height:100%; border-radius:99px; background:#1f8cf5; }
      .reason-row small { display:block; margin-top:3px; color:#8397ad; font-size:8px; }
      .models th,.models td { padding:6px 5px; font-size:8.5px; }
      .tire-detail { color:#5b7089; font-size:8px; }
    </style>
    <div class="heading">
      <div><h1>รายงานประสิทธิภาพยางและสาเหตุการเปลี่ยน</h1><p class="meta">${escapeHtml(input.filterLabel)} · ${escapeHtml(formatThaiDate(new Date(), true))}</p></div>
      <span class="page-no">หน้า ${pageNumber} / ${pageCount}</span>
    </div>
    <div class="metrics">
      <div class="metric"><span>เหตุการณ์เปลี่ยนยาง</span><strong>${formatNumber(summary.totalEvents)}</strong></div>
      <div class="metric"><span>รายการที่มีระยะ</span><strong>${formatNumber(summary.measuredEvents)}</strong></div>
      <div class="metric"><span>ระยะเฉลี่ยต่อรอบ</span><strong>${summary.averageDistanceKm === null ? '-' : `${formatNumber(summary.averageDistanceKm)} กม.`}</strong></div>
      <div class="metric"><span>รุ่นที่วิเคราะห์ได้</span><strong>${formatNumber(summary.uniqueModels)}</strong></div>
    </div>
    <div class="insights">
      <div class="insight long">
        <h2>รุ่นที่ใช้งานได้นานที่สุด</h2>
        ${longest ? `<p><b>${escapeHtml(tireSizeLabel(longest.size))}</b><br><span class="tire-detail">${escapeHtml(tireBrandModelLabel(longest.brandName, longest.modelName))}</span></p><p><strong>${formatNumber(longest.averageDistanceKm)}</strong> กม. เฉลี่ย · สูงสุด ${formatNumber(longest.maximumDistanceKm)} กม.</p><p>${formatNumber(longest.measuredCount)} รอบ · รอบยาวสุดถอดเพราะ ${escapeHtml(longest.longestReason)}</p>` : '<p>ยังไม่มีข้อมูล</p>'}
      </div>
      <div class="insight short">
        <h2>รุ่นที่ใช้งานได้สั้นที่สุด</h2>
        ${shortest ? `<p><b>${escapeHtml(tireSizeLabel(shortest.size))}</b><br><span class="tire-detail">${escapeHtml(tireBrandModelLabel(shortest.brandName, shortest.modelName))}</span></p><p><strong>${formatNumber(shortest.averageDistanceKm)}</strong> กม. เฉลี่ย · ต่ำสุด ${formatNumber(shortest.minimumDistanceKm)} กม.</p><p>${formatNumber(shortest.measuredCount)} รอบ · รอบสั้นสุดถอดเพราะ ${escapeHtml(shortest.shortestReason)}</p>` : '<p>ยังไม่มีข้อมูล</p>'}
      </div>
    </div>
    <div class="analysis">
      <section class="panel"><h2 class="panel-title">สาเหตุการเปลี่ยนยาง</h2>${reasonHtml || '<p class="meta">ยังไม่มีข้อมูล</p>'}</section>
      <section class="panel">
        <h2 class="panel-title">อันดับประสิทธิภาพตามขนาด / ยี่ห้อ รุ่น</h2>
        <table class="models"><thead><tr><th>#</th><th>ขนาด / ยี่ห้อ รุ่น</th><th>เฉลี่ย</th><th>สูงสุด</th><th>ต่ำสุด</th><th>รอบ</th><th>สาเหตุหลัก</th></tr></thead><tbody>${modelHtml || '<tr><td colspan="7">ยังไม่มีข้อมูล</td></tr>'}</tbody></table>
      </section>
    </div>
    <div class="footer">Dream Tire Management · ระยะทางเป็นค่าต่อหนึ่งรอบติดตั้ง-ถอด</div>
  `
  return page
}

function chunkRows(rows: TirePerformanceRow[], size = 16) {
  const chunks: TirePerformanceRow[][] = []
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size))
  return chunks
}

function buildDetailPdfPage(
  input: TirePerformanceExportInput,
  rows: TirePerformanceRow[],
  pageNumber: number,
  pageCount: number,
) {
  const page = createPdfPage(pageNumber, pageCount)
  const rowHtml = rows.map((row) => `
    <tr>
      <td>${escapeHtml(formatThaiDate(row.eventDate))}</td>
      <td>${escapeHtml(row.companyName)}</td>
      <td><b>${escapeHtml(row.serialNo)}</b></td>
      <td>${escapeHtml(performanceModelLabel(row))}</td>
      <td class="number">${row.distanceKm === null ? '-' : formatNumber(row.distanceKm)}</td>
      <td class="number">${row.treadMm === null ? '-' : formatNumber(row.treadMm, 1)}</td>
      <td>${escapeHtml(row.reasonName ?? 'ไม่ระบุสาเหตุ')}</td>
      <td>${escapeHtml(row.note ?? '')}</td>
    </tr>
  `).join('')

  page.innerHTML = `
    <style>
      ${basePdfStyles}
      table { margin-top:18px; }
      th,td { padding:7px 6px; font-size:9px; }
    </style>
    <div class="heading">
      <div><h1>รายการเปลี่ยนยาง</h1><p class="meta">${escapeHtml(input.filterLabel)}</p></div>
      <span class="page-no">หน้า ${pageNumber} / ${pageCount}</span>
    </div>
    <table>
      <colgroup><col style="width:9%"><col style="width:16%"><col style="width:11%"><col style="width:20%"><col style="width:10%"><col style="width:8%"><col style="width:12%"><col style="width:14%"></colgroup>
      <thead><tr><th>วันที่</th><th>บริษัท</th><th>เลขยาง</th><th>ขนาด / ยี่ห้อ รุ่น</th><th>ระยะรอบนี้</th><th>ดอกยาง</th><th>สาเหตุ</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
    <div class="footer">Dream Tire Management · ${formatNumber(input.rows.length)} รายการ</div>
  `
  return page
}

/** สร้าง PDF Blob เพื่อใช้ทั้ง Preview และ Download โดยไม่ต้องประมวลผลซ้ำ */
export async function buildTirePerformancePdf(input: TirePerformanceExportInput): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  await document.fonts.ready

  const detailChunks = chunkRows(input.rows)
  const pageCount = 1 + detailChunks.length
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  for (let index = 0; index < pageCount; index++) {
    const page = index === 0
      ? buildSummaryPdfPage(input, 1, pageCount)
      : buildDetailPdfPage(input, detailChunks[index - 1], index + 1, pageCount)
    try {
      const canvas = await html2canvas(page, {
        backgroundColor: '#ffffff',
        logging: false,
        scale: 1.6,
        useCORS: true,
      })
      if (index > 0) pdf.addPage('a4', 'landscape')
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.94),
        'JPEG',
        0,
        0,
        pageWidth,
        pageHeight,
      )
    } finally {
      page.remove()
    }
  }

  return pdf.output('blob')
}

export function downloadTirePerformancePdf(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = tirePerformanceFilename('pdf')
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
