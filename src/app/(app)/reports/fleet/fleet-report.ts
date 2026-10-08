/**
 * การคำนวณของ "รายงานรถและการตรวจยาง" — ฟังก์ชันล้วน ไม่แตะ React/DB
 * page.tsx ดึงข้อมูลแล้วส่งมาคำนวณที่นี่ เพื่อให้เขียน unit test ได้โดยไม่ต้องต่อ Supabase
 */
import { positionLabel, type AxleTypeLayoutSource } from '@/lib/axle-layouts'
import { diffDays } from '@/lib/utils'

/** ค่าของตัวกรองสาขาที่หมายถึง "รถที่ไม่ระบุสาขา" */
export const NO_BRANCH = '__none__'
/** ป้ายของรถที่ไม่ได้ระบุสาขา */
export const NO_BRANCH_LABEL = 'ไม่ระบุสาขา'
/** จำนวนเดือนในกราฟแนวโน้ม (นับย้อนจากเดือนที่เลือก) */
export const TREND_MONTHS = 12
/** จำนวนวันที่ถือว่า "ไม่ได้ตรวจนาน" (เกินกว่านี้จึงเข้าตาราง) */
export const STALE_DAYS = 30
/** จำนวนวันที่ถือว่านานมาก (โทนแดง) */
export const CRITICAL_DAYS = 60
/** ขอบเขตดอกยาง (มม.) ของโดนัทสภาพดอกยาง */
export const TREAD_LOW_MM = 3
export const TREAD_MID_MM = 5
/** ช่อง histogram สุดท้าย — ดอกยางตั้งแต่เท่านี้ขึ้นไปรวมเป็น "12+" */
export const HISTOGRAM_MAX_MM = 12

export const THAI_SHORT_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const

export const THAI_FULL_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const

/* ------------------------------------------------------------------ types */

/** ตัวกรองของหน้า — year เป็น ค.ศ. เสมอ (UI แสดง พ.ศ.) */
export interface FleetFilters {
  year: number
  month: number
  /** '' = ทุกสาขา, NO_BRANCH = ไม่ระบุสาขา, อื่นๆ = ชื่อสาขาแบบตรงตัว */
  branch: string
  /** '' = ทุกประเภทรถ */
  axleType: string
}

/** ฟิลด์ของรถที่รายงานใช้ (ดึงจากตาราง vehicles) */
export interface FleetVehicle {
  id: string
  plate_no: string
  province: string
  axle_type: string
  branch: string | null
  current_mileage: number
  /** timestamptz ของการอัปเดตเลขไมล์จริงครั้งล่าสุด */
  mileage_updated_at: string
}

/** ฟิลด์ของยางบนรถที่รายงานใช้ (ดึงจาก view tire_overview เฉพาะ status = mounted) */
export interface FleetTire {
  id: string
  serial_no: string
  brand_name: string | null
  model_name: string | null
  size: string | null
  tread_mm: number | null
  new_tread_mm: number | null
  alert_tread_mm: number
  alert_km: number
  current_run_km: number
  vehicle_id: string | null
  position_code: string | null
}

/** ประวัติถอด-ใส่ (เฉพาะคอลัมน์ที่ใช้) */
export interface FleetEvent {
  vehicle_id: string | null
  event_date: string
}

/** ประเภทรถ (เพลา) — ใช้ทั้งชื่อคอลัมน์ตารางและป้ายตำแหน่งล้อ */
export type FleetAxleType = AxleTypeLayoutSource

/** ขอบเขตวันที่ของเดือน (YYYY-MM-DD ทั้งคู่ รวมปลาย) */
export interface MonthBounds {
  start: string
  end: string
}

/** เดือนหนึ่งในกราฟแนวโน้ม */
export interface TrendMonth {
  year: number
  month: number
  /** YYYY-MM */
  key: string
  /** ป้ายแกน เช่น "ต.ค. 69" */
  label: string
}

/* --------------------------------------------------------- date helpers */

/** แปลง Date เป็น YYYY-MM-DD ตามเวลาเครื่อง (ไม่ใช่ UTC) ให้ตรงกับ event_date ที่เป็น date */
export function isoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * แปลง timestamp (เช่น mileage_updated_at) เป็น YYYY-MM-DD ตามเวลาเครื่อง
 * @returns null เมื่อค่าว่างหรือแปลงไม่ได้
 */
