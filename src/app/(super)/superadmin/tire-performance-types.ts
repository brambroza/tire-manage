export const ALL_FILTER = 'all'
export const UNSPECIFIED_FILTER = 'unspecified'

/** ประวัติการถอดยางที่ส่งจาก Server Component มายังหน้ารายงาน */
export interface TirePerformanceRow {
  id: string
  companyId: string
  companyName: string
  eventDate: string
  serialNo: string
  tireModelId: string | null
  brandName: string | null
  modelName: string | null
  size: string | null
  distanceKm: number | null
  treadMm: number | null
  reasonId: string | null
  reasonName: string | null
  note: string | null
}

export interface ReportFilterOption {
  id: string
  name: string
}

export interface PerformanceReason {
  key: string
  name: string
  count: number
  percentage: number
  measuredCount: number
  averageDistanceKm: number | null
}

export interface ModelPerformance {
  key: string
  brandName: string
  modelName: string
  size: string | null
  eventCount: number
  measuredCount: number
  averageDistanceKm: number
  maximumDistanceKm: number
  minimumDistanceKm: number
  primaryReason: string
  longestReason: string
  shortestReason: string
}

export interface PerformanceSummary {
  totalEvents: number
  measuredEvents: number
  uniqueModels: number
  totalDistanceKm: number
  averageDistanceKm: number | null
  longestRecord: TirePerformanceRow | null
  shortestRecord: TirePerformanceRow | null
  longestModel: ModelPerformance | null
  shortestModel: ModelPerformance | null
  reasons: PerformanceReason[]
  models: ModelPerformance[]
}

export function performanceReasonKey(row: TirePerformanceRow): string {
  return row.reasonId ?? UNSPECIFIED_FILTER
}

export function performanceModelLabel(
  row: Pick<TirePerformanceRow, 'brandName' | 'modelName' | 'size'>,
): string {
  const size = row.size?.trim() || 'ไม่ระบุขนาด'
  const brandModel = [row.brandName, row.modelName].filter(Boolean).join(' ') || 'ไม่ระบุยี่ห้อ / รุ่น'
  return `${size} · ${brandModel}`
}

function performanceModelKey(row: TirePerformanceRow): string {
  if (row.tireModelId) return `catalog:${row.tireModelId}`
  return `manual:${[row.brandName, row.modelName, row.size]
    .map((value) => value?.trim().toLocaleLowerCase('th-TH') ?? '')
    .join('|')}`
}

function mostFrequentReason(rows: TirePerformanceRow[]): string {
  const counts = new Map<string, { name: string; count: number }>()
  for (const row of rows) {
    const key = performanceReasonKey(row)
    const current = counts.get(key)
    counts.set(key, {
      name: row.reasonName ?? 'ไม่ระบุสาเหตุ',
      count: (current?.count ?? 0) + 1,
    })
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'))[0]?.name
    ?? 'ไม่ระบุสาเหตุ'
}

/**
 * สรุปอายุใช้งานจาก event ถอดยาง โดย distanceKm คือระยะของหนึ่งรอบติดตั้ง-ถอด
 * แถวที่ไม่มี distanceKm ยังนับในสาเหตุ แต่ไม่ถูกนำไปคำนวณอายุใช้งาน
 */
export function summarizeTirePerformance(rows: TirePerformanceRow[]): PerformanceSummary {
  const measuredRows = rows.filter(
    (row): row is TirePerformanceRow & { distanceKm: number } => row.distanceKm !== null,
  )
  const totalDistanceKm = measuredRows.reduce((sum, row) => sum + row.distanceKm, 0)
  const byModel = new Map<string, TirePerformanceRow[]>()

  for (const row of rows) {
    const key = performanceModelKey(row)
    const current = byModel.get(key)
    if (current) current.push(row)
    else byModel.set(key, [row])
  }

  const models = Array.from(byModel, ([key, modelRows]) => {
    const measured = modelRows.filter(
      (row): row is TirePerformanceRow & { distanceKm: number } => row.distanceKm !== null,
    )
    if (measured.length === 0) return null

    let longest = measured[0]
    let shortest = measured[0]
    let distanceTotal = 0
    for (const row of measured) {
      distanceTotal += row.distanceKm
      if (row.distanceKm > longest.distanceKm) longest = row
      if (row.distanceKm < shortest.distanceKm) shortest = row
    }

    const first = modelRows[0]
    return {
      key,
      brandName: first.brandName ?? 'ไม่ระบุยี่ห้อ',
      modelName: first.modelName ?? 'ไม่ระบุรุ่น',
      size: first.size,
      eventCount: modelRows.length,
      measuredCount: measured.length,
      averageDistanceKm: distanceTotal / measured.length,
      maximumDistanceKm: longest.distanceKm,
      minimumDistanceKm: shortest.distanceKm,
      primaryReason: mostFrequentReason(modelRows),
      longestReason: longest.reasonName ?? 'ไม่ระบุสาเหตุ',
      shortestReason: shortest.reasonName ?? 'ไม่ระบุสาเหตุ',
    } satisfies ModelPerformance
  })
    .filter((model): model is ModelPerformance => model !== null)
    .sort((a, b) =>
      b.averageDistanceKm - a.averageDistanceKm
      || b.maximumDistanceKm - a.maximumDistanceKm
      || b.measuredCount - a.measuredCount,
    )

  const reasonGroups = new Map<string, TirePerformanceRow[]>()
  for (const row of rows) {
    const key = performanceReasonKey(row)
    const current = reasonGroups.get(key)
    if (current) current.push(row)
    else reasonGroups.set(key, [row])
  }
  const reasons = Array.from(reasonGroups, ([key, reasonRows]) => {
    const measured = reasonRows.filter(
      (row): row is TirePerformanceRow & { distanceKm: number } => row.distanceKm !== null,
    )
    return {
      key,
      name: reasonRows[0]?.reasonName ?? 'ไม่ระบุสาเหตุ',
      count: reasonRows.length,
      percentage: rows.length === 0 ? 0 : (reasonRows.length / rows.length) * 100,
      measuredCount: measured.length,
      averageDistanceKm: measured.length === 0
        ? null
        : measured.reduce((sum, row) => sum + row.distanceKm, 0) / measured.length,
    } satisfies PerformanceReason
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'))

  let longestRecord: (TirePerformanceRow & { distanceKm: number }) | null = null
  let shortestRecord: (TirePerformanceRow & { distanceKm: number }) | null = null
  for (const row of measuredRows) {
    if (!longestRecord || row.distanceKm > longestRecord.distanceKm) longestRecord = row
    if (!shortestRecord || row.distanceKm < shortestRecord.distanceKm) shortestRecord = row
  }

  const shortestModel = models.length === 0
    ? null
    : models.reduce((shortest, model) =>
        model.averageDistanceKm < shortest.averageDistanceKm ? model : shortest,
      )

  return {
    totalEvents: rows.length,
    measuredEvents: measuredRows.length,
    uniqueModels: models.length,
    totalDistanceKm,
    averageDistanceKm: measuredRows.length === 0 ? null : totalDistanceKm / measuredRows.length,
    longestRecord,
    shortestRecord,
    longestModel: models[0] ?? null,
    shortestModel,
    reasons,
    models,
  }
}
