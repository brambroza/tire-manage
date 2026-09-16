'use client'

import Link from 'next/link'
import { Check, CircleDot, Package, Repeat, X } from 'lucide-react'
import { Card, CardHeader, EmptyState, Table, TableWrap, Td, Th } from '@/components/ui'
import { Pagination, SMALL_PAGE_SIZE_OPTIONS, usePagination } from '@/components/ui/pagination'
import { TireThumb } from '@/components/tire-thumb'
import { TireSpec } from '@/components/tire-spec'
import { positionLabel } from '@/lib/axle-layouts'
import { TIRE_STATUS_LABEL, cn, formatKm } from '@/lib/utils'
import { StatusChip, TD_LG, TH_LG, type DashTone } from './dashboard-ui'
import type { TireStatus } from '@/lib/database.types'

/** ข้อมูลยางเท่าที่ตารางระยะสะสมต้องใช้ — ส่งจาก server component มาให้ client */
export interface TopMileageRow {
  id: string
  serialNo: string
  imageUrl: string | null
  brandName: string | null
  modelName: string | null
  size: string | null
  status: TireStatus
  plateNo: string | null
  positionCode: string | null
  lifetimeKm: number
}

/** โทนสี + ไอคอนของสถานะยาง — สีเดียวกับโดนัทและ legend ด้านบน */
const STATUS_CHIP: Record<TireStatus, { tone: DashTone; icon: React.ReactNode }> = {
  mounted: { tone: 'good', icon: <Check strokeWidth={3} /> },
  in_stock: { tone: 'info', icon: <Package /> },
  scrapped: { tone: 'scrap', icon: <X strokeWidth={3} /> },
  retreading: { tone: 'warn', icon: <Repeat /> },
}

/**
 * ตาราง "ยางที่มีระยะสะสมสูงสุด" พร้อมแบ่งหน้า (5 / 10 / 20 / ทั้งหมด) ค่าเริ่มต้น 5 แถว
 * @param rows ยางเรียงตามระยะสะสมมากไปน้อยจากฝั่ง server
 */
export function TopMileageTable({ rows }: { rows: TopMileageRow[] }) {
  const pagination = usePagination(rows, 5)

  return (
    <Card className="mt-4">
      <CardHeader
        title={<span className="text-lg">ยางที่มีระยะสะสมสูงสุด</span>}
        description={<span className="text-[15px] text-ink-700">เรียงตามระยะทางสะสมตลอดอายุยาง</span>}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<CircleDot className="size-6" />}
          title="ยังไม่มียางในระบบ"
          description="เพิ่มยางเข้าคลังได้ที่เมนู “คลังยาง”"
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th className={cn(TH_LG, 'w-20')}>รูป</Th>
                  <Th className={TH_LG}>เลขยาง</Th>
                  <Th className={cn(TH_LG, 'hidden lg:table-cell')}>ขนาด / ยี่ห้อ รุ่น</Th>
                  <Th className={TH_LG}>สถานะ</Th>
                  <Th className={cn(TH_LG, 'hidden sm:table-cell')}>ตำแหน่งปัจจุบัน</Th>
                  <Th className={cn(TH_LG, 'text-right')}>ระยะสะสม</Th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((t) => {
                  const chip = STATUS_CHIP[t.status]
                  return (
                    <tr key={t.id} className="transition-colors odd:bg-surface-alt/60 hover:bg-brand-50/60">
                      <Td className={TD_LG}>
                        <TireThumb
                          src={t.imageUrl}
                          alt={[t.modelName, t.brandName].filter(Boolean).join(' ')}
                          size="md"
                        />
                      </Td>
                      <Td className={TD_LG}>
                        <Link href={`/tires/${t.id}`} className="text-base font-bold text-brand-700 underline underline-offset-4 hover:text-brand-800">
                          {t.serialNo}
                        </Link>
                        <TireSpec
                          size={t.size}
                          brandName={t.brandName}
                          modelName={t.modelName}
                          className="mt-0.5 lg:hidden"
                        />
                      </Td>
                      <Td className={cn(TD_LG, 'hidden lg:table-cell')}>
                        <TireSpec size={t.size} brandName={t.brandName} modelName={t.modelName} />
                      </Td>
                      <Td className={TD_LG}>
                        <StatusChip tone={chip.tone} icon={chip.icon}>{TIRE_STATUS_LABEL[t.status]}</StatusChip>
                      </Td>
                      <Td className={cn(TD_LG, 'hidden sm:table-cell')}>
                        {t.status === 'mounted'
                          ? `${t.plateNo} · ${positionLabel(t.positionCode)}`
                          : 'คลังสินค้า'}
                      </Td>
                      <Td className={cn(TD_LG, 'text-right text-lg font-bold text-ink-900')}>{formatKm(t.lifetimeKm)}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination state={pagination} itemLabel="เส้น" sizeOptions={SMALL_PAGE_SIZE_OPTIONS} />
        </>
      )}
    </Card>
  )
}
