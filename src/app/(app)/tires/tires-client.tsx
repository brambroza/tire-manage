'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CircleDot, History, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { ALERT_ROW, Badge, Button, Card, EmptyState, Table, TableWrap, Td, Th, alertLevel } from '@/components/ui'
import { ConfirmDialog } from '@/components/ui/modal'
import { Pagination, SMALL_PAGE_SIZE_OPTIONS, usePagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/search-input'
import { TireThumb } from '@/components/tire-thumb'
import { TireSpec } from '@/components/tire-spec'
import { TireHistoryModal } from '@/components/history-modal'
import { positionLabel, type AxleTypeLayoutSource } from '@/lib/axle-layouts'
import {
  TIRE_STATUS_LABEL, TIRE_STATUS_TONE, cn, diffDays, formatDuration, formatKm, formatThaiDate, treadPercent,
} from '@/lib/utils'
import type { LastRemoval } from '@/lib/tire-events'
import { TireFormModal, type ModelOption } from './tire-form'
import { restoreTire, scrapTire } from './actions'
import type { Tire, TireOverview, TireStatus } from '@/lib/database.types'

const FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'mounted', label: 'อยู่บนรถ' },
  { value: 'in_stock', label: 'อยู่ในคลัง' },
  { value: 'scrapped', label: 'ตัดจำหน่าย' },
  { value: 'alert', label: 'ถึงเกณฑ์เตือน' },
]

