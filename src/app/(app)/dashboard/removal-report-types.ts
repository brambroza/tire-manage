export const ALL_REASONS = 'all'
export const UNSPECIFIED_REASON = 'unspecified'

/** ข้อมูลประวัติการถอดยางที่ปลอดภัยสำหรับส่งจาก Server Component ไป Client Component */
export interface RemovalReportRow {
  id: string
  eventDate: string
  serialNo: string
  brandName: string | null
  modelName: string | null
  size: string | null
  plateNo: string | null
  province: string | null
  axleType: string | null
  positionCode: string | null
  odometer: number
  treadMm: number | null
  distanceKm: number | null
  reasonId: string | null
  reasonName: string | null
  note: string | null
}

export interface RemovalReasonOption {
  id: string
  name: string
}

export interface ReasonBreakdown {
  key: string
  name: string
  count: number
  percentage: number
}

export interface RemovalReportSummary {
  totalEvents: number
  uniqueTires: number
  totalDistanceKm: number
  averageDistanceKm: number | null
  topReason: ReasonBreakdown | null
  reasons: ReasonBreakdown[]
}

export function removalReasonKey(row: RemovalReportRow): string {
  return row.reasonId ?? UNSPECIFIED_REASON
}

/** สรุปตัวเลขจากรายการที่ผ่านตัวกรองแล้ว เพื่อให้หน้าเว็บและไฟล์ส่งออกใช้ยอดชุดเดียวกัน */
export function summarizeRemovalRows(rows: RemovalReportRow[]): RemovalReportSummary {
  const reasonCounts = new Map<string, { name: string; count: number }>()
  const tireSerials = new Set<string>()
  let totalDistanceKm = 0
  let measuredDistanceCount = 0

  for (const row of rows) {
    if (row.serialNo) tireSerials.add(row.serialNo)
    if (row.distanceKm !== null) {
      totalDistanceKm += row.distanceKm
      measuredDistanceCount++
    }

    const key = removalReasonKey(row)
    const current = reasonCounts.get(key)
    reasonCounts.set(key, {
      name: row.reasonName ?? 'ไม่ระบุสาเหตุ',
      count: (current?.count ?? 0) + 1,
    })
  }

  const reasons = Array.from(reasonCounts, ([key, value]) => ({
    key,
    name: value.name,
    count: value.count,
    percentage: rows.length === 0 ? 0 : (value.count / rows.length) * 100,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'))

  return {
    totalEvents: rows.length,
    uniqueTires: tireSerials.size,
    totalDistanceKm,
    averageDistanceKm: measuredDistanceCount === 0 ? null : totalDistanceKm / measuredDistanceCount,
    topReason: reasons[0] ?? null,
    reasons,
  }
}
