export interface VehicleIdentity {
  plate_no: string | null
  nickname?: string | null
}

/** Keep the registration visible even when nicknames are duplicated. */
export function vehicleLabel(vehicle: VehicleIdentity | null | undefined, fallback = '-'): string {
  return [vehicle?.nickname?.trim(), vehicle?.plate_no].filter(Boolean).join(' · ') || fallback
}

export function matchesVehicle(vehicle: VehicleIdentity, query: string): boolean {
  const term = query.trim().toLowerCase()
  if (!term) return true
  const compact = term.replace(/[\s-]/g, '')
  return Boolean(
    vehicle.nickname?.toLowerCase().includes(term) ||
    vehicle.plate_no?.toLowerCase().includes(term) ||
    (compact && vehicle.plate_no?.replace(/[\s-]/g, '').toLowerCase().includes(compact)),
  )
}

/** Quote PostgREST values and treat search punctuation as literal text. */
export function vehicleSearchFilter(query: string): string {
  const literal = query.trim().replace(/[\\%_*]/g, '\\$&')
  const value = JSON.stringify(`%${literal}%`)
  return ['plate_no', 'nickname', 'brand', 'model', 'province']
    .map((column) => `${column}.ilike.${value}`).join(',')
}
