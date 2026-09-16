import { createClient } from '@/lib/supabase/server'
import type { Company, TireOverview, TireStatus } from '@/lib/database.types'

export type AlertKind = 'distance' | 'tread'

export interface TireAlert {
  tireId: string
  serialNo: string
  brandName: string | null
  modelName: string | null
  size: string | null
  plateNo: string | null
  positionCode: string | null
  vehicleAxleType: string | null
  currentRunKm: number
  treadMm: number | null
  /** distance = วิ่งเกินเกณฑ์, tread = ดอกยางต่ำกว่าเกณฑ์ */
  kind: AlertKind
  imageUrl: string | null
}

/** รถที่ถอดยางถี่ผิดปกติ (จาก view vehicle_change_alerts) */
export interface VehicleChangeAlertItem {
  vehicleId: string
  plateNo: string
  province: string
  changeCount: number
  lastEventDate: string
}

/** ยางที่ครบ (หรือใกล้ครบ) ระยะสะสมตลอดอายุยาง */
export interface LifetimeAlert {
  tireId: string
  serialNo: string
  brandName: string | null
  modelName: string | null
  size: string | null
  plateNo: string | null
  positionCode: string | null
  vehicleAxleType: string | null
  status: TireStatus
  /** ระยะสะสมรวมค่าประมาณ — ตัวเลขที่ใช้เทียบกับเกณฑ์ */
  lifetimeKm: number
  /** true = มีค่าประมาณปนอยู่ ต้องแสดงป้าย "ประมาณการ" */
  isEstimated: boolean
  /** true = เลขไมล์เก่าเกินเพดาน หยุดประมาณแล้ว */
  isMileageStale: boolean
  /** เลขไมล์จริงล่าสุด + อายุของมัน ใช้อธิบายที่มาของตัวเลข */
  currentMileage: number | null
  daysSinceMileage: number | null
  avgKmPerMonth: number | null
  /** 0 = ครบแล้ว, > 0 = ใกล้ครบ อีกกี่วัน */
  daysToAlert: number | null
  imageUrl: string | null
}

export interface NotificationFeed {
  alerts: TireAlert[]
  /** จำนวนยางที่ถึงเกณฑ์ทั้งหมด (อาจมากกว่าที่ส่งมาแสดง) */
  total: number
  alertKm: number
  alertTreadMm: number
  /** รถเปลี่ยนยางบ่อย (เรียงจำนวนครั้งมากไปน้อย) */
  vehicleAlerts: VehicleChangeAlertItem[]
  vehicleTotal: number
  /** เกณฑ์ "บ่อย": ถอดยางตั้งแต่ changeCount ครั้ง ภายใน changeDays วัน */
  changeCount: number
  changeDays: number
  /** ยางที่ครบระยะสะสมแล้ว (เรียงระยะมากไปน้อย) */
  lifetimeAlerts: LifetimeAlert[]
  lifetimeTotal: number
  /** เกณฑ์ระยะสะสม — null = ปิดการเตือนข้อนี้ */
  alertLifetimeKm: number | null
}

const MAX_ITEMS = 8
const MAX_VEHICLE_ITEMS = 5
const MAX_LIFETIME_ITEMS = 5

/** ยางที่ "ใกล้ครบ" นับจากอีกกี่วันถึงเกณฑ์ */
export const LIFETIME_SOON_DAYS = 30

/** คอลัมน์ที่การ์ด/กระดิ่ง "ครบระยะสะสม" ต้องใช้ — ดึงเท่าที่ใช้ ไม่ให้ payload บวม */
const LIFETIME_COLUMNS =
  'id, serial_no, brand_name, model_name, size, status, plate_no, position_code, vehicle_id, ' +
  'current_mileage, days_since_mileage, avg_km_per_month, estimated_lifetime_km, ' +
  'is_estimated, is_mileage_stale, days_to_lifetime_alert, image_url'

type LifetimeRow = Pick<
  TireOverview,
  'id' | 'serial_no' | 'brand_name' | 'model_name' | 'size' | 'status' | 'plate_no'
  | 'position_code' | 'vehicle_id' | 'current_mileage' | 'days_since_mileage'
  | 'avg_km_per_month' | 'estimated_lifetime_km' | 'is_estimated' | 'is_mileage_stale'
  | 'days_to_lifetime_alert' | 'image_url'
>

