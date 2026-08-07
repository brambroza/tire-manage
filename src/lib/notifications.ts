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

export interface NotificationFeed {
  alerts: TireAlert[]
  /** จำนวนทั้งหมด (อาจมากกว่าที่ส่งมาแสดง) */
  total: number
  alertKm: number
  alertTreadMm: number
}

const MAX_ITEMS = 8

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

  if (!company) return { alerts: [], total: 0, alertKm, alertTreadMm }

  const supabase = await createClient()
  const { data } = await supabase
    .from('tire_overview')
    .select('*')
    .eq('status', 'mounted')
    .order('current_run_km', { ascending: false })
    .limit(500)

  const rows = (data ?? []) as TireOverview[]

  const alerts: TireAlert[] = rows
    .filter(
      (t) => t.current_run_km >= alertKm || (t.tread_mm !== null && t.tread_mm <= alertTreadMm),
    )
    .map((t) => ({
      tireId: t.id,
      serialNo: t.serial_no,
      brandName: t.brand_name,
      modelName: t.model_name,
      size: t.size,
      plateNo: t.plate_no,
      positionCode: t.position_code,
      vehicleAxleType: null,
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
  }
}
