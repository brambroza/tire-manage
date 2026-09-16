'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { History, Pencil, Plus, Power, PowerOff, Repeat, Truck } from 'lucide-react'
import { ALERT_ROW, Badge, Button, Card, EmptyState, Table, TableWrap, Td, Th } from '@/components/ui'
import { ConfirmDialog } from '@/components/ui/modal'
import { SearchInput } from '@/components/search-input'
import { ExportButtons } from '@/components/export-buttons'
import { VehicleHistoryModal } from '@/components/history-modal'
import { getLayout } from '@/lib/axle-layouts'
import { formatKm } from '@/lib/utils'
import { VehicleFormModal } from './vehicle-form'
import { deactivateVehicle, reactivateVehicle } from './actions'
import type { AxleType, Vehicle } from '@/lib/database.types'

export interface VehicleRow extends Vehicle {
  /** จำนวนยางที่ติดตั้งอยู่บนรถคันนี้ */
  mounted_count: number
  /** จำนวนครั้งที่ถอดยางในช่วงที่ตั้งไว้ — มีค่าเฉพาะคันที่ถึงเกณฑ์ "เปลี่ยนบ่อย" */
  frequent_change_count?: number | null
}

/** ตารางรายการรถ + ฟอร์มเพิ่ม/แก้ไข */
export function VehiclesClient({
  vehicles,
  axleTypes,
  companyId,
  enableLinks = true,
  enableHistory = false,
  changeAlertLabel,
  companyName = 'Dream Tire',
}: {
  vehicles: VehicleRow[]
  /** ประเภทเพลาจาก Supabase ใช้ทั้งชื่อ จำนวนล้อ และฟอร์มรถ */
  axleTypes: AxleType[]
  /** ระบุเมื่อ super admin จัดการรถแทนลูกค้า */
  companyId?: string
  /** ปิดลิงก์ไปหน้ารายละเอียดรถ (หน้า super admin ยังไม่มี route นั้น) */
  enableLinks?: boolean
  /** เปิดปุ่มดูประวัติแบบ modal — ใช้กับหน้า super admin ที่ไม่มี route รายละเอียด */
  enableHistory?: boolean
  /** คำอธิบายเกณฑ์ "เปลี่ยนบ่อย" สำหรับ tooltip ของป้าย */
  changeAlertLabel?: string
  /** ชื่อบริษัทสำหรับหัวรายงานที่ส่งออก */
  companyName?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Vehicle | null>(null)
  const [confirm, setConfirm] = React.useState<VehicleRow | null>(null)
  /** รถที่กำลังเปิดดูประวัติ (null = ปิด modal) */
  const [history, setHistory] = React.useState<VehicleRow | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  /** รูปแบบไฟล์ที่กำลังสร้างอยู่ (null = ว่าง) */
  const [exporting, setExporting] = React.useState<'excel' | 'pdf' | null>(null)

  /** ส่งออกรายการรถที่แสดงอยู่ (ตามคำค้นหาปัจจุบัน) เป็น Excel หรือ PDF */
  async function handleExport(format: 'excel' | 'pdf') {
    setExporting(format)
    setMessage(null)
    try {
      const exporter = await import('./vehicles-export')
      const input = { companyName, searchTerm: searchParams.get('q') ?? '', vehicles, axleTypes }
      if (format === 'excel') await exporter.exportVehiclesExcel(input)
      else await exporter.exportVehiclesPdf(input)
    } catch (error) {
      console.error(error)
      setMessage('สร้างไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setExporting(null)
    }
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(v: Vehicle) {
    setEditing(v)
    setFormOpen(true)
  }

  async function toggleActive(v: VehicleRow) {
    setBusy(true)
    const result = v.is_active ? await deactivateVehicle(v.id) : await reactivateVehicle(v.id)
    setBusy(false)
    setConfirm(null)
    if (!result.ok) setMessage(result.error)
    else router.refresh()
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput placeholder="ค้นหาทะเบียนรถ, ยี่ห้อ, รุ่น..." className="sm:max-w-md" />
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <ExportButtons
            exporting={exporting}
            disabled={vehicles.length === 0}
            onExport={handleExport}
          />
          <Button onClick={openCreate}>
            <Plus className="size-4.5" />
            เพิ่มรถใหม่
          </Button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {message}
        </div>
      )}

      <Card>
        {vehicles.length === 0 ? (
          <EmptyState
            icon={<Truck className="size-6" />}
            title="ยังไม่มีรถในระบบ"
            description="เพิ่มรถคันแรกเพื่อเริ่มบันทึกการถอด-ใส่ยาง"
            action={<Button onClick={openCreate}><Plus className="size-4.5" />เพิ่มรถใหม่</Button>}
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>ทะเบียนรถ</Th>
                  <Th className="hidden lg:table-cell">ยี่ห้อ / รุ่น</Th>
                  <Th className="hidden md:table-cell">ประเภทเพลา</Th>
                  <Th className="text-right">เลขไมล์ล่าสุด</Th>
                  <Th className="text-center">ยางที่ติดตั้ง</Th>
                  <Th className="hidden sm:table-cell">สถานะ</Th>
                  <Th className="text-right">จัดการ</Th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const layout = getLayout(v.axle_type, axleTypes)
                  const frequent = v.frequent_change_count ?? null
                  return (
                    <tr key={v.id} className={frequent !== null ? ALERT_ROW.danger : ALERT_ROW.none}>
                      <Td>
                        {enableLinks ? (
                          <Link
                            href={`/vehicles/${v.id}`}
                            className="font-medium text-ink-900 hover:text-brand-600"
                          >
                            {v.plate_no}
                          </Link>
                        ) : enableHistory ? (
                          <button
                            type="button"
                            onClick={() => setHistory(v)}
                            className="font-medium text-ink-900 underline decoration-dotted underline-offset-4 hover:text-brand-600"
                          >
                            {v.plate_no}
                          </button>
                        ) : (
                          <span className="font-medium text-ink-900">{v.plate_no}</span>
                        )}
                        {frequent !== null && (
                          <Badge tone="rose" className="ml-2 align-middle" title={changeAlertLabel}>
                            <Repeat className="size-3" />
                            เปลี่ยนบ่อย {frequent} ครั้ง
                          </Badge>
                        )}
                        <p className="text-xs text-ink-400">
                          {v.province}
                          <span className="lg:hidden">
                            {[  v.model , v.brand].filter(Boolean).join(' ')
                              ? ` · ${[ v.model , v.brand ].filter(Boolean).join(' ')}`
                              : ''}
                          </span>
                        </p>
                      </Td>
                      <Td className="hidden lg:table-cell">
                        {[v.brand, v.model].filter(Boolean).join(' ') || '-'}
                      </Td>
                      <Td className="hidden whitespace-nowrap md:table-cell">
                        <Badge tone="brand">{v.axle_type}</Badge>
                        <span className="ml-2 text-sm text-ink-400">{layout.wheelCount} ตำแหน่ง</span>
                      </Td>
                      <Td className="text-right">
                        {formatKm(v.current_mileage)}
                        {enableLinks && v.is_active && (
                          <Link
                            href={`/mileage?vehicle=${v.id}`}
                            className="mt-0.5 block text-xs font-medium text-brand-600 hover:underline"
                          >
                            บันทึกไมล์
                          </Link>
                        )}
                      </Td>
                      <Td className="text-center">
                        <span className={v.mounted_count === layout.wheelCount ? 'text-emerald-600' : 'text-amber-600'}>
                          {v.mounted_count}/{layout.wheelCount}
                        </span>
                      </Td>
                      <Td className="hidden sm:table-cell">
                        <Badge tone={v.is_active ? 'emerald' : 'slate'}>
                          {v.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          {enableHistory && (
                            <button
                              type="button"
                              onClick={() => setHistory(v)}
                              aria-label="ดูประวัติ"
                              className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                            >
                              <History className="size-4.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(v)}
                            aria-label="แก้ไข"
                            className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                          >
                            <Pencil className="size-4.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirm(v)}
                            aria-label={v.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                            className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-rose-50 hover:text-rose-600"
                          >
                            {v.is_active ? <PowerOff className="size-4.5" /> : <Power className="size-4.5" />}
                          </button>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <VehicleFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        vehicle={editing}
        companyId={companyId}
        axleTypes={axleTypes}
      />

      <VehicleHistoryModal
        vehicleId={history?.id ?? null}
        plateNo={history?.plate_no ?? ''}
        subtitle={history ? getLayout(history.axle_type, axleTypes).name : undefined}
        axleType={history?.axle_type}
        axleTypes={axleTypes}
        onClose={() => setHistory(null)}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && toggleActive(confirm)}
        loading={busy}
        title={confirm?.is_active ? 'ปิดใช้งานรถคันนี้?' : 'เปิดใช้งานรถคันนี้?'}
        confirmLabel={confirm?.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        message={
          confirm?.is_active
            ? `รถทะเบียน ${confirm?.plate_no} จะไม่แสดงในรายการเลือกของช่าง แต่ประวัติทั้งหมดยังคงอยู่`
            : `รถทะเบียน ${confirm?.plate_no} จะกลับมาใช้งานได้ตามปกติ`
        }
      />
    </>
  )
}