/** แปลงแถวจาก view เป็นรูปที่ UI ใช้ — axleType เติมทีหลังเพื่อแปลชื่อตำแหน่งล้อ */
function toLifetimeAlert(row: LifetimeRow, axleType: string | null): LifetimeAlert {
  return {
    tireId: row.id,
    serialNo: row.serial_no,
    brandName: row.brand_name,
    modelName: row.model_name,
    size: row.size,
    plateNo: row.plate_no,
    positionCode: row.position_code,
    vehicleAxleType: axleType,
    status: row.status,
    lifetimeKm: row.estimated_lifetime_km,
    isEstimated: row.is_estimated,
    isMileageStale: row.is_mileage_stale,
    currentMileage: row.current_mileage,
    daysSinceMileage: row.days_since_mileage,
    avgKmPerMonth: row.avg_km_per_month,
    daysToAlert: row.days_to_lifetime_alert,
    imageUrl: row.image_url,
  }
}

/**
 * ยางที่ครบระยะสะสมตลอดอายุแล้ว
 *
 * กรองใน SQL ไม่ใช่ใน TS — ถ้าดึงมาแล้วค่อยกรอง ยางที่ถึงเกณฑ์แต่อยู่นอก limit จะหายเงียบ
 * ยาง in_stock ก็เข้าเกณฑ์ได้ (กันเอายางหมดอายุกลับไปใส่) แต่ scrapped ไม่นับ
 *
 * @param supabase client ฝั่ง server
 * @param company บริษัทของผู้ใช้ปัจจุบัน
 * @param limit จำนวนแถวสูงสุด
 */
export async function getLifetimeAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  company: Company,
  limit: number,
): Promise<{ items: LifetimeAlert[]; total: number }> {
  if (company.alert_lifetime_km === null) return { items: [], total: 0 }

  const { data, count } = await supabase
    .from('tire_overview')
    .select(LIFETIME_COLUMNS, { count: 'exact' })
    .eq('company_id', company.id)
    .neq('status', 'scrapped')
    .gte('estimated_lifetime_km', company.alert_lifetime_km)
    .order('estimated_lifetime_km', { ascending: false })
    .limit(limit)

  const rows = (data ?? []) as unknown as LifetimeRow[]
  return {
    items: await attachAxleTypes(supabase, rows),
    total: count ?? rows.length,
  }
}

/**
 * ยางที่ยังไม่ครบแต่ใกล้ครบภายใน N วัน — ใช้ให้ลูกค้าสั่งยางล่วงหน้าได้
 * @param withinDays กรอบวันที่ถือว่า "ใกล้ครบ"
 */
export async function getLifetimeSoonAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  company: Company,
  withinDays: number,
  limit: number,
): Promise<LifetimeAlert[]> {
  if (company.alert_lifetime_km === null) return []

  const { data } = await supabase
    .from('tire_overview')
    .select(LIFETIME_COLUMNS)
    .eq('company_id', company.id)
    .eq('status', 'mounted')
    .gt('days_to_lifetime_alert', 0)
    .lte('days_to_lifetime_alert', withinDays)
    .order('days_to_lifetime_alert', { ascending: true })
    .limit(limit)

  return attachAxleTypes(supabase, (data ?? []) as unknown as LifetimeRow[])
}

/** tire_overview ไม่มีประเภทเพลา — ดึงเพิ่มเพื่อให้ชื่อตำแหน่งล้อถูกต้อง */
async function attachAxleTypes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: LifetimeRow[],
): Promise<LifetimeAlert[]> {
  const vehicleIds = Array.from(
    new Set(rows.map((r) => r.vehicle_id).filter((id): id is string => !!id)),
  )
  const axleTypeByVehicle: Record<string, string> = {}
  if (vehicleIds.length > 0) {
    const { data } = await supabase.from('vehicles').select('id, axle_type').in('id', vehicleIds)
    for (const v of data ?? []) axleTypeByVehicle[v.id] = v.axle_type
  }
  return rows.map((r) =>
    toLifetimeAlert(r, r.vehicle_id ? axleTypeByVehicle[r.vehicle_id] ?? null : null),
  )
}

/**
 * ดึงรถที่เปลี่ยนยางบ่อยของบริษัท (view คำนวณจากเกณฑ์ของบริษัทให้แล้ว)
 * @param supabase client ฝั่ง server
 * @param companyId บริษัทที่ต้องการ (super admin ต้องระบุ; ลูกค้า RLS กรองให้)
 */
