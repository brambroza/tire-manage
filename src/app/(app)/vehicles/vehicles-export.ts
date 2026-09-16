import { getLayout, type AxleTypeLayoutSource } from '@/lib/axle-layouts'
import { formatNumber, formatThaiDate, todayISO } from '@/lib/utils'
import type { VehicleRow } from './vehicles-client'
import type { Cell, Row, Sheet, SheetData } from 'write-excel-file/browser'

/** ข้อมูลที่ใช้สร้างไฟล์ส่งออกรายการรถ */
export interface VehiclesExportInput {
  companyName: string
  /** คำค้นหาที่ใช้กรองอยู่ (ว่าง = ทั้งหมด) สำหรับหัวรายงาน */
  searchTerm?: string
  vehicles: VehicleRow[]
  /** ประเภทเพลาของบริษัท ใช้แปลงรหัสเป็นชื่อและจำนวนตำแหน่งล้อ */
  axleTypes: readonly AxleTypeLayoutSource[]
}

const BRAND = '#0D6EE0'
const BRAND_LIGHT = '#F0F8FF'
const INK = '#0F1C2E'
const MUTED = '#5B7089'
const LINE = '#E3EDF9'

/** แถวข้อมูลรถหนึ่งคันหลังแปลงค่าให้พร้อมแสดงผล (ใช้ร่วมกันทั้ง Excel และ PDF) */
interface VehicleExportRow {
  plateNo: string
  province: string
  brand: string
  model: string
  axleTypeName: string
  wheelCount: number
  mountedCount: number
  currentMileage: number
  mileageUpdatedAt: string
  frequentChangeCount: number | null
  isActive: boolean
  note: string
}

/** สรุปตัวเลขภาพรวมของรายการรถที่ส่งออก */
export interface VehiclesExportSummary {
  total: number
  active: number
  inactive: number
  frequentChange: number
  /** จำนวนคันที่ยางติดตั้งครบทุกตำแหน่ง (นับเฉพาะรถที่ใช้งานอยู่) */
  fullyMounted: number
  /** จำนวนคันที่ยางยังไม่ครบ (นับเฉพาะรถที่ใช้งานอยู่) */
  partiallyMounted: number
}

/**
 * แปลง VehicleRow เป็นแถวพร้อมส่งออก
 * @param vehicles รายการรถจากตาราง
 * @param axleTypes ประเภทเพลาสำหรับหาชื่อและจำนวนล้อ
 */
export function toVehicleExportRows(
  vehicles: VehicleRow[],
  axleTypes: readonly AxleTypeLayoutSource[],
): VehicleExportRow[] {
  return vehicles.map((v) => {
    const layout = getLayout(v.axle_type, axleTypes)
    return {
      plateNo: v.plate_no,
      province: v.province ?? '',
      brand: v.brand ?? '',
      model: v.model ?? '',
      axleTypeName: layout.name ? `${v.axle_type} · ${layout.name}` : v.axle_type,
      wheelCount: layout.wheelCount,
      mountedCount: v.mounted_count,
      currentMileage: v.current_mileage,
      mileageUpdatedAt: v.mileage_updated_at,
      frequentChangeCount: v.frequent_change_count ?? null,
      isActive: v.is_active,
      note: v.note ?? '',
    }
  })
}

/**
 * สรุปจำนวนรถตามสถานะและความครบของยาง
 * @param rows แถวที่แปลงแล้วจาก toVehicleExportRows
 */
export function summarizeVehicleRows(rows: VehicleExportRow[]): VehiclesExportSummary {
  const activeRows = rows.filter((r) => r.isActive)
  return {
    total: rows.length,
    active: activeRows.length,
    inactive: rows.length - activeRows.length,
    frequentChange: rows.filter((r) => r.frequentChangeCount !== null).length,
    fullyMounted: activeRows.filter((r) => r.mountedCount >= r.wheelCount).length,
    partiallyMounted: activeRows.filter((r) => r.mountedCount < r.wheelCount).length,
  }
}

/**
 * ชื่อไฟล์ส่งออก เช่น dream-tire-vehicles-2026-09-16.xlsx
 * @param extension นามสกุลไฟล์
 */
function exportFilename(extension: 'xlsx' | 'pdf') {
  return `dream-tire-vehicles-${todayISO()}.${extension}`
}

/** ข้อความบรรทัดรองใต้หัวรายงาน (บริษัท + ตัวกรอง + เวลาส่งออก) */
function metaLabel(input: VehiclesExportInput, exportedAt: Date) {
  const filter = input.searchTerm?.trim() ? `ค้นหา "${input.searchTerm.trim()}"` : 'รถทั้งหมด'
  return `${input.companyName} · ${filter} · ส่งออก ${formatThaiDate(exportedAt, true)}`
}

