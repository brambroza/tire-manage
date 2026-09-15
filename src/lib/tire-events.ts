/**
 * รูปแบบข้อมูลประวัติการถอด-ใส่ยาง (ledger `tire_events`)
 *
 * แยกออกจาก component เพื่อให้ server action เรียก select string เดียวกันได้
 * โดยไม่ต้องดึงโค้ด UI เข้ามาด้วย
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/** 1 แถวประวัติในมุมมอง "ยาง 1 เส้น" */
export interface TireEventRow {
  id: string
  event_type: string
  event_date: string
  position_code: string | null
  odometer: number
  tread_mm: number | null
  distance_km: number | null
  note: string | null
  vehicles: { plate_no: string; province: string; axle_type: string } | null
  removal_reasons: { name: string } | null
  profiles: { full_name: string } | null
}

/** 1 แถวประวัติในมุมมอง "รถ 1 คัน" */
export interface VehicleEventRow {
  id: string
  event_type: string
  event_date: string
  position_code: string | null
  odometer: number
  tread_mm: number | null
  distance_km: number | null
  note: string | null
  tires: { serial_no: string } | null
  removal_reasons: { name: string } | null
  profiles: { full_name: string } | null
}

/** select string ของมุมมองยาง — ใช้ให้ตรงกันทุกที่ที่ query ประวัติของยาง */
export const TIRE_EVENT_SELECT =
  'id, event_type, event_date, position_code, odometer, tread_mm, distance_km, note, ' +
  'vehicles(plate_no, province, axle_type), removal_reasons(name), profiles(full_name)'

/** select string ของมุมมองรถ */
export const VEHICLE_EVENT_SELECT =
  'id, event_type, event_date, position_code, odometer, tread_mm, distance_km, note, ' +
  'tires(serial_no), removal_reasons(name), profiles(full_name)'

/** จำนวนแถวสูงสุดที่ modal ประวัติดึงมาแสดงต่อครั้ง */
export const HISTORY_LIMIT = 100

/** ข้อมูลการถอดครั้งล่าสุดของยาง 1 เส้น — ใช้บอกที่มาของยางที่อยู่ในคลัง */
export interface LastRemoval {
  /** ทะเบียนรถที่ถอดออกมา (null = รถถูกลบไปแล้ว) */
  plate_no: string | null
  province: string | null
  /** ตำแหน่งล้อตอนถอด */
  position_code: string | null
  /** เลขไมล์รถ ณ วันที่ถอด */
  odometer: number
  /** ระยะที่ยางวิ่งในรอบที่ถอดออก */
  distance_km: number | null
  event_date: string
  /** วันที่ใส่ยางครั้งนั้น (คู่กับ event_date ที่ถอด) — null ถ้าหา mount event คู่กันไม่เจอ */
  mounted_at: string | null
  /** สาเหตุที่ถอด (จาก removal_reasons) — null ถ้าไม่ได้ระบุ */
  reason: string | null
  /** หมายเหตุที่ช่างบันทึกตอนถอด — null ถ้าไม่ได้กรอก */
  note: string | null
}

/** จำนวน tire_id ต่อ 1 query — กัน URL ยาวเกินลิมิตของ PostgREST/proxy */
const REMOVAL_CHUNK = 150

/**
 * ดึงข้อมูลการถอดครั้งล่าสุดของยางแต่ละเส้น
 *
 * ใช้กับยางที่ไม่ได้อยู่บนรถ (in_stock / scrapped) เพื่อบอกว่าถอดจากทะเบียนอะไร
 * ที่เลขไมล์เท่าไร และวิ่งไปกี่กิโลเมตรในรอบล่าสุด
 *
 * @param supabase client ฝั่ง server (RLS จำกัดขอบเขตบริษัทให้อยู่แล้ว)
 * @param tireIds  รายการ id ของยางที่ต้องการ — ว่างได้ (คืน object ว่าง)
 * @returns map จาก tire_id ไปยังข้อมูลการถอดครั้งล่าสุด
 */
export async function fetchLastRemovals(
  supabase: SupabaseClient<Database>,
  tireIds: readonly string[],
): Promise<Record<string, LastRemoval>> {
  const result: Record<string, LastRemoval> = {}
  if (tireIds.length === 0) return result

  const chunks: string[][] = []
  for (let i = 0; i < tireIds.length; i += REMOVAL_CHUNK) {
    chunks.push(tireIds.slice(i, i + REMOVAL_CHUNK) as string[])
  }

  const responses = await Promise.all(
    chunks.map((ids) =>
      supabase
        .from('tire_events')
        .select(
          'tire_id, event_type, position_code, odometer, distance_km, event_date, note, ' +
            'vehicles(plate_no, province), removal_reasons(name)',
        )
        .in('event_type', ['mount', 'unmount'])
        .in('tire_id', ids)
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ),
  )

  // แยก mount event ที่ยังไม่ได้จับคู่กับ unmount ของยางแต่ละเส้น (รอ mount ที่มาก่อนหน้า unmount ล่าสุด)
  const pendingMountMatch = new Set<string>()

  for (const { data } of responses) {
    for (const row of (data ?? []) as unknown as Array<{
      tire_id: string
      event_type: string
      position_code: string | null
      odometer: number
      distance_km: number | null
      event_date: string
      note: string | null
      vehicles: { plate_no: string; province: string } | null
      removal_reasons: { name: string } | null
    }>) {
      // แถวเรียงใหม่สุดมาก่อน (ต่อ tire): แถวแรกที่เจอต้องเป็น unmount ล่าสุด
      if (!result[row.tire_id]) {
        if (row.event_type !== 'unmount') continue
        result[row.tire_id] = {
          plate_no: row.vehicles?.plate_no ?? null,
          province: row.vehicles?.province ?? null,
          position_code: row.position_code,
          odometer: row.odometer,
          distance_km: row.distance_km,
          event_date: row.event_date,
          mounted_at: null,
          reason: row.removal_reasons?.name ?? null,
          note: row.note,
        }
        pendingMountMatch.add(row.tire_id)
        continue
      }
      // เจอ unmount ล่าสุดแล้ว — หา mount ที่ตามมา (แถวแรกที่เป็น mount) เพื่อจับคู่
      if (pendingMountMatch.has(row.tire_id) && row.event_type === 'mount') {
        result[row.tire_id].mounted_at = row.event_date
        pendingMountMatch.delete(row.tire_id)
      }
    }
  }

  return result
}