export function timestampToLocalDate(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return isoDateLocal(d)
}

/**
 * วันแรกและวันสุดท้ายของเดือน
 * @param year ค.ศ.
 * @param month 1-12
 */
export function monthBounds(year: number, month: number): MonthBounds {
  const lastDay = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

/** YYYY-MM ของวันที่ (ใช้จัดกลุ่มรายเดือน) */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7)
}

/** true เมื่อวันที่อยู่ในช่วง (รวมปลายทั้งสองด้าน) — เทียบ string ได้เพราะเป็น ISO */
export function inRange(iso: string, bounds: MonthBounds): boolean {
  return iso >= bounds.start && iso <= bounds.end
}

/**
 * วันอ้างอิงสำหรับนับ "จำนวนวันที่ไม่ได้ตรวจ"
 * เดือนที่เลือกผ่านไปแล้ว → วันสุดท้ายของเดือนนั้น, ยังไม่ผ่าน → วันนี้
 * @param now วันที่ปัจจุบัน (ส่งมาเพื่อทดสอบได้)
 */
export function referenceDateISO(year: number, month: number, now = new Date()): string {
  const today = isoDateLocal(now)
  const { end } = monthBounds(year, month)
  return end < today ? end : today
}

/**
 * รายการเดือนย้อนหลัง count เดือน จบที่เดือนที่เลือก (เรียงเก่า → ใหม่)
 * ป้ายใส่ปี พ.ศ. 2 หลักเมื่อช่วงคร่อมปี
 */
export function trailingMonths(year: number, month: number, count = TREND_MONTHS): TrendMonth[] {
  const months: TrendMonth[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1)
    months.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: THAI_SHORT_MONTHS[d.getMonth()],
    })
  }
  const crossesYear = months.length > 0 && months[0].year !== months[months.length - 1].year
  if (crossesYear) {
    for (const m of months) m.label = `${THAI_SHORT_MONTHS[m.month - 1]} ${String((m.year + 543) % 100).padStart(2, '0')}`
  }
  return months
}

/** ป้ายเดือน/ปี แบบไทย เช่น "ตุลาคม 2569" */
export function monthLabelTH(year: number, month: number): string {
  return `${THAI_FULL_MONTHS[month - 1]} ${year + 543}`
}

/* ------------------------------------------------------------- filters */

/** ค่าแรกของ query param (รองรับทั้ง string และ string[]) */
function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/**
 * อ่านตัวกรองจาก searchParams — ค่าที่ไม่ถูกต้องใช้ค่าเริ่มต้น (เดือน/ปีปัจจุบัน, ทุกสาขา, ทุกประเภท)
 * year รับได้ทั้ง ค.ศ. และ พ.ศ. (มากกว่า 2400 ถือเป็น พ.ศ.) แต่เก็บเป็น ค.ศ. เสมอ
 * @param params searchParams ของหน้า
 * @param now วันที่ปัจจุบัน (ส่งมาเพื่อทดสอบได้)
 */
export function parseFleetFilters(
  params: Record<string, string | string[] | undefined>,
  now = new Date(),
): FleetFilters {
  let year = Number.parseInt(firstParam(params.year), 10)
  if (Number.isFinite(year) && year > 2400) year -= 543
  if (!Number.isFinite(year) || year < 2000 || year > 2100) year = now.getFullYear()

  let month = Number.parseInt(firstParam(params.month), 10)
  if (!Number.isFinite(month) || month < 1 || month > 12) month = now.getMonth() + 1

  const branch = firstParam(params.branch).trim().slice(0, 100)
  const axleType = firstParam(params.axle_type).trim().slice(0, 50)
  return { year, month, branch, axleType }
}

/**
 * กรองรถตามสาขาและประเภทรถ (ยางจะถูกคัดตามรถที่เหลือทีหลัง)
 * @param vehicles รถที่ใช้งานทั้งหมด
 * @param filters ตัวกรองของหน้า
 */
