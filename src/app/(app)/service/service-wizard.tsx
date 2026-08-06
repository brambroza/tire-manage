'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CircleDot, ListChecks, PencilLine, Package, Plus,
  Search, Trash2, Truck,
} from 'lucide-react'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Textarea,
} from '@/components/ui'
import { WheelDiagram, type WheelSlot } from '@/components/wheel-diagram'
import { TireThumb } from '@/components/tire-thumb'
import { TireFormModal, type ModelOption } from '../tires/tire-form'
import { getLayout, positionLabel, type WheelPosition } from '@/lib/axle-layouts'
import { cn, formatKm, formatNumber, todayISO } from '@/lib/utils'
import { applyServiceBatchAction } from './actions'

/* ------------------------------------------------------------------ types */

export interface VehicleLite {
  id: string
  plate_no: string
  province: string
  brand: string | null
  model: string | null
  axle_type: string
  current_mileage: number
}

export interface TireLite {
  id: string
  serial_no: string
  brand_name: string | null
  model_name: string | null
  size: string | null
  status: string
  tread_mm: number | null
  lifetime_km: number
  current_run_km: number
  vehicle_id: string | null
  position_code: string | null
  plate_no: string | null
  /** รูปยางจากแคตตาล็อก (ถ้ารุ่นนั้นมีรูป) */
  image_url: string | null
}

export interface ReasonOption {
  id: string
  name: string
  is_scrap: boolean
}

type Mode = 'unmount' | 'mount' | 'rotate'

const MODE_LABEL: Record<Mode, string> = {
  unmount: 'ถอดยาง',
  mount: 'ใส่ยาง',
  rotate: 'สลับตำแหน่ง',
}

const STEPS = ['เลือกยานพาหนะ', 'เลือกยาง / ตำแหน่ง', 'บันทึกรายละเอียด', 'ตรวจสอบและบันทึก']

/**
 * รายการงาน 1 บรรทัดในตะกร้า — ช่างเพิ่มได้หลายรายการต่อรถ 1 คัน
 * แล้วกดบันทึกทีเดียว (ระบบบันทึกแบบ all-or-nothing)
 */
interface DraftItem {
  key: string
  kind: Mode | 'manual_unmount'
  tireId: string | null
  serialNo: string
  brandModel: string
  positionCode: string | null
  targetPosition: string | null
  treadMm: number | null
  reasonId: string | null
  reasonLabel: string
  note: string | null
  manual: ManualTire | null
}

/** ข้อมูลยางที่ช่างคีย์เอง กรณีถอดยางที่ยังไม่มีข้อมูลในระบบ */
interface ManualTire {
  serial_no: string
  tire_model_id: string
  brand_name: string
  model_name: string
  size: string
  dot: string
  new_tread_mm: string
  /** เลขไมล์รถตอนที่ยางเส้นนี้ถูกใส่ (ถ้าทราบ) */
  mounted_odometer: string
}

const EMPTY_MANUAL: ManualTire = {
  serial_no: '',
  tire_model_id: '',
  brand_name: '',
  model_name: '',
  size: '',
  dot: '',
  new_tread_mm: '',
  mounted_odometer: '',
}

const ITEM_LABEL: Record<DraftItem['kind'], string> = {
  unmount: 'ถอดยาง',
  mount: 'ใส่ยาง',
  rotate: 'สลับตำแหน่ง',
  manual_unmount: 'ถอดยาง (คีย์เอง)',
}

const ITEM_TONE: Record<DraftItem['kind'], 'amber' | 'brand' | 'sky'> = {
  unmount: 'amber',
  mount: 'brand',
  rotate: 'sky',
  manual_unmount: 'amber',
}

/* ------------------------------------------------------------- component */

/**
 * ขั้นตอนบันทึกการถอด-ใส่ยางสำหรับช่างหน้างาน (ออกแบบให้ใช้นิ้วบน iPad)
 */