export async function getVehicleChangeAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
): Promise<VehicleChangeAlertItem[]> {
  const { data } = await supabase
    .from('vehicle_change_alerts')
    .select('vehicle_id, plate_no, province, change_count, last_event_date')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('change_count', { ascending: false })
    .order('last_event_date', { ascending: false })
    .limit(200)

  return (data ?? []).map((row) => ({
    vehicleId: row.vehicle_id,
    plateNo: row.plate_no,
    province: row.province,
    changeCount: row.change_count,
    lastEventDate: row.last_event_date,
  }))
}

/**
 * รวบรวมการแจ้งเตือนของบริษัท: ยางที่วิ่งเกินเกณฑ์ หรือดอกยางต่ำกว่าเกณฑ์
 *
 * เกณฑ์อ่านจากค่าที่บริษัทตั้งไว้ (หน้า "ข้อมูลบริษัท")
 * ยางที่ดอกต่ำจะถูกจัดลำดับความสำคัญไว้ก่อน เพราะเป็นความเสี่ยงด้านความปลอดภัย
 *
 * @param company บริษัทของผู้ใช้ปัจจุบัน
 */
export async function getTireAlerts(company: Company | null): Promise<NotificationFeed> {
  const alertKm = company?.alert_km ?? 10000
  const alertTreadMm = company?.alert_tread_mm ?? 3
  const changeCount = company?.alert_change_count ?? 3
  const changeDays = company?.alert_change_days ?? 90

  if (!company) {
    return {
      alerts: [], total: 0, alertKm, alertTreadMm,
      vehicleAlerts: [], vehicleTotal: 0, changeCount, changeDays,
      lifetimeAlerts: [], lifetimeTotal: 0, alertLifetimeKm: null,
    }
  }

  const supabase = await createClient()
  const [{ data }, vehicleAlertRows, lifetime] = await Promise.all([
    supabase
      .from('tire_overview')
      .select('*')
      .eq('status', 'mounted')
      .order('current_run_km', { ascending: false })
      .limit(500),
    getVehicleChangeAlerts(supabase, company.id),
    getLifetimeAlerts(supabase, company, MAX_LIFETIME_ITEMS),
  ])

  const rows = ((data ?? []) as TireOverview[]).filter(
    (t) => t.current_run_km >= alertKm || (t.tread_mm !== null && t.tread_mm <= alertTreadMm),
  )

  // view tire_overview ไม่มีประเภทเพลา — ดึงเพิ่มเพื่อให้ชื่อตำแหน่งล้อ (เช่น "เพลา 2 ซ้ายนอก") ถูกต้อง
  const vehicleIds = Array.from(new Set(rows.map((t) => t.vehicle_id).filter((id): id is string => !!id)))
  const axleTypeByVehicle: Record<string, string> = {}
  if (vehicleIds.length > 0) {
    const { data: vehicleRows } = await supabase
      .from('vehicles')
      .select('id, axle_type')
      .in('id', vehicleIds)
    for (const v of vehicleRows ?? []) axleTypeByVehicle[v.id] = v.axle_type
  }

  const alerts: TireAlert[] = rows
    .map((t) => ({
      tireId: t.id,
      serialNo: t.serial_no,
      brandName: t.brand_name,
      modelName: t.model_name,
      size: t.size,
      plateNo: t.plate_no,
      positionCode: t.position_code,
      vehicleAxleType: t.vehicle_id ? axleTypeByVehicle[t.vehicle_id] ?? null : null,
      currentRunKm: t.current_run_km,
      treadMm: t.tread_mm,
      kind:
        t.tread_mm !== null && t.tread_mm <= alertTreadMm
          ? ('tread' as const)
          : ('distance' as const),
      imageUrl: t.image_url,
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'tread' ? -1 : 1
      return b.currentRunKm - a.currentRunKm
    })

  return {
    alerts: alerts.slice(0, MAX_ITEMS),
    total: alerts.length,
    alertKm,
    alertTreadMm,
    vehicleAlerts: vehicleAlertRows.slice(0, MAX_VEHICLE_ITEMS),
    vehicleTotal: vehicleAlertRows.length,
    changeCount,
    changeDays,
    lifetimeAlerts: lifetime.items,
    lifetimeTotal: lifetime.total,
    alertLifetimeKm: company.alert_lifetime_km,
  }
}