export function filterVehicles(vehicles: FleetVehicle[], filters: FleetFilters): FleetVehicle[] {
  return vehicles.filter((v) => {
    if (filters.branch === NO_BRANCH && v.branch !== null) return false
    if (filters.branch && filters.branch !== NO_BRANCH && v.branch !== filters.branch) return false
    if (filters.axleType && v.axle_type !== filters.axleType) return false
    return true
  })
}

/**
 * ยางบนรถเฉพาะคันที่ผ่านตัวกรอง (ยางในคลังไม่มี vehicle_id จึงตกไปเอง)
 * @param tires ยางสถานะ mounted ทั้งหมด
 * @param vehicles รถที่ผ่านตัวกรอง
 */
export function tiresOfVehicles(tires: FleetTire[], vehicles: FleetVehicle[]): FleetTire[] {
  const ids = new Set(vehicles.map((v) => v.id))
  return tires.filter((t) => t.vehicle_id !== null && ids.has(t.vehicle_id))
}

/**
 * รายชื่อสาขาสำหรับตัวเลือกกรอง — รวมสาขาที่บริษัทตั้งไว้กับสาขาที่พบในรถจริง (เผื่อข้อมูลเก่า)
 * @param companyBranches สาขาจาก companies.branches
 * @param vehicles รถที่ใช้งานทั้งหมด
 */
export function branchOptions(companyBranches: string[], vehicles: FleetVehicle[]): string[] {
  const set = new Set<string>(companyBranches.map((b) => b.trim()).filter(Boolean))
  for (const v of vehicles) if (v.branch) set.add(v.branch)
  return [...set].sort((a, b) => a.localeCompare(b, 'th'))
}

/* ------------------------------------------------------- alerts / rules */

/** ยางถึงเกณฑ์เตือน: วิ่งเกินระยะรอบนี้ หรือดอกยางเหลือไม่เกินเกณฑ์ของบริษัท */
export function isTireAtAlert(tire: FleetTire): boolean {
  if (tire.current_run_km >= tire.alert_km) return true
  return tire.tread_mm !== null && tire.tread_mm <= tire.alert_tread_mm
}

/**
 * รถที่ "บันทึกยาง" ในเดือน = มีประวัติถอด-ใส่ในเดือนนั้น หรือเลขไมล์จริงถูกอัปเดตในเดือนนั้น
 * @param vehicles รถที่ผ่านตัวกรอง
 * @param events ประวัติถอด-ใส่ (อย่างน้อยต้องครอบคลุมเดือนที่ถาม)
 * @param bounds ขอบเขตเดือน
 * @returns id ของรถที่มีการบันทึก
 */
export function vehiclesRecordedIn(
  vehicles: FleetVehicle[],
  events: FleetEvent[],
  bounds: MonthBounds,
): Set<string> {
  const ids = new Set(vehicles.map((v) => v.id))
  const recorded = new Set<string>()
  for (const e of events) {
    if (e.vehicle_id && ids.has(e.vehicle_id) && inRange(e.event_date, bounds)) recorded.add(e.vehicle_id)
  }
  for (const v of vehicles) {
    const d = timestampToLocalDate(v.mileage_updated_at)
    if (d && inRange(d, bounds)) recorded.add(v.id)
  }
  return recorded
}

/* ----------------------------------------------------------------- KPI */

export interface FleetKpis {
  vehicleCount: number
  recordedVehicles: number
  recordedVehiclePct: number
  mountedTires: number
  recordedTires: number
  recordedTirePct: number
}

/** เปอร์เซ็นต์ปัดเป็นจำนวนเต็ม (0 เมื่อตัวหารเป็น 0) */
export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}

/**
 * ตัวเลขสรุปแถวบน
 * @param vehicles รถที่ผ่านตัวกรอง
 * @param tires ยางบนรถของรถเหล่านั้น
 * @param recorded id รถที่บันทึกในเดือนที่เลือก
 */
export function buildKpis(vehicles: FleetVehicle[], tires: FleetTire[], recorded: Set<string>): FleetKpis {
  const recordedTires = tires.filter((t) => t.vehicle_id !== null && recorded.has(t.vehicle_id)).length
  return {
    vehicleCount: vehicles.length,
    recordedVehicles: recorded.size,
    recordedVehiclePct: percent(recorded.size, vehicles.length),
    mountedTires: tires.length,
    recordedTires,
    recordedTirePct: percent(recordedTires, tires.length),
  }
}

