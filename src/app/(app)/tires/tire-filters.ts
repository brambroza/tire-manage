import { isWithinDateRange, type DateRange } from '@/app/(app)/dashboard/removal-report-types'
import type { Tire, TireOverview } from '@/lib/database.types'

/** ฟิลด์วันที่ที่ใช้กรองคลังยางแบบช่วง (between) */
export type TireDateField = 'created' | 'mounted'

/** ตัวเลือกฟิลด์วันที่สำหรับ select และหัวรายงาน */
export const TIRE_DATE_FIELDS: Array<{ value: TireDateField; label: string }> = [
  { value: 'created', label: 'วันที่รับเข้าระบบ' },
  { value: 'mounted', label: 'วันที่ติดตั้งล่าสุด' },
]

/** ตัวกรองวันที่ที่อ่านจาก query string (?date_field=&from=&to=) */
export interface TireDateFilter {
  field: TireDateField
  range: DateRange
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * อ่านตัวกรองวันที่จาก query string โดยทิ้งค่าที่ไม่ใช่ YYYY-MM-DD
 * @param params ค่าจาก searchParams ของหน้า
 */
export function parseTireDateFilter(params: {
  date_field?: string
  from?: string
  to?: string
}): TireDateFilter {
  const field: TireDateField = params.date_field === 'mounted' ? 'mounted' : 'created'
  const from = params.from && ISO_DATE.test(params.from) ? params.from : ''
  const to = params.to && ISO_DATE.test(params.to) ? params.to : ''
  return { field, range: { from, to } }
}

/**
 * วันที่ของยางตามฟิลด์ที่เลือก — null เมื่อยางไม่มีวันที่นั้น (เช่น ยังไม่เคยติดตั้ง)
 * @param tire แถวจาก tire_overview
 * @param raw แถวดิบจากตาราง tires (มี created_at)
 * @param field ฟิลด์วันที่ที่เลือก
 */
export function tireDateValue(
  tire: TireOverview,
  raw: Tire | undefined,
  field: TireDateField,
): string | null {
  if (field === 'mounted') return tire.mounted_at
  return raw?.created_at ?? null
}

/**
 * กรองยางตามช่วงวันที่ — ถ้าไม่ได้ระบุทั้ง from และ to จะคืนรายการเดิม
 * ยางที่ไม่มีวันที่ในฟิลด์นั้น (เช่น ไม่เคยติดตั้ง) จะถูกตัดออกเมื่อมีการกรอง
 * @param tires รายการยาง
 * @param rawTires ข้อมูลดิบ key = tire id
 * @param filter ฟิลด์และช่วงวันที่
 */
export function filterTiresByDate(
  tires: TireOverview[],
  rawTires: Record<string, Tire>,
  filter: TireDateFilter,
): TireOverview[] {
  if (!filter.range.from && !filter.range.to) return tires
  return tires.filter((t) => {
    const value = tireDateValue(t, rawTires[t.id], filter.field)
    return value !== null && isWithinDateRange(value, filter.range)
  })
}

/** ตัวเลขสรุปของคลังยางทั้งบริษัท (ก่อนกรอง) สำหรับการ์ด KPI ด้านบน */
export interface TireStats {
  total: number
  mounted: number
  inStock: number
  /** ยางบนรถที่ถึงเกณฑ์เตือน (ระยะรอบ หรือดอกยาง) */
  alert: number
}

/**
 * คำนวณตัวเลขสรุปจากรายการยางทั้งหมดของบริษัท
 * @param tires รายการยางก่อนกรอง
 */
export function computeTireStats(tires: TireOverview[]): TireStats {
  return {
    total: tires.length,
    mounted: tires.filter((t) => t.status === 'mounted').length,
    inStock: tires.filter((t) => t.status === 'in_stock').length,
    alert: tires.filter(
      (t) =>
        t.status === 'mounted' &&
        (t.current_run_km >= t.alert_km || (t.tread_mm !== null && t.tread_mm <= t.alert_tread_mm)),
    ).length,
  }
}