/**
 * สร้างชีต Excel สองชีต: สรุป และรายการรถ
 * @param input ข้อมูลรถและบริษัท
 * @param exportedAt เวลาที่ส่งออก (ใส่ได้เพื่อทดสอบ)
 */
export function buildVehiclesExcelSheets(
  input: VehiclesExportInput,
  exportedAt = new Date(),
): Sheet<Blob>[] {
  const rows = toVehicleExportRows(input.vehicles, input.axleTypes)
  const summary = summarizeVehicleRows(rows)

  const titleRow: Row = [
    {
      value: 'รายการรถ',
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
    {
      value: metaLabel(input, exportedAt),
      columnSpan: 6,
      height: 24,
      fontSize: 10,
      textColor: MUTED,
    },
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
    [metricLabel('จำนวนรถทั้งหมด'), metricValue(summary.total), null, metricLabel('รถเปลี่ยนยางบ่อย'), metricValue(summary.frequentChange)],
    [metricLabel('ใช้งานอยู่'), metricValue(summary.active), null, metricLabel('ยางติดตั้งครบ (คันที่ใช้งาน)'), metricValue(summary.fullyMounted)],
    [metricLabel('ปิดใช้งาน'), metricValue(summary.inactive), null, metricLabel('ยางยังไม่ครบ (คันที่ใช้งาน)'), metricValue(summary.partiallyMounted)],
  ]

  const headers = [
    'ทะเบียนรถ', 'จังหวัด', 'ยี่ห้อ', 'รุ่น', 'ประเภทเพลา', 'จำนวนตำแหน่ง',
    'ยางที่ติดตั้ง', 'เลขไมล์ล่าสุด (กม.)', 'อัปเดตไมล์ล่าสุด', 'เปลี่ยนยางบ่อย (ครั้ง)', 'สถานะ', 'หมายเหตุ',
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
      const updatedAt = new Date(row.mileageUpdatedAt)
      return [
        { ...base, value: row.plateNo, type: String, fontWeight: 'bold' },
        { ...base, value: row.province || '-', type: String },
        { ...base, value: row.brand || '-', type: String },
        { ...base, value: row.model || '-', type: String },
        { ...base, value: row.axleTypeName, type: String, wrap: true },
        { ...base, value: row.wheelCount, format: '#,##0', align: 'right' },
        { ...base, value: row.mountedCount, format: '#,##0', align: 'right' },
        { ...base, value: row.currentMileage, format: '#,##0', align: 'right' },
        Number.isNaN(updatedAt.getTime())
          ? { ...base, value: '-', type: String }
          : { ...base, value: updatedAt, type: Date, format: 'dd/mm/yyyy' },
        row.frequentChangeCount === null
          ? { ...base, value: '-', type: String, align: 'right' }
          : { ...base, value: row.frequentChangeCount, format: '#,##0', align: 'right', textColor: '#BE123C' },
        { ...base, value: row.isActive ? 'ใช้งาน' : 'ปิดใช้งาน', type: String },
        { ...base, value: row.note, type: String, wrap: true },
      ]
    }),
  ]

  return [
    {
      data: summaryData,
      sheet: 'สรุป',
      columns: [26, 14, 4, 30, 14, 4].map((width) => ({ width })),
      showGridLines: false,
      zoomScale: 1,
    },
    {
      data: detailData,
      sheet: 'รายการรถ',
      columns: [16, 16, 16, 16, 26, 14, 14, 18, 18, 18, 12, 34].map((width) => ({ width })),
      stickyRowsCount: 1,
      showGridLines: false,
      orientation: 'landscape',
      zoomScale: 0.9,
    },
  ]
}

/**
 * ดาวน์โหลดไฟล์ .xlsx รายการรถ
 * @param input ข้อมูลรถและบริษัท
 */
export async function exportVehiclesExcel(input: VehiclesExportInput) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile(
    buildVehiclesExcelSheets(input),
    { fontFamily: 'Aptos', fontSize: 11 },
  ).toFile(exportFilename('xlsx'))
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
function chunkRows(rows: VehicleExportRow[]): VehicleExportRow[][] {
  const firstPageSize = 12
  const followingPageSize = 18
  const pages: VehicleExportRow[][] = [rows.slice(0, firstPageSize)]
  for (let index = firstPageSize; index < rows.length; index += followingPageSize) {
    pages.push(rows.slice(index, index + followingPageSize))
  }
  return pages
}

