import { createClient } from '@/lib/supabase/server'
import type { Company, TireOverview } from '@/lib/database.types'

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
}

const MAX_ITEMS = 8
const MAX_VEHICLE_ITEMS = 5

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
    }
  }

  const supabase = await createClient()
  const [{ data }, vehicleAlertRows] = await Promise.all([
    supabase
      .from('tire_overview')
      .select('*')
      .eq('status', 'mounted')
      .order('current_run_km', { ascending: false })
      .limit(500),
    getVehicleChangeAlerts(supabase, company.id),
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
  }
}
