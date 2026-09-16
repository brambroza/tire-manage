import type { MonthPoint } from '@/components/charts'
import type { DateRange } from './removal-report-types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** จำนวนเดือนสูงสุดที่ยังแสดงเป็นแท่งรายเดือนได้ — เกินกว่านี้จะรวมเป็นรายปีให้อ่านง่าย */
export const MAX_MONTHLY_BARS = 24

/** จำนวนเดือนที่แสดงเมื่อไม่มีประวัติเลย (กราฟว่างแต่ยังมีแกนให้เห็นช่วง) */
const FALLBACK_MONTHS = 6

/**
 * อ่านช่วงวันที่ของหน้า dashboard จาก query string (?from=&to=)
 * ทิ้งค่าที่ไม่ใช่ YYYY-MM-DD — ค่าว่างทั้งคู่ = ทั้งหมด
 * @param params ค่าจาก searchParams ของหน้า
 */
export function parseDashboardRange(params: { from?: string; to?: string }): DateRange {
  const from = params.from && ISO_DATE.test(params.from) ? params.from : ''
  const to = params.to && ISO_DATE.test(params.to) ? params.to : ''
  return { from, to }
}

/**
 * true เมื่อผู้ใช้ระบุช่วงกลับด้าน (วันเริ่มต้นหลังวันสิ้นสุด) — หน้าเว็บจะไม่นำไปกรอง
 * @param range ช่วงวันที่
 */
export function isRangeInvalid(range: DateRange): boolean {
  return range.from !== '' && range.to !== '' && range.from > range.to
}

/** วันที่ 1 ของเดือนตามเวลาเครื่อง (ตัดเวลา) */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** แปลง YYYY-MM-DD เป็น Date ตามเวลาเครื่อง (ไม่ใช่ UTC) เพื่อให้จัดกลุ่มเดือนตรงกับ event_date */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** จำนวนเดือนระหว่างวันที่ 1 ของสองเดือน (รวมปลายทั้งสองด้าน) */
function monthSpan(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
}

/**
 * สร้างชุดข้อมูลกราฟถอด-ใส่ยางตามช่วงวันที่ที่เลือก
 * - ไม่ระบุช่วง: ตั้งแต่เดือนที่มีประวัติเก่าสุดจนถึงเดือนปัจจุบัน (ทั้งหมด)
 * - ระบุด้านเดียว: ด้านที่ว่างใช้เดือนเก่าสุด/เดือนปัจจุบันแทน
 * - ช่วงยาวเกิน MAX_MONTHLY_BARS เดือน: รวมเป็นรายปี
 * @param events ประวัติ mount/unmount ที่อยู่ในช่วงแล้ว
 * @param range ช่วงวันที่ของหน้า
 * @param now วันที่อ้างอิง (ส่งมาเพื่อทดสอบได้)
 */
export function buildEventSeries(
  events: Array<{ event_type: string; event_date: string }>,
  range: DateRange,
  now = new Date(),
): MonthPoint[] {
  const today = startOfMonth(now)
  let earliest: Date | null = null
  for (const e of events) {
    const d = startOfMonth(parseLocalDate(e.event_date))
    if (!earliest || d < earliest) earliest = d
  }

  let start = range.from ? startOfMonth(parseLocalDate(range.from)) : earliest
  let end = range.to ? startOfMonth(parseLocalDate(range.to)) : today
  if (!start) {
    // ไม่มีประวัติเลย — โชว์ 6 เดือนย้อนหลังจากปลายช่วงให้กราฟยังมีแกน
    start = new Date(end.getFullYear(), end.getMonth() - (FALLBACK_MONTHS - 1), 1)
  }
  if (start > end) end = start

  const yearly = monthSpan(start, end) > MAX_MONTHLY_BARS
  const crossesYear = start.getFullYear() !== end.getFullYear()
  const points: MonthPoint[] = []
  const index = new Map<string, MonthPoint>()

  if (yearly) {
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
      const point: MonthPoint = { month: `ปี ${y + 543}`, mount: 0, unmount: 0 }
      points.push(point)
      index.set(String(y), point)
    }
  } else {
    for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const label = d.toLocaleDateString('th-TH', crossesYear
        ? { month: 'short', year: '2-digit' }
        : { month: 'short' })
      const point: MonthPoint = { month: label, mount: 0, unmount: 0 }
      points.push(point)
      index.set(`${d.getFullYear()}-${d.getMonth()}`, point)
    }
  }

  for (const e of events) {
    const d = parseLocalDate(e.event_date)
    const point = index.get(yearly ? String(d.getFullYear()) : `${d.getFullYear()}-${d.getMonth()}`)
    if (!point) continue
    if (e.event_type === 'mount') point.mount++
    else point.unmount++
  }

  return points
}