/**
 * สร้าง DOM ของหน้า PDF หนึ่งหน้า (วางนอกจอ) เพื่อให้ html2canvas ถ่ายภาพ
 * @param input ข้อมูลรถและบริษัท
 * @param rows แถวของหน้านี้
 * @param summary ตัวเลขสรุปทั้งรายงาน
 * @param pageNumber ลำดับหน้า เริ่มที่ 1
 * @param pageCount จำนวนหน้าทั้งหมด
 */
function createPdfPage(
  input: VehiclesExportInput,
  rows: VehicleExportRow[],
  summary: VehiclesExportSummary,
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
      <div><span>จำนวนรถทั้งหมด</span><strong>${formatNumber(summary.total)} คัน</strong></div>
      <div><span>ใช้งานอยู่ / ปิดใช้งาน</span><strong>${formatNumber(summary.active)} / ${formatNumber(summary.inactive)}</strong></div>
      <div><span>ยางติดตั้งครบ (คันที่ใช้งาน)</span><strong>${formatNumber(summary.fullyMounted)} คัน</strong></div>
      <div><span>รถเปลี่ยนยางบ่อย</span><strong>${formatNumber(summary.frequentChange)} คัน</strong></div>
    </div>
  ` : ''

  const rowHtml = rows.length === 0
    ? '<tr><td colspan="8" class="empty">ไม่พบข้อมูล</td></tr>'
    : rows.map((row) => `
      <tr>
        <td><b>${escapeHtml(row.plateNo)}</b><br><span class="sub">${escapeHtml(row.province || '-')}</span></td>
        <td>${escapeHtml([row.brand, row.model].filter(Boolean).join(' ') || '-')}</td>
        <td>${escapeHtml(row.axleTypeName)}</td>
        <td class="number ${row.mountedCount >= row.wheelCount ? 'ok' : 'warn'}">${escapeHtml(`${row.mountedCount}/${row.wheelCount}`)}</td>
        <td class="number">${escapeHtml(formatNumber(row.currentMileage))}</td>
        <td>${escapeHtml(formatThaiDate(row.mileageUpdatedAt))}</td>
        <td class="number${row.frequentChangeCount === null ? '' : ' danger'}">${row.frequentChangeCount === null ? '-' : escapeHtml(formatNumber(row.frequentChangeCount))}</td>
        <td>${row.isActive ? '<span class="pill ok-pill">ใช้งาน</span>' : '<span class="pill off-pill">ปิดใช้งาน</span>'}</td>
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
      .ok { color:#047857; font-weight:600; }
      .warn { color:#b45309; font-weight:600; }
      .danger { color:#be123c; font-weight:600; }
      .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:600; }
      .ok-pill { background:#d1fae5; color:#047857; }
      .off-pill { background:#e2e8f0; color:#475569; }
      .empty { padding:42px; text-align:center; color:#8397ad; }
      .footer { margin-top:13px; text-align:right; font-size:10px; color:#8397ad; }
    </style>
    <div class="heading">
      <div>
        <h1>รายการรถ</h1>
        <p class="meta">${escapeHtml(metaLabel(input, new Date()))}</p>
      </div>
      <span class="page-no">หน้า ${pageNumber} / ${pageCount}</span>
    </div>
    ${summaryHtml}
    <table>
      <colgroup>
        <col style="width:14%"><col style="width:16%"><col style="width:18%"><col style="width:10%">
        <col style="width:12%"><col style="width:12%"><col style="width:9%"><col style="width:9%">
      </colgroup>
      <thead><tr>
        <th>ทะเบียนรถ</th><th>ยี่ห้อ / รุ่น</th><th>ประเภทเพลา</th><th>ยางที่ติดตั้ง</th>
        <th>เลขไมล์ล่าสุด</th><th>อัปเดตไมล์</th><th>เปลี่ยนบ่อย</th><th>สถานะ</th>
      </tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
    <div class="footer">Dream Tire Management · ${formatNumber(input.vehicles.length)} คัน</div>
  `
  document.body.appendChild(page)
  return page
}

/**
 * ดาวน์โหลด PDF แนวนอน โดยถ่ายภาพจาก DOM เพื่อให้ตัวอักษรภาษาไทยแสดงถูกต้อง
 * @param input ข้อมูลรถและบริษัท
 */
export async function exportVehiclesPdf(input: VehiclesExportInput) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  await document.fonts.ready

  const rows = toVehicleExportRows(input.vehicles, input.axleTypes)
  const summary = summarizeVehicleRows(rows)
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

  pdf.save(exportFilename('pdf'))
}