/* -------------------------------------------------------- branch matrix */

export interface BranchMatrixColumn {
  code: string
  name: string
}

export interface BranchMatrixRow {
  /** null = ไม่ระบุสาขา */
  branch: string | null
  label: string
  /** จำนวนรถต่อรหัสประเภทรถ */
  byType: Record<string, number>
  total: number
  mountedTires: number
  alertTires: number
}

export interface BranchMatrix {
  columns: BranchMatrixColumn[]
  rows: BranchMatrixRow[]
  total: BranchMatrixRow
}

/** ชื่อประเภทรถจากรหัส (ไม่พบใช้รหัสแทน) */
export function axleTypeName(code: string, axleTypes: readonly FleetAxleType[]): string {
  return axleTypes.find((a) => a.code === code)?.name ?? code
}

/**
 * ตารางจำนวนรถตามสาขา × ประเภทรถ พร้อมยางบนรถและยางถึงเกณฑ์เตือนต่อสาขา
 * คอลัมน์ = ประเภทรถที่พบจริง เรียงตามลำดับของ axleTypes; สาขาเรียงตามชื่อ "ไม่ระบุสาขา" อยู่ท้ายสุด
 * @param vehicles รถที่ผ่านตัวกรอง
 * @param tires ยางบนรถของรถเหล่านั้น
 * @param axleTypes ประเภทรถทั้งหมด (ใช้ชื่อและลำดับ)
 */
export function buildBranchMatrix(
  vehicles: FleetVehicle[],
  tires: FleetTire[],
  axleTypes: readonly FleetAxleType[],
): BranchMatrix {
  const presentCodes = new Set(vehicles.map((v) => v.axle_type))
  const ordered = axleTypes.filter((a) => presentCodes.has(a.code)).map((a) => ({ code: a.code, name: a.name }))
  const known = new Set(ordered.map((c) => c.code))
  const unknown = [...presentCodes].filter((c) => !known.has(c)).sort().map((code) => ({ code, name: code }))
  const columns = [...ordered, ...unknown]

  const tiresByVehicle = new Map<string, FleetTire[]>()
  for (const t of tires) {
    if (!t.vehicle_id) continue
    const list = tiresByVehicle.get(t.vehicle_id) ?? []
    list.push(t)
    tiresByVehicle.set(t.vehicle_id, list)
  }

  /** แถวว่างที่มีทุกคอลัมน์เป็น 0 */
  const emptyRow = (branch: string | null): BranchMatrixRow => ({
    branch,
    label: branch ?? NO_BRANCH_LABEL,
    byType: Object.fromEntries(columns.map((c) => [c.code, 0])),
    total: 0,
    mountedTires: 0,
    alertTires: 0,
  })

  const rowMap = new Map<string | null, BranchMatrixRow>()
  const total = emptyRow(null)
  total.label = 'รวม'

  for (const v of vehicles) {
    const row = rowMap.get(v.branch) ?? emptyRow(v.branch)
    rowMap.set(v.branch, row)
    const vehicleTires = tiresByVehicle.get(v.id) ?? []
    const alertCount = vehicleTires.filter(isTireAtAlert).length
    for (const target of [row, total]) {
      target.byType[v.axle_type] = (target.byType[v.axle_type] ?? 0) + 1
      target.total += 1
      target.mountedTires += vehicleTires.length
      target.alertTires += alertCount
    }
  }

  const rows = [...rowMap.values()].sort((a, b) => {
    if (a.branch === null) return 1
    if (b.branch === null) return -1
    return a.label.localeCompare(b.label, 'th')
  })

  return { columns, rows, total }
}

