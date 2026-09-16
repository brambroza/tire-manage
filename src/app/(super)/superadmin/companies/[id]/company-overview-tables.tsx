'use client'

import { Badge, Table, TableWrap, Td, Th } from '@/components/ui'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { TireSpec } from '@/components/tire-spec'
import { positionLabel } from '@/lib/axle-layouts'
import { TIRE_STATUS_LABEL, TIRE_STATUS_TONE, formatKm, formatThaiDate } from '@/lib/utils'
import type { TireOverview } from '@/lib/database.types'

export interface EventRow {
  id: string
  event_type: string
  event_date: string
  position_code: string | null
  distance_km: number | null
  tires: { serial_no: string } | null
  vehicles: { plate_no: string; axle_type: string } | null
  removal_reasons: { name: string } | null
  profiles: { full_name: string } | null
}

/** ตารางประวัติถอด-ใส่ยางของลูกค้า พร้อมแบ่งหน้า (10 / 20 / ทั้งหมด) */
export function RecentEventsTable({ events }: { events: EventRow[] }) {
  const pagination = usePagination(events)

  return (
    <TableWrap>
      <Table className="min-w-[720px]">
        <thead>
          <tr>
            <Th>วันที่</Th>
            <Th>รายการ</Th>
            <Th>เลขยาง</Th>
            <Th>รถ / ตำแหน่ง</Th>
            <Th className="text-right">ระยะรอบนี้</Th>
            <Th>สาเหตุ</Th>
            <Th>ผู้บันทึก</Th>
          </tr>
        </thead>
        <tbody>
          {pagination.pageItems.map((e) => (
            <tr key={e.id} className="transition-colors hover:bg-brand-50/40">
              <Td className="whitespace-nowrap">{formatThaiDate(e.event_date)}</Td>
              <Td>
                <Badge tone={e.event_type === 'mount' ? 'brand' : 'amber'}>
                  {e.event_type === 'mount' ? 'ใส่ยาง' : 'ถอดยาง'}
                </Badge>
              </Td>
              <Td className="font-medium text-ink-900">{e.tires?.serial_no ?? '-'}</Td>
              <Td>
                {e.vehicles?.plate_no ?? '-'}
                <p className="text-xs text-ink-400">
                  {positionLabel(e.position_code, e.vehicles?.axle_type)}
                </p>
              </Td>
              <Td className="text-right">
                {e.distance_km !== null ? formatKm(e.distance_km) : '-'}
              </Td>
              <Td>{e.removal_reasons?.name ?? '-'}</Td>
              <Td className="text-ink-500">{e.profiles?.full_name ?? '-'}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination state={pagination} itemLabel="รายการ" />
    </TableWrap>
  )
}

/** ตารางยางเรียงตามระยะสะสม พร้อมแบ่งหน้า (10 / 20 / ทั้งหมด) */
export function TopTiresTable({ tires }: { tires: TireOverview[] }) {
  const pagination = usePagination(tires)

  return (
    <TableWrap>
      <Table className="min-w-[820px]">
        <thead>
          <tr>
            <Th>เลขยาง</Th>
            <Th>ขนาด / ยี่ห้อ รุ่น</Th>
            <Th>สถานะ</Th>
            <Th>อยู่ที่</Th>
            <Th>ดอกยาง</Th>
            <Th className="text-right">ระยะรอบนี้</Th>
            <Th className="text-right">ระยะสะสม</Th>
          </tr>
        </thead>
        <tbody>
          {pagination.pageItems.map((t) => (
            <tr key={t.id} className="transition-colors hover:bg-brand-50/40">
              <Td className="font-medium text-ink-900">{t.serial_no}</Td>
              <Td>
                <TireSpec size={t.size} brandName={t.brand_name} modelName={t.model_name} />
              </Td>
              <Td><Badge tone={TIRE_STATUS_TONE[t.status]}>{TIRE_STATUS_LABEL[t.status]}</Badge></Td>
              <Td>
                {t.status === 'mounted'
                  ? `${t.plate_no} · ${positionLabel(t.position_code)}`
                  : 'คลังสินค้า'}
              </Td>
              <Td>{t.tread_mm !== null ? `${t.tread_mm} มม.` : '-'}</Td>
              <Td className="text-right">
                {t.status === 'mounted' ? formatKm(t.current_run_km) : '-'}
              </Td>
              <Td className="text-right font-medium">{formatKm(t.lifetime_km)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination state={pagination} itemLabel="เส้น" />
    </TableWrap>
  )
}