export function ServiceWizard({
  vehicles,
  tires,
  reasons,
  models,
  alertKm,
  initialVehicleId,
}: {
  vehicles: VehicleLite[]
  tires: TireLite[]
  reasons: ReasonOption[]
  models: ModelOption[]
  alertKm: number
  initialVehicleId?: string
}) {
  const router = useRouter()

  const [step, setStep] = React.useState(1)
  const [vehicleId, setVehicleId] = React.useState<string | null>(initialVehicleId ?? null)
  const [mode, setMode] = React.useState<Mode>('unmount')
  const [position, setPosition] = React.useState<string | null>(null)
  const [targetPosition, setTargetPosition] = React.useState<string | null>(null)
  const [tireId, setTireId] = React.useState<string | null>(null)

  const [odometer, setOdometer] = React.useState<string>(() => {
    const initial = vehicles.find((v) => v.id === initialVehicleId)
    return initial ? String(initial.current_mileage) : ''
  })
  const [tread, setTread] = React.useState<string>('')
  const [reasonId, setReasonId] = React.useState<string>('')
  const [note, setNote] = React.useState('')
  const [eventDate, setEventDate] = React.useState(todayISO())

  const [vehicleQuery, setVehicleQuery] = React.useState('')
  const [tireQuery, setTireQuery] = React.useState('')
  const [tireFormOpen, setTireFormOpen] = React.useState(false)
  const [manual, setManual] = React.useState<ManualTire>(EMPTY_MANUAL)

  const [items, setItems] = React.useState<DraftItem[]>([])
  /** ตัวนับสำหรับสร้าง key ของรายการในตะกร้า (ไม่ใช้ค่าสุ่มเพื่อให้ผลลัพธ์คงที่) */
  const itemSeq = React.useRef(0)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  const [savedCount, setSavedCount] = React.useState(0)

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null
  const layout = getLayout(vehicle?.axle_type)

  /* ------------------------------------------------ derived collections */

  const mountedOnVehicle = React.useMemo(
    () => tires.filter((t) => t.vehicle_id === vehicleId && t.status === 'mounted'),
    [tires, vehicleId],
  )

  const slots = React.useMemo(() => {
    const map: Record<string, WheelSlot> = {}
    for (const t of mountedOnVehicle) {
      if (!t.position_code) continue
      map[t.position_code] = {
        tireId: t.id,
        serialNo: t.serial_no,
        treadMm: t.tread_mm,
        lifetimeKm: t.lifetime_km,
        alert: t.current_run_km >= alertKm,
      }
    }
    return map
  }, [mountedOnVehicle, alertKm])

  /** ยางที่ถูกจองไว้ในตะกร้าแล้ว ไม่ให้เลือกซ้ำ */
  const usedTireIds = React.useMemo(
    () => new Set(items.map((i) => i.tireId).filter(Boolean) as string[]),
    [items],
  )

  /**
   * สภาพล้อ "หลังทำรายการในตะกร้าทั้งหมดแล้ว"
   * ใช้วาดแผนผังและตรวจว่าตำแหน่งไหนว่าง/ไม่ว่างสำหรับรายการถัดไป
   */
  const previewSlots = React.useMemo(() => {
    const map: Record<string, WheelSlot> = { ...slots }
    for (const item of items) {
      if (item.kind === 'unmount' || item.kind === 'manual_unmount') {
        if (item.positionCode) delete map[item.positionCode]
      } else if (item.kind === 'mount') {
        if (item.positionCode && item.tireId) {
          map[item.positionCode] = {
            tireId: item.tireId,
            serialNo: item.serialNo,
            treadMm: item.treadMm,
            lifetimeKm: 0,
            alert: false,
          }
        }
      } else if (item.kind === 'rotate') {
        const moving = item.positionCode ? map[item.positionCode] : undefined
        if (item.positionCode) delete map[item.positionCode]
        if (item.targetPosition && moving) map[item.targetPosition] = moving
      }
    }
    return map
  }, [slots, items])

  const stockTires = React.useMemo(
    () => tires.filter((t) => t.status === 'in_stock' && !usedTireIds.has(t.id)),
    [tires, usedTireIds],
  )

  const filteredVehicles = React.useMemo(() => {
    const q = vehicleQuery.trim().toLowerCase()
    if (!q) return vehicles
    // ค้นได้ทั้งทะเบียนรถ และเลขยางที่ติดตั้งอยู่บนรถคันนั้น
    const vehicleIdsByTire = new Set(
      tires
        .filter((t) => t.serial_no.toLowerCase().includes(q) && t.vehicle_id)
        .map((t) => t.vehicle_id as string),
    )
    return vehicles.filter(
      (v) =>
        v.plate_no.toLowerCase().includes(q) ||
        v.province.toLowerCase().includes(q) ||
        [v.brand, v.model].filter(Boolean).join(' ').toLowerCase().includes(q) ||
        vehicleIdsByTire.has(v.id),
    )
  }, [vehicles, tires, vehicleQuery])

  const filteredStock = React.useMemo(() => {
    const q = tireQuery.trim().toLowerCase()
    if (!q) return stockTires
    return stockTires.filter((t) =>
      [t.serial_no, t.brand_name, t.model_name, t.size]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q)),
    )
  }, [stockTires, tireQuery])

  const selectedTire = tires.find((t) => t.id === tireId) ?? null

  /** หา URL รูปของยางในรายการตะกร้า (ยางที่คีย์เองอาจยังไม่มีรูป) */
  function itemImage(item: DraftItem): string | null {
    if (item.tireId) return tires.find((t) => t.id === item.tireId)?.image_url ?? null
    if (item.manual?.tire_model_id) {
      return models.find((m) => m.id === item.manual?.tire_model_id)?.image_url ?? null
    }
    return null
  }

  /** จำนวนรายการแยกตามประเภท ใช้แสดงในหน้าสรุป */
  const counts = React.useMemo(
    () => ({
      unmount: items.filter((i) => i.kind === 'unmount' || i.kind === 'manual_unmount').length,
      mount: items.filter((i) => i.kind === 'mount').length,
      rotate: items.filter((i) => i.kind === 'rotate').length,
    }),
    [items],
  )

  /** สรุปสถานะล้อของรถคันนี้ (นับจากผังหลังรวมรายการในตะกร้าแล้ว) */
  const filledCount = Object.keys(previewSlots).length
  const emptyCount = Math.max(layout.wheelCount - filledCount, 0)
  const alertCount = Object.values(previewSlots).filter((s) => s.alert).length

  /** true = กำลังถอดยางในตำแหน่งที่ระบบยังไม่มีข้อมูล → ช่างคีย์ข้อมูลยางเอง */
  const isManualUnmount =
    mode === 'unmount' && Boolean(position) && !previewSlots[position as string]

  const setManualField = <K extends keyof ManualTire>(key: K, value: ManualTire[K]) =>
    setManual((m) => ({ ...m, [key]: value }))

  /** เลือกรุ่นยางจากแคตตาล็อกในฟอร์มคีย์เอง */
  function pickManualModel(id: string) {
    const m = models.find((x) => x.id === id)
    setManual((prev) => ({
      ...prev,
      tire_model_id: id,
      brand_name: m?.brand ?? '',
      model_name: m?.model ?? '',
      size: m?.size ?? '',
    }))
  }

  /* -------------------------------------------------------------- actions */

  /** เลือกรถ แล้วตั้งเลขไมล์เริ่มต้นจากค่าล่าสุดของรถคันนั้น */
  function selectVehicle(v: VehicleLite) {
    setVehicleId(v.id)
    setOdometer(String(v.current_mileage))
    setPosition(null)
    setTargetPosition(null)
    setTireId(null)
    setManual(EMPTY_MANUAL)
  }

  /** เปลี่ยนประเภทรายการ พร้อมตั้งสาเหตุเริ่มต้นให้โหมดสลับตำแหน่ง */
  function selectMode(m: Mode) {
    setMode(m)
    setPosition(null)
    setTargetPosition(null)
    setTireId(null)
    setManual(EMPTY_MANUAL)
    if (m === 'rotate') {
      const rotate = reasons.find((r) => r.name.includes('สลับ'))
      setReasonId(rotate?.id ?? '')
    } else {
      setReasonId('')
    }
  }

  /* ---------------------------------------------------------- validation */

  const canNext = React.useMemo(() => {
    if (step === 1) return Boolean(vehicleId)
    if (step === 2) {
      if (mode === 'mount') return Boolean(position && tireId)
      if (mode === 'unmount') {
        if (!position) return false
        // ตำแหน่งที่ยังไม่มีข้อมูลยาง ต้องคีย์เลขยางเองก่อน
        return isManualUnmount ? manual.serial_no.trim() !== '' : Boolean(tireId)
      }
      return Boolean(position && tireId)
    }
    if (step === 3) {
      if (!odometer.trim()) return false
      if (isManualUnmount && manual.mounted_odometer.trim() !== '') {
        if (Number(manual.mounted_odometer) > Number(odometer)) return false
      }
      if (mode === 'rotate') return Boolean(targetPosition)
      return true
    }
    return true
  }, [step, vehicleId, mode, position, tireId, odometer, targetPosition, isManualUnmount, manual])

  /** ล้างเฉพาะค่าของรายการปัจจุบัน (คงรถ เลขไมล์ วันที่ และตะกร้าไว้) */
  function resetCurrentItem() {
    setMode('unmount')
    setPosition(null)
    setTargetPosition(null)
    setTireId(null)
    setTread('')
    setNote('')
    setReasonId('')
    setManual(EMPTY_MANUAL)
    setTireQuery('')
  }

  /**
   * เพิ่มรายการที่กรอกไว้ลงตะกร้า แล้วเคลียร์ฟอร์มเพื่อทำรายการถัดไป
   * @returns true เมื่อเพิ่มสำเร็จ
   */
  function addCurrentItem(): boolean {
    if (!vehicle) return false
    const treadValue = tread.trim() === '' ? null : Number(tread)
    const reasonLabel = reasons.find((r) => r.id === reasonId)?.name ?? ''

    const base = {
      key: `item-${(itemSeq.current += 1)}`,
      treadMm: treadValue,
      reasonId: reasonId || null,
      reasonLabel,
      note: note.trim() || null,
    }

    let item: DraftItem
    if (isManualUnmount) {
      if (!manual.serial_no.trim() || !position) return false
      item = {
        ...base,
        kind: 'manual_unmount',
        tireId: null,
        serialNo: manual.serial_no.trim(),
        brandModel: [manual.brand_name, manual.model_name, manual.size].filter(Boolean).join(' '),
        positionCode: position,
        targetPosition: null,
        manual: { ...manual },
      }
    } else {
      if (!selectedTire) return false
      if (mode === 'mount' && !position) return false
      if (mode === 'rotate' && !targetPosition) return false
      item = {
        ...base,
        kind: mode,
        tireId: selectedTire.id,
        serialNo: selectedTire.serial_no,
        brandModel: [selectedTire.brand_name, selectedTire.model_name].filter(Boolean).join(' '),
        positionCode: position,
        targetPosition: mode === 'rotate' ? targetPosition : null,
        manual: null,
      }
    }

    setItems((prev) => [...prev, item])
    resetCurrentItem()
    setError(null)
    return true
  }

  /** ลบรายการออกจากตะกร้า */
  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key))
  }

  function resetAll() {
    setItems([])
    setSavedCount(0)
    setStep(1)
    setMode('unmount')
    setPosition(null)
    setTargetPosition(null)
    setTireId(null)
    setTread('')
    setNote('')
    setReasonId('')
    setError(null)
    setDone(false)
    setManual(EMPTY_MANUAL)
    setEventDate(todayISO())
  }

  function handleSelectPosition(pos: WheelPosition, slot?: WheelSlot) {
    setPosition(pos.code)
    if (mode === 'mount') return
    if (slot) {
      setTireId(slot.tireId)
      setTread(slot.treadMm !== null ? String(slot.treadMm) : '')
    } else {
      // ตำแหน่งว่าง (โหมดถอด) → เข้าสู่การคีย์ข้อมูลยางเอง
      setTireId(null)
      setTread('')
    }
  }

  /* ------------------------------------------------------------- submit */

  async function handleSubmit() {
    if (!vehicle || items.length === 0) return
    setSaving(true)
    setError(null)

    const result = await applyServiceBatchAction({
      vehicle_id: vehicle.id,
      odometer: Number(odometer),
      event_date: eventDate,
      items: items.map((i) => ({
        kind: i.kind,
        tire_id: i.tireId,
        position_code: i.positionCode,
        target_position: i.targetPosition,
        tread_mm: i.treadMm,
        reason_id: i.reasonId,
        note: i.note,
        manual: i.manual
          ? {
              serial_no: i.manual.serial_no,
              tire_model_id: i.manual.tire_model_id || null,
              brand_name: i.manual.brand_name || null,
              model_name: i.manual.model_name || null,
              size: i.manual.size || null,
              dot: i.manual.dot || null,
              new_tread_mm: i.manual.new_tread_mm || null,
              mounted_odometer: i.manual.mounted_odometer || null,
            }
          : null,
      })),
    })

    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }

    setSavedCount(result.data?.count ?? items.length)
    setDone(true)
    router.refresh()
  }

  /* --------------------------------------------------------------- views */

  if (done) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardBody className="flex flex-col items-center py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Check className="size-8" />
          </div>
          <p className="mt-5 text-xl font-semibold text-ink-900">บันทึกข้อมูลเรียบร้อย</p>
          <p className="mt-1.5 text-sm text-ink-500">
            {vehicle?.plate_no} · บันทึกทั้งหมด {formatNumber(savedCount)} รายการ
          </p>
          <div className="mt-7 flex gap-3">
            <Button variant="secondary" onClick={() => { resetAll(); setVehicleId(null) }}>
              เลือกรถคันอื่น
            </Button>
            <Button onClick={resetAll}>ทำรายการต่อกับรถคันนี้</Button>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <>
      <Stepper step={step} />

      {/* แถบบริบทงานปัจจุบัน — ติดไว้ด้านบนเพื่อให้เห็นตลอดตอนเลื่อนดูรายการยาว ๆ */}
      {vehicle && step > 1 && (
        <div className="glass sticky top-[4.5rem] z-20 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-line px-4 py-3">
          <span className="flex items-center gap-2 font-semibold text-ink-900">
            <Truck className="size-4.5 text-brand-500" />
            {vehicle.plate_no}
          </span>
          <span className="text-sm text-ink-500">{formatKm(Number(odometer) || 0)}</span>
          <span className="text-sm text-ink-400">{eventDate}</span>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setStep(4)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
            >
              <ListChecks className="size-4" />
              {formatNumber(items.length)} รายการ
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* -------------------------------------------------- STEP 1 */}
      {step === 1 && (
        <Card>
          <CardHeader
            title="เลือกยานพาหนะ"
            description="พิมพ์ทะเบียนรถ หรือเลขยาง เพื่อค้นหารถที่ต้องการทำรายการ"
          />
          <CardBody>
            <div className="relative mb-5">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-400" />
              <input
                value={vehicleQuery}
                onChange={(e) => setVehicleQuery(e.target.value)}
                placeholder="ค้นหาทะเบียนรถ หรือเลขยาง เช่น 70-1234 / T-295..."
                className="h-14 w-full rounded-xl border border-line bg-white pl-12 pr-4 text-base placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
                autoFocus
              />
            </div>

            {filteredVehicles.length === 0 ? (
              <EmptyState
                icon={<Truck className="size-6" />}
                title="ไม่พบรถตามคำค้นหา"
                description="ลองพิมพ์เฉพาะตัวเลขทะเบียน หรือติดต่อแอดมินเพื่อเพิ่มรถเข้าระบบ"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {filteredVehicles.map((v) => {
                  const count = tires.filter(
                    (t) => t.vehicle_id === v.id && t.status === 'mounted',
                  ).length
                  const total = getLayout(v.axle_type).wheelCount
                  const active = v.id === vehicleId
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => selectVehicle(v)}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99]',
                        active
                          ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-100'
                          : 'border-line bg-white hover:border-brand-300 hover:bg-brand-50/50',
                      )}
                    >
                      <span className={cn(
                        'flex size-12 shrink-0 items-center justify-center rounded-xl',
                        active ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-500',
                      )}>
                        <Truck className="size-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px] font-semibold text-ink-900">
                          {v.plate_no}
                        </span>
                        <span className="block truncate text-sm text-ink-500">
                          {v.province} · {[v.brand, v.model].filter(Boolean).join(' ') || 'ไม่ระบุรุ่น'}
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-xs text-ink-400">
                          <span>{formatKm(v.current_mileage)}</span>
                          <span className={count === total ? 'text-emerald-600' : 'text-amber-600'}>
                            ยาง {count}/{total}
                          </span>
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* -------------------------------------------------- STEP 2 */}
      {step === 2 && vehicle && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-4 xl:col-span-3">
            <Card>
              <CardHeader title="ประเภทรายการ" description="เลือกสิ่งที่ต้องการทำกับรถคันนี้" />
              <CardBody>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => selectMode(m)}
                      className={cn(
                        'h-16 rounded-xl border text-base font-medium transition-all active:scale-[0.98]',
                        mode === m
                          ? 'border-brand-600 bg-brand-600 text-white shadow-[0_10px_24px_-14px_rgba(13,110,224,1)]'
                          : 'border-line bg-white text-ink-700 hover:border-brand-300 hover:bg-brand-50',
                      )}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="ตำแหน่งยาง"
                description={
                  mode === 'mount'
                    ? 'แตะตำแหน่งว่างที่ต้องการใส่ยาง'
                    : mode === 'rotate'
                      ? 'แตะล้อที่ต้องการสลับตำแหน่ง'
                      : 'แตะล้อที่ต้องการถอด — ถ้าตำแหน่งนั้นยังไม่มีข้อมูลในระบบ ให้แตะแล้วคีย์ข้อมูลยางเอง'
                }
                action={<Badge tone="brand">{layout.name}</Badge>}
              />
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatChip tone="emerald" label="มียาง" value={`${filledCount} เส้น`} />
                  <StatChip tone="slate" label="ว่าง" value={`${emptyCount} ตำแหน่ง`} />
                  <StatChip
                    tone="amber"
                    label="ถึงเกณฑ์เตือน"
                    value={`${alertCount} เส้น`}
                  />
                </div>

                <WheelDiagram
                  axleType={vehicle.axle_type}
                  slots={previewSlots}
                  selected={position}
                  onSelect={handleSelectPosition}
                  mode={mode === 'mount' ? 'mount' : 'unmount'}
                  allowEmpty={mode === 'unmount'}
                />

                {position && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-brand-50 px-4 py-3 text-sm ring-1 ring-inset ring-brand-100">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-brand-700">
                      <CircleDot className="size-4" />
                      {positionLabel(position, vehicle.axle_type)}
                    </span>
                    <span className="text-ink-500">
                      {isManualUnmount
                        ? 'ยังไม่มีข้อมูลยางในระบบ — คีย์ข้อมูลเองทางขวา'
                        : selectedTire
                          ? `${selectedTire.serial_no}${selectedTire.tread_mm !== null ? ` · ดอกยาง ${selectedTire.tread_mm} มม.` : ''}`
                          : mode === 'mount'
                            ? 'ตำแหน่งว่าง — เลือกยางจากคลังทางขวา'
                            : '—'}
                    </span>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4 xl:col-span-2">
            <VehicleCard vehicle={vehicle} mountedCount={mountedOnVehicle.length} />

            {mode === 'mount' ? (
              <Card>
                <CardHeader
                  title="เลือกยางจากคลัง"
                  description={`มียางพร้อมใช้ ${formatNumber(stockTires.length)} เส้น`}
                  action={
                    <Button size="sm" variant="secondary" onClick={() => setTireFormOpen(true)}>
                      <Plus className="size-4" />
                      ยางใหม่
                    </Button>
                  }
                />
                <CardBody>
                  <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-ink-400" />
                    <input
                      value={tireQuery}
                      onChange={(e) => setTireQuery(e.target.value)}
                      placeholder="คีย์เลขยาง หรือค้นหายี่ห้อ/รุ่น"
                      className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-3 text-base placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
                    />
                  </div>

                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1 md:max-h-[26rem]">
                    {filteredStock.length === 0 ? (
                      <EmptyState
                        icon={<Package className="size-6" />}
                        title="ไม่พบยางในคลัง"
                        description="กดปุ่ม “ยางใหม่” เพื่อเพิ่มยางที่ยังไม่มีในระบบ"
                      />
                    ) : (
                      filteredStock.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTireId(t.id)
                            setTread(t.tread_mm !== null ? String(t.tread_mm) : '')
                          }}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.99]',
                            tireId === t.id
                              ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-100'
                              : 'border-line bg-white hover:border-brand-300 hover:bg-brand-50/50',
                          )}
                        >
                          <TireThumb
                            src={t.image_url}
                            alt={[t.brand_name, t.model_name].filter(Boolean).join(' ')}
                            size="md"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink-900">{t.serial_no}</span>
                            <span className="block truncate text-xs text-ink-400">
                              {[t.brand_name, t.model_name, t.size].filter(Boolean).join(' · ') || 'ไม่ระบุรุ่น'}
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-xs text-ink-500">
                            {t.tread_mm !== null && <span className="block">{t.tread_mm} มม.</span>}
                            <span className="block text-ink-400">{formatKm(t.lifetime_km)}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </CardBody>
              </Card>
            ) : isManualUnmount ? (
              <ManualTireCard
                manual={manual}
                models={models}
                positionText={positionLabel(position, vehicle.axle_type)}
                onChange={setManualField}
                onPickModel={pickManualModel}
              />
            ) : (
              <Card>
                <CardHeader title="ยางที่เลือก" description="ข้อมูลยางในตำแหน่งที่แตะเลือก" />
                <CardBody>
                  {selectedTire ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-xl bg-brand-50/40 p-3">
                        <TireThumb
                          src={selectedTire.image_url}
                          alt={[selectedTire.brand_name, selectedTire.model_name].filter(Boolean).join(' ')}
                          size="lg"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-900">{selectedTire.serial_no}</p>
                          <p className="truncate text-sm text-ink-500">
                            {[selectedTire.brand_name, selectedTire.model_name].filter(Boolean).join(' ') || '-'}
                          </p>
                        </div>
                      </div>
                      <Row label="ยี่ห้อ / รุ่น"
                        value={[selectedTire.brand_name, selectedTire.model_name].filter(Boolean).join(' ') || '-'} />
                      <Row label="ขนาด" value={selectedTire.size ?? '-'} />
                      <Row label="ตำแหน่ง" value={positionLabel(position, vehicle.axle_type)} />
                      <Row label="ดอกยางล่าสุด"
                        value={selectedTire.tread_mm !== null ? `${selectedTire.tread_mm} มม.` : '-'} />
                      <Row label="ระยะรอบนี้" value={formatKm(selectedTire.current_run_km)}
                        highlight={selectedTire.current_run_km >= alertKm} />
                      <Row label="ระยะสะสม" value={formatKm(selectedTire.lifetime_km)} />
                    </div>
                  ) : (
                    <EmptyState
                      icon={<CircleDot className="size-6" />}
                      title="ยังไม่ได้เลือกตำแหน่ง"
                      description="แตะล้อบนแผนผังด้านซ้ายเพื่อเลือกยาง"
                    />
                  )}
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------- STEP 3 */}
      {step === 3 && vehicle && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader title="รายละเอียดการบันทึก" description={`${MODE_LABEL[mode]} · ${vehicle.plate_no}`} />
            <CardBody className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="วันที่ทำรายการ" required>
                  <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                </Field>
                <Field label="เลขไมล์ปัจจุบัน (กม.)" required hint={`ล่าสุดในระบบ ${formatKm(vehicle.current_mileage)}`}>
                  <Input
                    type="number" inputMode="numeric" min={0}
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                  />
                </Field>
              </div>

              {isManualUnmount && (
                <div className="rounded-xl bg-amber-50 px-4 py-4 ring-1 ring-inset ring-amber-200">
                  <p className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-800">
                    <PencilLine className="size-4 shrink-0" />
                    ยางเส้นนี้คีย์ข้อมูลเอง — เลขยาง {manual.serial_no || '(ยังไม่ระบุ)'}
                  </p>
                  <Field
                    label="เลขไมล์ตอนใส่ยางเส้นนี้ (ถ้าทราบ)"
                    className="max-w-64"
                    hint="ใส่เพื่อให้ระบบคำนวณระยะวิ่งของยางรอบนี้ ถ้าไม่ทราบให้เว้นว่าง (ระยะจะเป็น 0)"
                    error={
                      manual.mounted_odometer.trim() !== '' &&
                      Number(manual.mounted_odometer) > Number(odometer)
                        ? 'ต้องไม่มากกว่าเลขไมล์ปัจจุบัน'
                        : undefined
                    }
                  >
                    <Input
                      type="number" inputMode="numeric" min={0}
                      value={manual.mounted_odometer}
                      onChange={(e) => setManualField('mounted_odometer', e.target.value)}
                      placeholder="เช่น 120000"
                    />
                  </Field>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-sm font-medium text-ink-700">ดอกยางที่วัดได้ (มม.)</p>
                <div className="grid grid-cols-5 gap-2 md:grid-cols-10">
                  {Array.from({ length: 10 }, (_, i) => i).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setTread(String(n))}
                      className={cn(
                        'h-14 rounded-xl border text-lg font-semibold transition-all active:scale-95',
                        Number(tread) === n && tread !== ''
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-line bg-white text-ink-700 hover:border-brand-300 hover:bg-brand-50',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-3 max-w-48">
                  <Input
                    type="number" inputMode="decimal" step="0.1" min={0}
                    value={tread}
                    onChange={(e) => setTread(e.target.value)}
                    placeholder="หรือระบุทศนิยม เช่น 6.5"
                  />
                </div>
              </div>

              {mode !== 'mount' && (
                <Field label="สาเหตุที่ถอด" required={mode === 'unmount'}>
                  <Select value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
                    <option value="">— เลือกสาเหตุ —</option>
                    {reasons.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.is_scrap ? ' (ตัดจำหน่าย)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <Field label="หมายเหตุ">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ระบุหมายเหตุ (ถ้ามี)" />
              </Field>
            </CardBody>
          </Card>

          <div className="space-y-4 xl:col-span-2">
            {mode === 'rotate' ? (
              <Card>
                <CardHeader title="เลือกตำแหน่งปลายทาง" description="แตะตำแหน่งว่างที่จะย้ายยางไปติดตั้ง" />
                <CardBody>
                  <WheelDiagram
                    axleType={vehicle.axle_type}
                    slots={previewSlots}
                    selected={targetPosition}
                    onSelect={(pos) => setTargetPosition(pos.code)}
                    mode="mount"
                  />
                </CardBody>
              </Card>
            ) : (
              <Card>
                <CardHeader title="สรุปตำแหน่ง" />
                <CardBody>
                  <WheelDiagram
                    axleType={vehicle.axle_type}
                    slots={previewSlots}
                    selected={position}
                    mode="view"
                  />
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------- STEP 4 */}
      {step === 4 && vehicle && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader
              title={`รายการที่จะบันทึก (${formatNumber(items.length)})`}
              description="ตรวจสอบให้ครบก่อนกดบันทึก — ระบบจะบันทึกทั้งชุดพร้อมกัน ถ้ามีรายการใดผิดพลาดจะไม่บันทึกเลยสักรายการ"
              action={
                <Button size="sm" variant="secondary" onClick={() => setStep(2)}>
                  <Plus className="size-4" />
                  เพิ่มรายการ
                </Button>
              }
            />
            {items.length === 0 ? (
              <EmptyState
                icon={<CircleDot className="size-6" />}
                title="ยังไม่มีรายการในชุดนี้"
                description="กด “เพิ่มรายการ” เพื่อเลือกยางและตำแหน่งที่ต้องการทำ"
                action={<Button onClick={() => setStep(2)}><Plus className="size-4.5" />เพิ่มรายการ</Button>}
              />
            ) : (
              <CardBody className="space-y-2.5">
                {items.map((item, index) => (
                  <div
                    key={item.key}
                    className="flex items-start gap-3 rounded-xl border border-line bg-white p-3.5"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700">
                      {index + 1}
                    </span>
                    <TireThumb src={itemImage(item)} alt={item.serialNo} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={ITEM_TONE[item.kind]}>{ITEM_LABEL[item.kind]}</Badge>
                        <span className="font-medium text-ink-900">{item.serialNo}</span>
                        {item.kind === 'manual_unmount' && <Badge tone="amber">คีย์ข้อมูลเอง</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-ink-500">
                        {item.kind === 'rotate'
                          ? `${positionLabel(item.positionCode, vehicle.axle_type)} → ${positionLabel(item.targetPosition, vehicle.axle_type)}`
                          : positionLabel(item.positionCode, vehicle.axle_type)}
                        {item.brandModel ? ` · ${item.brandModel}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        {[
                          item.treadMm !== null ? `ดอกยาง ${item.treadMm} มม.` : null,
                          item.reasonLabel || null,
                          item.note,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'ไม่มีรายละเอียดเพิ่มเติม'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      aria-label="ลบรายการนี้"
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="size-4.5" />
                    </button>
                  </div>
                ))}
              </CardBody>
            )}
          </Card>

          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader title="ข้อมูลรวมของชุดนี้" description="ใช้กับทุกรายการในชุด" />
              <CardBody className="space-y-3">
                <Row label="รถ" value={`${vehicle.plate_no} ${vehicle.province}`} />
                <Row label="วันที่" value={eventDate} />
                <Row label="เลขไมล์" value={formatKm(Number(odometer))} />
                <Row label="จำนวนรายการ" value={`${formatNumber(items.length)} รายการ`} />
                <Row
                  label="ถอด / ใส่ / สลับ"
                  value={`${counts.unmount} / ${counts.mount} / ${counts.rotate}`}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="ผังล้อหลังบันทึก" description="ภาพรวมตำแหน่งยางเมื่อทุกรายการถูกบันทึกแล้ว" />
              <CardBody>
                <WheelDiagram axleType={vehicle.axle_type} slots={previewSlots} mode="view" />
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ nav footer */}
      <div className="safe-bottom sticky bottom-0 z-20 mt-6 flex items-center justify-between gap-3 border-t border-line bg-surface/85 px-1 py-4 backdrop-blur">
        <Button
          variant="secondary"
          onClick={() => (step === 1 ? resetAll() : setStep((s) => s - 1))}
          disabled={saving}
        >
          <ArrowLeft className="size-4.5" />
          {step === 1 ? 'ล้างข้อมูล' : 'ย้อนกลับ'}
        </Button>

        <div className="hidden items-center gap-3 text-sm text-ink-400 sm:flex">
          <span>ขั้นตอนที่ {step} จาก {STEPS.length} — {STEPS[step - 1]}</span>
          {items.length > 0 && step !== 4 && (
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 font-medium text-brand-700 hover:bg-brand-100"
            >
              <ListChecks className="size-4" />
              ในชุดนี้ {formatNumber(items.length)} รายการ
            </button>
          )}
        </div>

        {step < 3 ? (
          <Button size="lg" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            ถัดไป
            <ArrowRight className="size-4.5" />
          </Button>
        ) : step === 3 ? (
          <Button
            size="lg"
            onClick={() => { if (addCurrentItem()) setStep(4) }}
            disabled={!canNext}
          >
            <Plus className="size-4.5" />
            เพิ่มลงรายการ
          </Button>
        ) : (
          <Button
            size="lg"
            variant="success"
            onClick={handleSubmit}
            loading={saving}
            disabled={items.length === 0}
          >
            <Check className="size-4.5" />
            บันทึกทั้งหมด ({formatNumber(items.length)})
          </Button>
        )}
      </div>

      <TireFormModal
        open={tireFormOpen}
        onClose={() => setTireFormOpen(false)}
        models={models}
        onCreated={(newTireId) => setTireId(newTireId)}
      />
    </>
  )
}

/* ------------------------------------------------------------ subviews */

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2 overflow-x-auto pb-1">
      {STEPS.map((label, i) => {
        const index = i + 1
        const state = index < step ? 'done' : index === step ? 'current' : 'todo'
        return (
          <li key={label} className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'flex size-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                state === 'done' && 'bg-brand-100 text-brand-700',
                state === 'current' && 'bg-brand-600 text-white',
                state === 'todo' && 'bg-slate-100 text-ink-400',
              )}
            >
              {state === 'done' ? <Check className="size-4" /> : index}
            </span>
            <span
              className={cn(
                'text-sm',
                state === 'current'
                  ? 'font-medium text-ink-900'
                  : 'hidden text-ink-400 sm:inline',
              )}
            >
              {label}
            </span>
            {index < STEPS.length && <span className="mx-1 h-px w-6 bg-line sm:w-10" />}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * ฟอร์มคีย์ข้อมูลยางเองตอนถอด — ใช้เมื่อหน้างานมียางอยู่จริงแต่ระบบยังไม่มีข้อมูลยางเส้นนั้น
 * กรอกเท่าที่ทราบได้ ระบบจะสร้างประวัติยางให้พร้อมบันทึกการถอด
 */
function ManualTireCard({
  manual,
  models,
  positionText,
  onChange,
  onPickModel,
}: {
  manual: ManualTire
  models: ModelOption[]
  positionText: string
  onChange: <K extends keyof ManualTire>(key: K, value: ManualTire[K]) => void
  onPickModel: (id: string) => void
}) {
  return (
    <Card className="border-amber-200">
      <CardHeader
        title="คีย์ข้อมูลยางเอง"
        description={`ตำแหน่ง ${positionText} ยังไม่มีข้อมูลยางในระบบ — กรอกเท่าที่ทราบ`}
        action={
          <Badge tone="amber">
            <PencilLine className="size-3.5" />
            บันทึกเอง
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        <Field label="เลขยาง (ซีเรียล)" required hint="ถ้าอ่านเลขยางไม่ได้ ให้ระบุรหัสอ้างอิงที่จำได้ เช่น NO-SERIAL-01">
          <Input
            value={manual.serial_no}
            onChange={(e) => onChange('serial_no', e.target.value)}
            placeholder="T-295/80R22.5-010"
            autoFocus
          />
        </Field>

        {models.length > 0 && (
          <Field label="เลือกรุ่นจากแคตตาล็อก (ถ้ามี)">
            <Select value={manual.tire_model_id} onChange={(e) => onPickModel(e.target.value)}>
              <option value="">— ไม่เลือก / พิมพ์เอง —</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.brand} {m.model}{m.size ? ` · ${m.size}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ยี่ห้อ">
            <Input
              value={manual.brand_name}
              onChange={(e) => onChange('brand_name', e.target.value)}
              placeholder="MICHELIN"
            />
          </Field>
          <Field label="รุ่น">
            <Input
              value={manual.model_name}
              onChange={(e) => onChange('model_name', e.target.value)}
              placeholder="X MULTI Z"
            />
          </Field>
          <Field label="ขนาด">
            <Input
              value={manual.size}
              onChange={(e) => onChange('size', e.target.value)}
              placeholder="295/80R22.5"
            />
          </Field>
          <Field label="DOT">
            <Input
              value={manual.dot}
              onChange={(e) => onChange('dot', e.target.value)}
              placeholder="2323"
            />
          </Field>
        </div>

        <Field label="ดอกยางตอนใหม่ (มม.)" className="max-w-40">
          <Input
            type="number" inputMode="decimal" step="0.1" min={0}
            value={manual.new_tread_mm}
            onChange={(e) => onChange('new_tread_mm', e.target.value)}
            placeholder="16"
          />
        </Field>
      </CardBody>
    </Card>
  )
}

function VehicleCard({ vehicle, mountedCount }: { vehicle: VehicleLite; mountedCount: number }) {
  const layout = getLayout(vehicle.axle_type)
  return (
    <Card>
      <CardHeader title="ข้อมูลยานพาหนะ" />
      <CardBody className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
            <Truck className="size-6" />
          </span>
          <div>
            <p className="text-lg font-semibold text-ink-900">{vehicle.plate_no}</p>
            <p className="text-sm text-ink-500">{vehicle.province}</p>
          </div>
        </div>
        <Row label="ประเภทรถ" value={layout.name} />
        <Row label="ยี่ห้อ / รุ่น" value={[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '-'} />
        <Row label="เลขไมล์ปัจจุบัน" value={formatKm(vehicle.current_mileage)} />
        <Row label="ยางที่ติดตั้ง" value={`${mountedCount}/${layout.wheelCount} เส้น`} />
      </CardBody>
    </Card>
  )
}

/** ป้ายสรุปตัวเลขเล็ก ๆ เหนือแผนผังล้อ */
function StatChip({
  tone,
  label,
  value,
}: {
  tone: 'emerald' | 'amber' | 'slate'
  label: string
  value: string
}) {
  const toneClass = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    slate: 'bg-slate-50 text-ink-500 ring-slate-200',
  }[tone]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ring-1 ring-inset',
        toneClass,
      )}
    >
      <span className="opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  )
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string
  value: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/70 pb-2 last:border-0 last:pb-0">
      <span className="text-sm text-ink-500">{label}</span>
      <span className={cn('text-right text-[15px] font-medium text-ink-900', highlight && 'text-amber-600')}>
        {value}
      </span>
    </div>
  )
}