/** จำนวนรถต่อประเภทรถ (กราฟแท่งแนวนอน) — เรียงมากไปน้อย */
export function vehiclesPerAxleType(
  vehicles: FleetVehicle[],
  axleTypes: readonly FleetAxleType[],
): Array<{ code: string; name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const v of vehicles) counts.set(v.axle_type, (counts.get(v.axle_type) ?? 0) + 1)
  return [...counts.entries()]
    .map(([code, count]) => ({ code, name: axleTypeName(code, axleTypes), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'))
}

/* ---------------------------------------------------- latest inspection */

/**
 * วันที่บันทึกล่าสุดของแต่ละคัน ณ สิ้นเดือนที่เลือก = ค่ามากสุดระหว่าง
 * ประวัติถอด-ใส่ล่าสุดที่ไม่เกินวันสิ้นเดือน กับวันที่อัปเดตเลขไมล์ (ถ้าไม่เกินวันสิ้นเดือน)
 *
 * ข้อจำกัด: ระบบเก็บเฉพาะเลขไมล์ล่าสุด — ถ้าดูเดือนย้อนหลังแล้วเลขไมล์ถูกอัปเดตหลังเดือนนั้น
 * จะไม่รู้ค่าก่อนหน้า จึงนับเฉพาะประวัติถอด-ใส่
 *
 * @param vehicles รถที่ผ่านตัวกรอง
 * @param latestEvents ประวัติทั้งหมดเรียง event_date มากไปน้อย (จำกัดจำนวนที่ฝั่งดึงข้อมูล)
 * @param endISO วันสิ้นเดือนที่เลือก
 * @returns Map id รถ → YYYY-MM-DD หรือ null เมื่อไม่เคยบันทึก
 */
export function latestActivityByVehicle(
  vehicles: FleetVehicle[],
  latestEvents: FleetEvent[],
  endISO: string,
): Map<string, string | null> {
  // เก็บค่ามากสุดต่อคัน — ไม่พึ่งลำดับของ latestEvents จึงถูกต้องแม้ข้อมูลไม่ได้เรียงมา
  const lastEvent = new Map<string, string>()
  for (const e of latestEvents) {
    if (!e.vehicle_id || e.event_date > endISO) continue
    const cur = lastEvent.get(e.vehicle_id)
    if (cur === undefined || e.event_date > cur) lastEvent.set(e.vehicle_id, e.event_date)
  }

  const result = new Map<string, string | null>()
  for (const v of vehicles) {
    const mileageDate = timestampToLocalDate(v.mileage_updated_at)
    const candidates = [lastEvent.get(v.id), mileageDate && mileageDate <= endISO ? mileageDate : null]
      .filter((d): d is string => Boolean(d))
    result.set(v.id, candidates.length ? candidates.sort().at(-1)! : null)
  }
  return result
}

export type InspectionBucketKey = 'current' | 'one' | 'two' | 'older' | 'never'

export interface InspectionBucket {
  key: InspectionBucketKey
  label: string
  count: number
  pct: number
}

/** สีของแต่ละช่วงการตรวจล่าสุด — ใช้ร่วมกันทั้งโดนัทและ legend */
export const INSPECTION_COLORS: Record<InspectionBucketKey, string> = {
  current: '#059669',
  one: '#0284c7',
  two: '#ea580c',
  older: '#be123c',
  never: '#64748b',
}

const INSPECTION_LABELS: Record<InspectionBucketKey, string> = {
  current: 'เดือนนี้',
  one: '1 เดือนก่อน',
  two: '2 เดือนก่อน',
  older: 'นานกว่า 2 เดือน',
  never: 'ไม่เคยบันทึก',
}

/**
 * จัดกลุ่มรถตามว่าตรวจยางล่าสุดเมื่อไรเทียบกับเดือนที่เลือก
 * @param vehicles รถที่ผ่านตัวกรอง
 * @param latest ผลจาก latestActivityByVehicle
 */
export function buildInspectionBuckets(
  vehicles: FleetVehicle[],
  latest: Map<string, string | null>,
  year: number,
  month: number,
): InspectionBucket[] {
  const counts: Record<InspectionBucketKey, number> = { current: 0, one: 0, two: 0, older: 0, never: 0 }
  for (const v of vehicles) {
    const date = latest.get(v.id) ?? null
    if (!date) { counts.never++; continue }
    const ly = Number(date.slice(0, 4))
    const lm = Number(date.slice(5, 7))
    const diff = (year - ly) * 12 + (month - lm)
    if (diff <= 0) counts.current++
    else if (diff === 1) counts.one++
    else if (diff === 2) counts.two++
    else counts.older++
  }
  const keys: InspectionBucketKey[] = ['current', 'one', 'two', 'older', 'never']
  return keys.map((key) => ({
    key,
    label: INSPECTION_LABELS[key],
    count: counts[key],
    pct: percent(counts[key], vehicles.length),
  }))
}

/* --------------------------------------------------------------- trend */

export interface TrendPoint {
  key: string
  label: string
  recorded: number
  notRecorded: number
  pct: number
}

/**
 * แนวโน้มรายเดือน: รถที่บันทึก vs ไม่ได้บันทึก ใช้กฎเดียวกับ KPI
 * หมายเหตุ: เลขไมล์เก็บเฉพาะครั้งล่าสุด เดือนย้อนหลังจึงนับจากประวัติถอด-ใส่เป็นหลัก
 * @param vehicles รถที่ผ่านตัวกรอง
 * @param events ประวัติถอด-ใส่ที่ครอบคลุมทุกเดือนใน months
 * @param months เดือนที่จะแสดง (จาก trailingMonths)
 */
export function buildTrend(vehicles: FleetVehicle[], events: FleetEvent[], months: TrendMonth[]): TrendPoint[] {
  return months.map((m) => {
    const bounds = monthBounds(m.year, m.month)
    const recorded = vehiclesRecordedIn(vehicles, events, bounds).size
    return {
      key: m.key,
      label: m.label,
      recorded,
      notRecorded: vehicles.length - recorded,
      pct: percent(recorded, vehicles.length),
    }
  })
}

/* ------------------------------------------------------ stale vehicles */

export interface StaleVehicleRow {
  vehicleId: string
  plateNo: string
  province: string
  branch: string | null
  axleTypeName: string
  /** YYYY-MM-DD หรือ null = ไม่เคยบันทึก */
  lastInspected: string | null
  /** จำนวนวันนับถึงวันอ้างอิง (null = ไม่เคยบันทึก) */
  days: number | null
  mileage: number
}

export interface StaleSummary {
  over60: number
  between31And60: number
  never: number
  /** เรียงจากนานที่สุด: ไม่เคยบันทึกก่อน แล้วตามจำนวนวันมากไปน้อย */
  rows: StaleVehicleRow[]
}

/**
 * รถที่ไม่ได้ตรวจยางนาน (เกิน STALE_DAYS วัน หรือไม่เคยบันทึก)
 * @param vehicles รถที่ผ่านตัวกรอง
 * @param latest ผลจาก latestActivityByVehicle
 * @param referenceISO วันอ้างอิง (จาก referenceDateISO)
 * @param axleTypes ประเภทรถ (ใช้ชื่อ)
 */
export function buildStaleVehicles(
  vehicles: FleetVehicle[],
  latest: Map<string, string | null>,
  referenceISO: string,
  axleTypes: readonly FleetAxleType[],
): StaleSummary {
  const rows: StaleVehicleRow[] = []
  let over60 = 0
  let between31And60 = 0
  let never = 0
  for (const v of vehicles) {
    const last = latest.get(v.id) ?? null
    const days = last ? diffDays(last, referenceISO) : null
    if (days !== null && days <= STALE_DAYS) continue
    if (days === null) never++
    else if (days > CRITICAL_DAYS) over60++
    else between31And60++
    rows.push({
      vehicleId: v.id,
      plateNo: v.plate_no,
      province: v.province,
      branch: v.branch,
      axleTypeName: axleTypeName(v.axle_type, axleTypes),
      lastInspected: last,
      days,
      mileage: v.current_mileage,
    })
  }
  rows.sort((a, b) => {
    if (a.days === null && b.days === null) return a.plateNo.localeCompare(b.plateNo, 'th')
    if (a.days === null) return -1
    if (b.days === null) return 1
    return b.days - a.days || a.plateNo.localeCompare(b.plateNo, 'th')
  })
  return { over60, between31And60, never, rows }
}

/* ------------------------------------------------------------- tread */

export type TreadBandKey = 'high' | 'mid' | 'low'

export interface TreadBand {
  key: TreadBandKey
  label: string
  count: number
  pct: number
}

export interface TreadSummary {
  bands: TreadBand[]
  /** ยางที่มีค่าดอกยาง */
  measured: number
  /** ยางบนรถที่ยังไม่เคยวัดดอก */
  unmeasured: number
}

/** สีของช่วงดอกยาง — เขียว/ส้ม/แดง ตามความปลอดภัย */
export const TREAD_COLORS: Record<TreadBandKey, string> = {
  high: '#059669',
  mid: '#ea580c',
  low: '#be123c',
}

/** ช่วงดอกยางของยาง 1 เส้น (null เมื่อไม่ได้วัด) */
export function treadBandOf(treadMm: number | null): TreadBandKey | null {
  if (treadMm === null) return null
  if (treadMm <= TREAD_LOW_MM) return 'low'
  if (treadMm <= TREAD_MID_MM) return 'mid'
  return 'high'
}

/**
 * สัดส่วนสภาพดอกยางบนรถ (>5 / 3–5 / 0–3 มม.)
 * @param tires ยางบนรถของรถที่ผ่านตัวกรอง
 */
export function buildTreadSummary(tires: FleetTire[]): TreadSummary {
  const counts: Record<TreadBandKey, number> = { high: 0, mid: 0, low: 0 }
  let unmeasured = 0
  for (const t of tires) {
    const band = treadBandOf(t.tread_mm)
    if (band) counts[band]++
    else unmeasured++
  }
  const measured = tires.length - unmeasured
  const labels: Record<TreadBandKey, string> = {
    high: `มากกว่า ${TREAD_MID_MM} มม.`,
    mid: `${TREAD_LOW_MM}–${TREAD_MID_MM} มม.`,
    low: `0–${TREAD_LOW_MM} มม.`,
  }
  const keys: TreadBandKey[] = ['high', 'mid', 'low']
  return {
    bands: keys.map((key) => ({ key, label: labels[key], count: counts[key], pct: percent(counts[key], measured) })),
    measured,
    unmeasured,
  }
}

export type HistogramSeriesKey = 'brand1' | 'brand2' | 'others'

export interface HistogramBin {
  /** ป้ายช่อง เช่น "0", "7", "12+" */
  label: string
  brand1: number
  brand2: number
  others: number
}

export interface HistogramSeries {
  key: HistogramSeriesKey
  name: string
}

export interface TreadHistogram {
  bins: HistogramBin[]
  /** ชุดข้อมูลที่มีจริง (ถ้ายี่ห้อน้อยกว่า 2 จะไม่มี brand2; ถ้าไม่มี "อื่นๆ" จะไม่มี others) */
  series: HistogramSeries[]
}

/** สีของชุดข้อมูล histogram */
export const HISTOGRAM_COLORS: Record<HistogramSeriesKey, string> = {
  brand1: '#0d6ee0',
  brand2: '#d97706',
  others: '#64748b',
}

/** ป้ายช่อง histogram ของค่าดอกยาง (มม. เต็ม, ≥ HISTOGRAM_MAX_MM รวมเป็น "12+") */
export function histogramLabel(treadMm: number): string {
  const whole = Math.max(0, Math.floor(treadMm))
  return whole >= HISTOGRAM_MAX_MM ? `${HISTOGRAM_MAX_MM}+` : String(whole)
}

/**
 * Histogram ยางบนรถตามดอกยาง (มม. เต็ม 0..12+) แยกตามยี่ห้อ 2 อันดับแรก + อื่นๆ
 * @param tires ยางบนรถของรถที่ผ่านตัวกรอง
 */
export function buildTreadHistogram(tires: FleetTire[]): TreadHistogram {
  const measured = tires.filter((t) => t.tread_mm !== null)
  const brandCounts = new Map<string, number>()
  for (const t of measured) {
    const brand = t.brand_name?.trim() || 'ไม่ระบุยี่ห้อ'
    brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1)
  }
  const ranked = [...brandCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))
  const brand1 = ranked[0]?.[0]
  const brand2 = ranked[1]?.[0]
  const hasOthers = ranked.length > 2

  const bins: HistogramBin[] = Array.from({ length: HISTOGRAM_MAX_MM + 1 }, (_, i) => ({
    label: i === HISTOGRAM_MAX_MM ? `${HISTOGRAM_MAX_MM}+` : String(i),
    brand1: 0,
    brand2: 0,
    others: 0,
  }))
  const binIndex = (label: string) => bins.findIndex((b) => b.label === label)

  for (const t of measured) {
    const brand = t.brand_name?.trim() || 'ไม่ระบุยี่ห้อ'
    const bin = bins[binIndex(histogramLabel(t.tread_mm as number))]
    if (brand === brand1) bin.brand1++
    else if (brand === brand2) bin.brand2++
    else bin.others++
  }

  const series: HistogramSeries[] = []
  if (brand1) series.push({ key: 'brand1', name: brand1 })
  if (brand2) series.push({ key: 'brand2', name: brand2 })
  if (hasOthers) series.push({ key: 'others', name: 'อื่นๆ' })
  return { bins, series }
}

