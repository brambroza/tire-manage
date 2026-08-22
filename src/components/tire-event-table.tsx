/**
 * ตารางประวัติการถอด-ใส่ยาง (ledger `tire_events`)
 *
 * มี 2 มุมมองที่ใช้คนละชุดคอลัมน์
 *   - TireEventTable    : ยาง 1 เส้น เคยไปอยู่รถคันไหน ตำแหน่งใด
 *   - VehicleEventTable : รถ 1 คัน เคยถอด-ใส่ยางเส้นไหน ตำแหน่งใด
 *
 * ใช้ร่วมกันระหว่างหน้ารายละเอียดฝั่งลูกค้าและ modal ประวัติฝั่ง super admin
 */

import { Badge, EmptyState, Table, TableWrap, Td, Th } from '@/components/ui'
import { positionLabel, type AxleTypeLayoutSource } from '@/lib/axle-layouts'
import { formatKm, formatThaiDate } from '@/lib/utils'
import type { TireEventRow, VehicleEventRow } from '@/lib/tire-events'

/** ป้ายชนิดรายการ mount/unmount — ใช้สีเดียวกันทุกตาราง */
function EventBadge({ type }: { type: string }) {
  return (
    <Badge tone={type === 'mount' ? 'brand' : 'amber'}>
      {type === 'mount' ? 'ใส่ยาง' : 'ถอดยาง'}
    </Badge>
  )
}

/**
 * ประวัติของยาง 1 เส้น — เรียงล่าสุดขึ้นก่อน
 * @param events รายการ event ที่ query มาแล้ว
 * @param axleTypes นิยามเพลาจากฐานข้อมูล ใช้แปลรหัสตำแหน่งเป็นชื่อไทย
 */
export function TireEventTable({
  events,
  axleTypes,
  emptyTitle = 'ยางเส้นนี้ยังไม่เคยถูกติดตั้ง',
}: {
  events: TireEventRow[]
  axleTypes?: readonly AxleTypeLayoutSource[]
  emptyTitle?: string
}) {
  if (events.length === 0) return <EmptyState title={emptyTitle} />

  return (
    <TableWrap>
      <Table className="min-w-[720px]">
        <thead>
          <tr>
            <Th>วันที่</Th>
            <Th>รายการ</Th>
            <Th>รถ / ตำแหน่ง</Th>
            <Th className="text-right">เลขไมล์</Th>
            <Th className="text-right">ระยะรอบนี้</Th>
            <Th>ดอกยาง</Th>
            <Th>สาเหตุ</Th>
            <Th>ผู้บันทึก</Th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="transition-colors hover:bg-brand-50/40">
              <Td className="whitespace-nowrap">{formatThaiDate(e.event_date)}</Td>
              <Td><EventBadge type={e.event_type} /></Td>
              <Td>
                {e.vehicles?.plate_no ?? '-'}
                <p className="text-xs text-ink-400">
                  {positionLabel(e.position_code, e.vehicles?.axle_type, axleTypes)}
                </p>
              </Td>
              <Td className="text-right">{formatKm(e.odometer)}</Td>
              <Td className="text-right">{e.distance_km !== null ? formatKm(e.distance_km) : '-'}</Td>
              <Td>{e.tread_mm !== null ? `${e.tread_mm} มม.` : '-'}</Td>
              <Td>{e.removal_reasons?.name ?? '-'}</Td>
              <Td className="text-ink-500">{e.profiles?.full_name ?? '-'}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  )
}

/**
 * ประวัติการถอด-ใส่ยางของรถ 1 คัน — เรียงล่าสุดขึ้นก่อน
 * @param events รายการ event ที่ query มาแล้ว
 * @param axleType ประเภทเพลาของรถคันนี้ ใช้แปลรหัสตำแหน่งเป็นชื่อไทย
 * @param axleTypes นิยามเพลาจากฐานข้อมูล
 */
export function VehicleEventTable({
  events,
  axleType,
  axleTypes,
  emptyTitle = 'ยังไม่มีประวัติ',
}: {
  events: VehicleEventRow[]
  axleType?: string | null
  axleTypes?: readonly AxleTypeLayoutSource[]
  emptyTitle?: string
}) {
  if (events.length === 0) return <EmptyState title={emptyTitle} />

  return (
    <TableWrap>
      <Table className="min-w-[720px]">
        <thead>
          <tr>
            <Th>วันที่</Th>
            <Th>รายการ</Th>
            <Th>เลขยาง</Th>
            <Th>ตำแหน่ง</Th>
            <Th className="text-right">เลขไมล์</Th>
            <Th className="text-right">ระยะรอบนี้</Th>
            <Th>สาเหตุ</Th>
            <Th>ผู้บันทึก</Th>
          </tr>
        </thead>
        <tbody>
          {events.map((h) => (
            <tr key={h.id} className="transition-colors hover:bg-brand-50/40">
              <Td className="whitespace-nowrap">{formatThaiDate(h.event_date)}</Td>
              <Td><EventBadge type={h.event_type} /></Td>
              <Td className="font-medium text-ink-900">{h.tires?.serial_no ?? '-'}</Td>
              <Td>{positionLabel(h.position_code, axleType, axleTypes)}</Td>
              <Td className="text-right">{formatKm(h.odometer)}</Td>
              <Td className="text-right">{h.distance_km !== null ? formatKm(h.distance_km) : '-'}</Td>
              <Td>{h.removal_reasons?.name ?? '-'}</Td>
              <Td className="text-ink-500">{h.profiles?.full_name ?? '-'}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  )
}