/** ตารางคลังยาง + ตัวกรองสถานะ + ฟอร์มเพิ่ม/แก้ไข */
export function TiresClient({
  tires,
  rawTires,
  models,
  lastRemovals = {},
  canManage,
  canAdd = false,
  companyId,
  basePath = '/tires',
  enableLinks = true,
  enableHistory = false,
  axleTypes,
}: {
  tires: TireOverview[]
  /** ข้อมูลดิบสำหรับเปิดฟอร์มแก้ไข */
  rawTires: Record<string, Tire>
  models: ModelOption[]
  /** การถอดครั้งล่าสุดของยางที่ไม่ได้อยู่บนรถ (key = tire id) */
  lastRemovals?: Record<string, LastRemoval>
  /** แก้ไข/ตัดจำหน่ายยางได้ */
  canManage: boolean
  /** เพิ่มยางเข้าคลังได้ — เปิดเฉพาะ super admin (ลูกค้าเพิ่มยางเองไม่ได้ตามที่ตกลง) */
  canAdd?: boolean
  /** ระบุเมื่อ super admin จัดการคลังยางแทนลูกค้า */
  companyId?: string
  /** route ของหน้านี้ ใช้ตอนอัปเดตตัวกรองใน query string */
  basePath?: string
  /** ปิดลิงก์ไปหน้ารายละเอียด (หน้า super admin ยังไม่มี route เหล่านั้น) */
  enableLinks?: boolean
  /** เปิดปุ่มดูประวัติแบบ modal — ใช้กับหน้า super admin ที่ไม่มี route รายละเอียด */
  enableHistory?: boolean
  /** นิยามเพลา ใช้แปลรหัสตำแหน่งล้อในตารางประวัติ */
  axleTypes?: readonly AxleTypeLayoutSource[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const status = params.get('status') ?? 'all'

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Tire | null>(null)
  const [confirm, setConfirm] = React.useState<TireOverview | null>(null)
  /** ยางที่กำลังเปิดดูประวัติ (null = ปิด modal) */
  const [history, setHistory] = React.useState<TireOverview | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  /** แบ่งหน้าฝั่ง client — เริ่มต้น 10 เส้น/หน้า, กลับหน้าแรกเองเมื่อค้นหา/เปลี่ยนตัวกรอง */
  const pagination = usePagination(tires)

  function setFilter(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') next.delete('status')
    else next.set('status', value)
    const qs = next.toString()
    router.replace(`${basePath}${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  async function toggleScrap(t: TireOverview) {
    setBusy(true)
    const result = t.status === 'scrapped' ? await restoreTire(t.id) : await scrapTire(t.id)
    setBusy(false)
    setConfirm(null)
    if (!result.ok) setMessage(result.error)
    else router.refresh()
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput placeholder="ค้นหาเลขยาง, ยี่ห้อ, รุ่น, ทะเบียนรถ..." className="lg:max-w-md" />

        <div className="flex flex-wrap gap-1.5 rounded-xl bg-brand-50 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                'tap-target rounded-lg px-3.5 text-sm font-medium transition-colors',
                status === f.value ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-700',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {canAdd && (
          <Button onClick={() => { setEditing(null); setFormOpen(true) }} className="lg:ml-auto">
            <Plus className="size-4.5" />
            เพิ่มยาง
          </Button>
        )}
      </div>

      {message && (
        <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {message}
        </div>
      )}

      <Card>
        {tires.length === 0 ? (
          <EmptyState
            icon={<CircleDot className="size-6" />}
            title="ไม่พบยางตามเงื่อนไขที่ค้นหา"
            description="ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ"
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[560px]">
              <thead>
                <tr>
                  <Th className="w-16">รูป</Th>
                  <Th>เลขยาง</Th>
                  <Th className="hidden lg:table-cell">ขนาด / ยี่ห้อ รุ่น</Th>
                  <Th>สถานะ</Th>
                  <Th>ตำแหน่งปัจจุบัน</Th>
                  <Th className="hidden md:table-cell">ดอกยาง</Th>
                  <Th className="hidden text-right xl:table-cell">ระยะรอบล่าสุด</Th>
                  <Th className="hidden text-right xl:table-cell">ระยะเวลาใช้งาน</Th>
                  <Th className="text-right">ระยะสะสม</Th>
                  {canManage && <Th className="text-right">จัดการ</Th>}
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((t) => {
                  const pct = treadPercent(t.tread_mm, t.new_tread_mm)
                  const alert = t.status === 'mounted' && t.current_run_km >= t.alert_km
                  const level = alertLevel(
                    t.status === 'mounted', t.current_run_km, t.alert_km, t.tread_mm, t.alert_tread_mm,
                  )
                  // ยางในคลัง/ตัดจำหน่าย: บอกที่มาว่าถอดจากรถคันไหน ที่เลขไมล์เท่าไร
                  const removal = t.status !== 'mounted' ? lastRemovals[t.id] : undefined
                  // ระยะเวลาใช้งาน: มีเลขไมล์หรือไม่ก็นับได้ — mounted นับถึงวันนี้, ถอดแล้วนับถึงวันที่ถอด
                  const usageDays = t.status === 'mounted' && t.mounted_at
                    ? diffDays(t.mounted_at, new Date().toISOString())
                    : removal?.mounted_at
                      ? diffDays(removal.mounted_at, removal.event_date)
                      : null
                  return (
                    <tr key={t.id} className={cn(ALERT_ROW[level], t.status === 'scrapped' && 'opacity-70')}>
                      <Td>
                        <TireThumb
                          src={t.image_url}
                          alt={[t.model_name, t.brand_name].filter(Boolean).join(' ')}
                        />
                      </Td>
                      <Td>
                        {enableLinks ? (
                          <Link href={`/tires/${t.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                            {t.serial_no}
                          </Link>
                        ) : enableHistory ? (
                          <button
                            type="button"
                            onClick={() => setHistory(t)}
                            className="font-medium text-ink-900 underline decoration-dotted underline-offset-4 hover:text-brand-600"
                          >
                            {t.serial_no}
                          </button>
                        ) : (
                          <span className="font-medium text-ink-900">{t.serial_no}</span>
                        )}
                        {/* จอแคบ: ยุบสเปกยางมาไว้ใต้เลขยาง */}
                        <TireSpec
                          size={t.size}
                          brandName={t.brand_name}
                          modelName={t.model_name}
                          className="mt-1 lg:hidden"
                        />
                        {t.dot && <p className="text-xs text-ink-400">DOT {t.dot}</p>}
                      </Td>
                      <Td className="hidden lg:table-cell">
                        <TireSpec size={t.size} brandName={t.brand_name} modelName={t.model_name} />
                      </Td>
                      <Td>
                        <Badge tone={TIRE_STATUS_TONE[t.status as TireStatus]}>
                          {TIRE_STATUS_LABEL[t.status as TireStatus]}
                        </Badge>
                      </Td>
                      <Td>
                        {t.status === 'mounted' ? (
                          <>
                            {enableLinks ? (
                              <Link href={`/vehicles/${t.vehicle_id}`} className="font-medium hover:text-brand-600">
                                {t.plate_no}
                              </Link>
                            ) : (
                              <span className="font-medium">{t.plate_no}</span>
                            )}
                            <p className="text-xs text-ink-400">{positionLabel(t.position_code)}</p>
                          </>
                        ) : removal ? (
                          <>
                            <span className="text-ink-400">คลังสินค้า</span>
                            {/* บังคับ 3 บรรทัดคงที่: ที่มา / วันที่-เลขไมล์ / สาเหตุที่ถอด */}
                            <div className="mt-0.5 max-w-56 space-y-0.5 text-xs text-ink-400">
                              <p className="truncate text-ink-700">
                                <span className="font-medium">{removal.plate_no ?? 'รถที่ถูกลบแล้ว'}</span>
                                {removal.position_code && (
                                  <span className="text-ink-400"> · {positionLabel(removal.position_code)}</span>
                                )}
                              </p>
                              <p className="truncate">
                                {formatThaiDate(removal.event_date)} · {formatKm(removal.odometer)}
                                {/* จอแคบไม่มีคอลัมน์ "ระยะรอบล่าสุด" — ยุบมาไว้ตรงนี้ */}
                                {removal.distance_km !== null && (
                                  <span className="xl:hidden"> · ใช้ไป {formatKm(removal.distance_km)}</span>
                                )}
                              </p>
                              <p className="font-medium" title={removal.note ?? undefined}>
                                {removal.reason ?? '-'}
                                {removal.note && ` · ${removal.note}`}
                              </p>
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-400">คลังสินค้า</span>
                        )}
                      </Td>
                      <Td className="hidden md:table-cell">
                        {t.tread_mm !== null
                          ? <span className={cn(t.tread_mm <= t.alert_tread_mm && 'font-semibold text-rose-600')}>
                            {t.tread_mm} มม.{pct !== null ? ` (${pct}%)` : ''}
                          </span>
                          : '-'}
                      </Td>
                      <Td className={cn('hidden text-right xl:table-cell', alert && 'font-semibold text-rose-600')}>
                        {t.status === 'mounted'
                          ? formatKm(t.current_run_km)
                          : removal?.distance_km !== null && removal?.distance_km !== undefined
                            ? <span className="text-ink-500">{formatKm(removal.distance_km)}</span>
                            : '-'}
                      </Td>
                      <Td className="hidden text-right xl:table-cell">{formatDuration(usageDays)}</Td>
                      <Td className="text-right font-medium">{formatKm(t.lifetime_km)}</Td>
                      {canManage && (
                        <Td>
                          <div className="flex items-center justify-end gap-1">
                            {enableHistory && (
                              <button
                                type="button"
                                onClick={() => setHistory(t)}
                                aria-label="ดูประวัติ"
                                className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                              >
                                <History className="size-4.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setEditing(rawTires[t.id] ?? null); setFormOpen(true) }}
                              aria-label="แก้ไข"
                              className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                            >
                              <Pencil className="size-4.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirm(t)}
                              aria-label={t.status === 'scrapped' ? 'นำกลับเข้าคลัง' : 'ตัดจำหน่าย'}
                              className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-rose-50 hover:text-rose-600"
                            >
                              {t.status === 'scrapped'
                                ? <Undo2 className="size-4.5" />
                                : <Trash2 className="size-4.5" />}
                            </button>
                          </div>
                        </Td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            <Pagination state={pagination} itemLabel="เส้น" sizeOptions={SMALL_PAGE_SIZE_OPTIONS} />
          </TableWrap>
        )}
      </Card>

      <TireFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        tire={editing}
        models={models}
        companyId={companyId}
      />

      <TireHistoryModal
        tireId={history?.id ?? null}
        serialNo={history?.serial_no ?? ''}
        subtitle={[history?.size, history?.brand_name, history?.model_name]
          .filter(Boolean)
          .join(' · ') || undefined}
        axleTypes={axleTypes}
        onClose={() => setHistory(null)}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && toggleScrap(confirm)}
        loading={busy}
        title={confirm?.status === 'scrapped' ? 'นำยางกลับเข้าคลัง?' : 'ตัดจำหน่ายยางเส้นนี้?'}
        confirmLabel={confirm?.status === 'scrapped' ? 'นำกลับเข้าคลัง' : 'ตัดจำหน่าย'}
        message={
          confirm?.status === 'scrapped'
            ? `ยาง ${confirm?.serial_no} จะกลับมาใช้งานได้อีกครั้ง`
            : `ยาง ${confirm?.serial_no} จะถูกตัดออกจากคลัง แต่ประวัติการใช้งานทั้งหมดยังคงอยู่`
        }
      />
    </>
  )
}
