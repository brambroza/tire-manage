'use client'

import * as React from 'react'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/ui'
import { TireEventTable, VehicleEventTable } from '@/components/tire-event-table'
import { getTireHistoryAction } from '@/app/(app)/tires/actions'
import { getVehicleHistoryAction } from '@/app/(app)/vehicles/actions'
import type { AxleTypeLayoutSource } from '@/lib/axle-layouts'
import type { ActionResult } from '@/lib/action-result'
import type { TireEventRow, VehicleEventRow } from '@/lib/tire-events'

/**
 * โครง modal ประวัติ — โหลดข้อมูลตอนเปิดเท่านั้น
 *
 * @param load ฟังก์ชันดึงข้อมูล (server action) เรียกใหม่ทุกครั้งที่เปิด
 * @param render วาดตารางจากข้อมูลที่โหลดได้
 */
function HistoryModal<T>({
  open,
  onClose,
  title,
  description,
  load,
  render,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  load: () => Promise<ActionResult<T[]>>
  render: (rows: T[]) => React.ReactNode
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="xl">
      {/* mount เฉพาะตอนเปิด — state เริ่มใหม่ทุกครั้ง ไม่ต้องรีเซ็ตเอง */}
      {open && <HistoryBody load={load} render={render} />}
    </Modal>
  )
}

/** ตัวโหลดข้อมูลของ modal — ยิง load() ครั้งเดียวตอน mount */
function HistoryBody<T>({
  load,
  render,
}: {
  load: () => Promise<ActionResult<T[]>>
  render: (rows: T[]) => React.ReactNode
}) {
  const [rows, setRows] = React.useState<T[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    load().then((result) => {
      if (cancelled) return
      if (result.ok) setRows(result.data ?? [])
      else setError(result.error)
    })

    return () => { cancelled = true }
  }, [load])

  if (error) {
    return (
      <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
        {error}
      </div>
    )
  }

  if (rows === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-500">
        <Spinner />
        กำลังโหลดประวัติ...
      </div>
    )
  }

  return <>{render(rows)}</>
}

/**
 * ประวัติการใช้งานของยาง 1 เส้น
 * @param tireId รหัสยางที่จะดูประวัติ (null = ยังไม่ได้เลือก)
 * @param serialNo เลขยาง ใช้เป็นหัวข้อ modal
 */
export function TireHistoryModal({
  tireId,
  serialNo,
  subtitle,
  axleTypes,
  onClose,
}: {
  tireId: string | null
  serialNo: string
  subtitle?: React.ReactNode
  axleTypes?: readonly AxleTypeLayoutSource[]
  onClose: () => void
}) {
  const load = React.useCallback(
    () =>
      tireId
        ? getTireHistoryAction(tireId)
        : Promise.resolve<ActionResult<TireEventRow[]>>({ ok: true, data: [] }),
    [tireId],
  )

  return (
    <HistoryModal
      open={tireId !== null}
      onClose={onClose}
      title={`ประวัติการใช้งาน · ${serialNo}`}
      description={subtitle ?? 'ทะเบียนรถ ตำแหน่ง วันที่ และเลขไมล์ของทุกครั้งที่ถอด-ใส่'}
      load={load}
      render={(rows: TireEventRow[]) => <TireEventTable events={rows} axleTypes={axleTypes} />}
    />
  )
}

/**
 * ประวัติการถอด-ใส่ยางของรถ 1 คัน
 * @param vehicleId รหัสรถที่จะดูประวัติ (null = ยังไม่ได้เลือก)
 * @param plateNo ทะเบียนรถ ใช้เป็นหัวข้อ modal
 * @param axleType ประเภทเพลาของรถคันนี้ ใช้แปลชื่อตำแหน่งล้อ
 */
export function VehicleHistoryModal({
  vehicleId,
  plateNo,
  subtitle,
  axleType,
  axleTypes,
  onClose,
}: {
  vehicleId: string | null
  plateNo: string
  subtitle?: React.ReactNode
  axleType?: string | null
  axleTypes?: readonly AxleTypeLayoutSource[]
  onClose: () => void
}) {
  const load = React.useCallback(
    () =>
      vehicleId
        ? getVehicleHistoryAction(vehicleId)
        : Promise.resolve<ActionResult<VehicleEventRow[]>>({ ok: true, data: [] }),
    [vehicleId],
  )

  return (
    <HistoryModal
      open={vehicleId !== null}
      onClose={onClose}
      title={`ประวัติการถอด-ใส่ยาง · ${plateNo}`}
      description={subtitle ?? 'เลขยาง ตำแหน่งที่เปลี่ยน วันที่ และเลขไมล์ของทุกครั้งที่ถอด-ใส่'}
      load={load}
      render={(rows: VehicleEventRow[]) => (
        <VehicleEventTable events={rows} axleType={axleType} axleTypes={axleTypes} />
      )}
    />
  )
}