export interface LowTreadRow {
  tireId: string
  serialNo: string
  vehicleId: string
  plateNo: string
  province: string
  branch: string | null
  positionLabel: string
  brandName: string | null
  modelName: string | null
  size: string | null
  treadMm: number
  newTreadMm: number | null
  runKm: number
  band: 'low' | 'mid'
}

export interface LowTreadSummary {
  low: { tires: number; vehicles: number }
  mid: { tires: number; vehicles: number }
  /** เรียงดอกยางน้อย → มาก */
  rows: LowTreadRow[]
}

/**
 * ยางบนรถที่ดอกเหลือไม่เกิน TREAD_MID_MM มม. พร้อมตำแหน่งล้อตามประเภทรถของคันนั้น
 * @param tires ยางบนรถของรถที่ผ่านตัวกรอง
 * @param vehicles รถที่ผ่านตัวกรอง
 * @param axleTypes ประเภทรถ (ใช้แปลงรหัสตำแหน่งล้อ)
 */
export function buildLowTread(
  tires: FleetTire[],
  vehicles: FleetVehicle[],
  axleTypes: readonly FleetAxleType[],
): LowTreadSummary {
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]))
  const rows: LowTreadRow[] = []
  const lowVehicles = new Set<string>()
  const midVehicles = new Set<string>()
  for (const t of tires) {
    const band = treadBandOf(t.tread_mm)
    if (band !== 'low' && band !== 'mid') continue
    const v = t.vehicle_id ? vehicleById.get(t.vehicle_id) : undefined
    if (!v) continue
    ;(band === 'low' ? lowVehicles : midVehicles).add(v.id)
    rows.push({
      tireId: t.id,
      serialNo: t.serial_no,
      vehicleId: v.id,
      plateNo: v.plate_no,
      province: v.province,
      branch: v.branch,
      positionLabel: positionLabel(t.position_code, v.axle_type, axleTypes),
      brandName: t.brand_name,
      modelName: t.model_name,
      size: t.size,
      treadMm: t.tread_mm as number,
      newTreadMm: t.new_tread_mm,
      runKm: t.current_run_km,
      band,
    })
  }
  rows.sort((a, b) => a.treadMm - b.treadMm || a.plateNo.localeCompare(b.plateNo, 'th'))
  return {
    low: { tires: rows.filter((r) => r.band === 'low').length, vehicles: lowVehicles.size },
    mid: { tires: rows.filter((r) => r.band === 'mid').length, vehicles: midVehicles.size },
    rows,
  }
}

/* ------------------------------------------------------------- labels */

/** ป้ายสาขาที่เลือก (ใช้ในหัวการ์ด/รายงาน) */
export function branchFilterLabel(branch: string): string {
  if (!branch) return 'ทุกสาขา'
  if (branch === NO_BRANCH) return NO_BRANCH_LABEL
  return branch
}

/**
 * ส่วนของชื่อไฟล์ที่มาจากสาขา — ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้
 * @param branch ค่าตัวกรองสาขา
 */
export function branchFileSlug(branch: string): string {
  if (!branch) return 'all'
  if (branch === NO_BRANCH) return 'none'
  const slug = branch.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'branch'
}
