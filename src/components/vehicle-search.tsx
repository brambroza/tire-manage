'use client'

import * as React from 'react'
import { Truck } from 'lucide-react'
import { Input } from '@/components/ui'
import { matchesVehicle, type VehicleIdentity } from '@/lib/vehicle-display'

/** Search selects a specific ID; a nickname never identifies a vehicle on its own. */
export function VehicleSearch<T extends VehicleIdentity & { id: string; province: string | null }>({
  vehicles, onSelect, describe, photoOf,
}: {
  vehicles: readonly T[]
  onSelect: (vehicle: T) => void
  /** ข้อความเสริมใต้ทะเบียน เช่น ประเภทรถ (ไม่ส่ง = ไม่แสดง) */
  describe?: (vehicle: T) => string | null
  /** ลิงก์รูปรถ (ไม่ส่ง = ไม่แสดงช่องรูป) */
  photoOf?: (vehicle: T) => string | null
}) {
  const [query, setQuery] = React.useState('')
  const inputId = React.useId()
  const matches = React.useMemo(
    () => query.trim() ? vehicles.filter((vehicle) => matchesVehicle(vehicle, query)) : [],
    [vehicles, query],
  )

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-medium text-ink-700">ค้นหาชื่อเรียกหรือทะเบียนรถ</label>
      <Input id={inputId} value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="เช่น BFn, 588-233-SG+ หรือ 16-5728" autoComplete="off" />
      {query.trim() && (
        <>
          <p role="status" className="text-sm text-ink-500">
            {matches.length ? `พบ ${matches.length} คัน · เลือกรถจากรายการด้านล่าง` : 'ไม่พบรถที่ตรงกับคำค้นหา'}
          </p>
          {matches.length > 0 && (
            <ul className="max-h-64 overflow-y-auto rounded-xl border border-line divide-y divide-line">
              {matches.slice(0, 20).map((vehicle) => (
                <li key={vehicle.id}>
                  <button type="button" onClick={() => onSelect(vehicle)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brand-50 focus-visible:bg-brand-50">
                    {photoOf && <VehiclePhotoThumb src={photoOf(vehicle)} />}
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-semibold text-ink-900">{vehicle.nickname || vehicle.plate_no}</span>
                      <span className="block text-sm text-ink-500">
                        {vehicle.plate_no ? `${vehicle.plate_no} · ${vehicle.province ?? '-'}` : 'ไม่มีทะเบียน'}
                      </span>
                      {describe?.(vehicle) && (
                        <span className="mt-0.5 block text-sm font-medium text-brand-700">{describe(vehicle)}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {matches.length > 20 && <p className="text-xs text-ink-500">แสดง 20 คันแรก · พิมพ์เพิ่มเพื่อจำกัดผลการค้นหา</p>}
        </>
      )}
    </div>
  )
}

/**
 * รูปรถขนาดย่อ — ไม่มีรูปแสดงไอคอนรถแทน
 * @param src signed URL ของรูป หรือ null
 * @param size ขนาดกรอบ (sm = รายการค้นหา, xs = แถบหัวหน้าจอ)
 */
export function VehiclePhotoThumb({ src, size = 'sm' }: { src: string | null | undefined; size?: 'xs' | 'sm' }) {
  const box = size === 'xs' ? 'size-9 rounded-lg' : 'size-14 rounded-xl'
  if (!src) {
    return (
      <span className={`flex shrink-0 items-center justify-center bg-brand-50 text-brand-400 ring-1 ring-inset ring-brand-100 ${box}`} aria-hidden="true">
        <Truck className={size === 'xs' ? 'size-4.5' : 'size-6'} strokeWidth={1.75} />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={`shrink-0 object-cover ring-1 ring-inset ring-line ${box}`} />
  )
}
