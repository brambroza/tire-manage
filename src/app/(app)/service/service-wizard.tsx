'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, ArrowDown, Check, ChevronDown, Lock, PencilLine, RotateCcw, Search, SkipForward,
  Trash2, Truck,
} from 'lucide-react'
import {
  Badge, Button, Card, CardBody, EmptyState, Field, Input, Select, Textarea,
} from '@/components/ui'
import { WheelDiagram, type WheelSlot } from '@/components/wheel-diagram'
import { TireThumb } from '@/components/tire-thumb'
import { TireSpec } from '@/components/tire-spec'
import { getLayout, positionLabel, positionNo, type WheelPosition } from '@/lib/axle-layouts'
import { cn, formatKm, formatNumber, todayISO } from '@/lib/utils'
import { applyServiceBatchAction } from './actions'
import type { AxleType } from '@/lib/database.types'

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

/** ข้อมูลยางที่ช่างคีย์เองหน้างาน (ใช้ทั้งตอนถอดและตอนใส่) */
interface TireEntry {
  serial_no: string
  brand_name: string
  model_name: string
  size: string
  dot: string
  tread_mm: string
  /** เลขไมล์รถตอนที่ยางเส้นนี้ถูกใส่ (เฉพาะตอนถอดยางที่ไม่มีข้อมูลในระบบ) */
  mounted_odometer: string
  note: string
}

const EMPTY_ENTRY: TireEntry = {
  serial_no: '',
  brand_name: '',
  model_name: '',
  size: '',
  dot: '',
  tread_mm: '',
  mounted_odometer: '',
  note: '',
}

/**
 * รายการงาน 1 บรรทัดในตะกร้า — ช่างทำทีละล้อจนครบ แล้วกดเสร็จสิ้นทีเดียว
 * (ระบบบันทึกแบบ all-or-nothing)
 */
interface DraftItem {
  key: string
  kind: 'unmount' | 'manual_unmount' | 'mount' | 'manual_mount'
  tireId: string | null
  serialNo: string
  brandName: string
  modelName: string
  size: string
  positionCode: string
  treadMm: number | null
  reasonId: string | null
  reasonLabel: string
  note: string | null
  /** ข้อมูลยางที่คีย์เอง — ส่งให้ server สร้างประวัติยางให้ */
  manual: {
    serial_no: string
    brand_name: string
    model_name: string
    size: string
    dot: string
    mounted_odometer: string
  } | null
}

const ITEM_LABEL: Record<DraftItem['kind'], string> = {
  unmount: 'ถอด',
  manual_unmount: 'ถอด (คีย์เอง)',
  mount: 'ใส่',
  manual_mount: 'ใส่ (ยางใหม่)',
}

const ITEM_TONE: Record<DraftItem['kind'], 'amber' | 'brand'> = {
  unmount: 'amber',
  manual_unmount: 'amber',
  mount: 'brand',
  manual_mount: 'brand',
}

const isUnmountKind = (kind: DraftItem['kind']) =>
  kind === 'unmount' || kind === 'manual_unmount'

/* ------------------------------------------------------------- component */

/**
 * หน้าบันทึกการถอด-ใส่ยางสำหรับช่างหน้างาน (ออกแบบให้ใช้นิ้วบน iPad)
 *
 * ทำงาน "ทีละล้อ" เป็นวงรอบเดียว ไม่มีปุ่มเปลี่ยนขั้นตอน:
 *   เลือกรถ + เลขไมล์ → แตะล้อ → คีย์ยางที่ถอด → คีย์ยางที่ใส่ (ล้อเดิม)
 *   → กลับมาที่ผังล้อ เลือกล้อถัดไป หรือกด "เสร็จสิ้น" เพื่อบันทึกทั้งชุด
 */
export function ServiceWizard({
  vehicles,
  tires,
  reasons,
  axleTypes,
  alertKm,
  initialVehicleId,
}: {
  vehicles: VehicleLite[]
  tires: TireLite[]
  reasons: ReasonOption[]
  axleTypes: AxleType[]
  alertKm: number
  initialVehicleId?: string
}) {
  const router = useRouter()

  const [vehicleId, setVehicleId] = React.useState<string | null>(initialVehicleId ?? null)
  const [vehicleQuery, setVehicleQuery] = React.useState('')

  /* ข้อมูลรวมของทั้งชุด */
  const [odometer, setOdometer] = React.useState<string>(() => {
    const initial = vehicles.find((v) => v.id === initialVehicleId)
    return initial ? String(initial.current_mileage) : ''
  })
  const [eventDate, setEventDate] = React.useState(todayISO())

  /* ล้อที่กำลังทำอยู่ + ขั้นย่อยภายในล้อนั้น */
  const [position, setPosition] = React.useState<string | null>(null)
  const [stage, setStage] = React.useState<'unmount' | 'mount'>('unmount')

  const [unEntry, setUnEntry] = React.useState<TireEntry>(EMPTY_ENTRY)
  const [unReasonId, setUnReasonId] = React.useState('')
  const [mnEntry, setMnEntry] = React.useState<TireEntry>(EMPTY_ENTRY)

  /** ล้อที่เพิ่งทำเสร็จ — โชว์เป็นคำยืนยันสั้น ๆ เหนือแผนผังจนกว่าจะเริ่มล้อถัดไป */
  const [lastDone, setLastDone] = React.useState<string | null>(null)

  const [items, setItems] = React.useState<DraftItem[]>([])
  /** ตัวนับสำหรับสร้าง key ของรายการในตะกร้า (ไม่ใช้ค่าสุ่มเพื่อให้ผลลัพธ์คงที่) */
  const itemSeq = React.useRef(0)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  const [savedCount, setSavedCount] = React.useState(0)

  /** จุดยึดสำหรับเลื่อนหน้าจอไปยังขั้นถัดไป */
  const wheelRef = React.useRef<HTMLElement>(null)
  const workRef = React.useRef<HTMLElement>(null)

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null
  const axleType = vehicle?.axle_type ?? null
  const layout = getLayout(axleType, axleTypes)

  /** ชื่อล้อแบบสั้นที่ช่างเทียบกับแผนผังได้ทันที เช่น "ล้อ 3 · เพลา 2 ซ้ายนอก" */
  function wheelName(code: string | null | undefined) {
    if (!code) return '-'
    const no = positionNo(code, vehicle?.axle_type, axleTypes)
    const label = positionLabel(code, vehicle?.axle_type, axleTypes)
    return no ? `ล้อ ${no} · ${label}` : label
  }

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

  /**
   * สภาพล้อ "หลังทำรายการในตะกร้าทั้งหมดแล้ว" — ใช้วาดแผนผังให้ช่างเห็นผลทันที
   */
  const previewSlots = React.useMemo(() => {
    const map: Record<string, WheelSlot> = { ...slots }
    for (const item of items) {
      if (isUnmountKind(item.kind)) {
        delete map[item.positionCode]
      } else {
        map[item.positionCode] = {
          tireId: item.tireId ?? item.key,
          serialNo: item.serialNo,
          treadMm: item.treadMm,
          lifetimeKm: 0,
          alert: false,
        }
      }
    }
    return map
  }, [slots, items])

  /** ล้อที่ทำรายการไปแล้วในชุดนี้ (กันแตะซ้ำจนข้อมูลชนกัน) */
  const touchedPositions = React.useMemo(
    () => new Set(items.map((i) => i.positionCode)),
    [items],
  )

  /** ยางที่ถูกจองไว้ในตะกร้าแล้ว ไม่ให้ใส่ซ้ำสองล้อ */
  const usedTireIds = React.useMemo(
    () => new Set(items.filter((i) => !isUnmountKind(i.kind)).map((i) => i.tireId).filter(Boolean) as string[]),
    [items],
  )

  /** ยางที่ถอดออกในชุดนี้ — ใส่กลับเข้าล้ออื่นได้ เพราะระบบถอดก่อนใส่เสมอ */
  const freedTireIds = React.useMemo(
    () => new Set(items.filter((i) => i.kind === 'unmount').map((i) => i.tireId).filter(Boolean) as string[]),
    [items],
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

  const unmountItems = items.filter((i) => isUnmountKind(i.kind))
  const mountItems = items.filter((i) => !isUnmountKind(i.kind))

  /** หา URL รูปของยางในรายการตะกร้า (ยางที่คีย์เองอาจยังไม่มีรูป) */
  function itemImage(item: DraftItem): string | null {
    if (item.tireId) return tires.find((t) => t.id === item.tireId)?.image_url ?? null
    return null
  }

  const filledCount = Object.keys(previewSlots).length
  const emptyCount = Math.max(layout.wheelCount - filledCount, 0)
  const alertCount = Object.values(previewSlots).filter((s) => s.alert).length

  /* -------------------------------------------------- ตรวจข้อมูลยางที่คีย์ */

  const odometerValid = odometer.trim() !== '' && Number(odometer) >= 0

  /** ยางที่ระบบบันทึกไว้ในล้อที่กำลังทำ */
  const currentSlot = position ? slots[position] ?? null : null
  const slotTire = currentSlot ? tires.find((t) => t.id === currentSlot.tireId) ?? null : null

  const unSerial = unEntry.serial_no.trim()
  /** เลขยางที่คีย์ตรงกับที่ระบบบันทึกไว้ในล้อนี้ → ถอดตามประวัติเดิม */
  const unMatched =
    Boolean(slotTire) && unSerial.toLowerCase() === slotTire!.serial_no.toLowerCase()
  /** คีย์ไม่ตรงกับที่ระบบบันทึกไว้ → ให้ช่างตรวจสอบก่อน กันประวัติยางเพี้ยน */
  const unMismatch = Boolean(slotTire) && unSerial !== '' && !unMatched

  const canSaveUnmount =
    Boolean(vehicle) && odometerValid && Boolean(position) &&
    unSerial !== '' && Boolean(unReasonId) && !unMismatch &&
    !(unEntry.mounted_odometer.trim() !== '' &&
      Number(unEntry.mounted_odometer) > Number(odometer))

  const mnSerial = mnEntry.serial_no.trim()

  /** ยางในระบบที่ตรงกับเลขยางที่คีย์ตอนใส่ (ถ้ามี) */
  const mountCandidate = React.useMemo(() => {
    if (mnSerial === '') return null
    return tires.find((t) => t.serial_no.toLowerCase() === mnSerial.toLowerCase()) ?? null
  }, [tires, mnSerial])

  /** เหตุผลที่ยางเส้นที่คีย์ใส่ไม่ได้ (null = ใส่ได้) */
  function blockedReason(candidate: TireLite | null): string | null {
    if (!candidate) return null
    if (usedTireIds.has(candidate.id)) return 'ยางเส้นนี้ถูกใส่ไปแล้วในชุดนี้'
    if (candidate.status === 'scrapped') return 'ยางเส้นนี้ถูกตัดจำหน่ายไปแล้ว'
    if (candidate.status === 'mounted' && !freedTireIds.has(candidate.id)) {
      return `ยางเส้นนี้ติดตั้งอยู่ที่ ${candidate.plate_no ?? 'รถคันอื่น'} ${
        positionLabel(candidate.position_code, axleType, axleTypes)
      } — ต้องถอดออกก่อน`
    }
    return null
  }

  const mountBlocked = blockedReason(mountCandidate)

  const canSaveMount =
    Boolean(vehicle) && odometerValid && Boolean(position) && mnSerial !== '' && !mountBlocked

  /* ขั้นตอนไหนเปิดแล้วบ้าง — เปิดต่อกันลงล่าง */
  const wheelOpen = Boolean(vehicle) && odometerValid
  const workOpen = wheelOpen && Boolean(position)
  const reviewOpen = items.length > 0

  /* -------------------------------------------------------------- actions */

  /** เลื่อนหน้าจอไปยังส่วนที่เพิ่งเปิด (รอให้ React วาดเสร็จก่อน) */
  function scrollTo(ref: React.RefObject<HTMLElement | null>) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })),
    )
  }

  function selectVehicle(v: VehicleLite) {
    setVehicleId(v.id)
    setOdometer(String(v.current_mileage))
    closeWheel()
    scrollTo(wheelRef)
  }

  /** เปลี่ยนรถ = เริ่มงานใหม่ทั้งชุด (รายการที่คีย์ไว้ผูกกับรถคันเดิม) */
  function changeVehicle() {
    setVehicleId(null)
    setItems([])
    setOdometer('')
    closeWheel()
    setError(null)
  }

  /** ปิดงานของล้อปัจจุบัน แล้วกลับไปที่ผังล้อ */
  function closeWheel() {
    setPosition(null)
    setStage('unmount')
    setUnEntry(EMPTY_ENTRY)
    setUnReasonId('')
    setMnEntry(EMPTY_ENTRY)
  }

  /** แตะล้อบนผัง → เริ่มงานของล้อนั้นด้วยขั้น "ถอด" เสมอ */
  function startWheel(pos: WheelPosition) {
    // ล้อที่ทำไปแล้วถูกล็อกไว้ที่แผนผัง (ติ๊กถูก) — กันไว้อีกชั้นเผื่อกดมาทางอื่น
    if (touchedPositions.has(pos.code)) return
    setError(null)
    setLastDone(null)
    setPosition(pos.code)
    setStage('unmount')
    setUnEntry(EMPTY_ENTRY)
    setUnReasonId('')
    setMnEntry(EMPTY_ENTRY)
    scrollTo(workRef)
  }

  function nextKey() {
    return `item-${(itemSeq.current += 1)}`
  }

  const toManual = (entry: TireEntry) => ({
    serial_no: entry.serial_no.trim(),
    brand_name: entry.brand_name.trim(),
    model_name: entry.model_name.trim(),
    size: entry.size.trim(),
    dot: entry.dot.trim(),
    mounted_odometer: entry.mounted_odometer.trim(),
  })

  /** บันทึกการถอดของล้อนี้ แล้วไปต่อขั้นใส่ยางที่ล้อเดิมทันที */
  function saveUnmount() {
    if (!canSaveUnmount || !position) return
    const reasonLabel = reasons.find((r) => r.id === unReasonId)?.name ?? ''
    const treadMm = unEntry.tread_mm.trim() === '' ? null : Number(unEntry.tread_mm)

    const base = {
      key: nextKey(),
      positionCode: position,
      treadMm,
      reasonId: unReasonId || null,
      reasonLabel,
      note: unEntry.note.trim() || null,
    }

    const item: DraftItem =
      unMatched && slotTire
        ? {
            ...base,
            kind: 'unmount',
            tireId: slotTire.id,
            serialNo: slotTire.serial_no,
            brandName: slotTire.brand_name ?? '',
            modelName: slotTire.model_name ?? '',
            size: slotTire.size ?? '',
            manual: null,
          }
        : {
            ...base,
            kind: 'manual_unmount',
            tireId: null,
            serialNo: unSerial,
            brandName: unEntry.brand_name.trim(),
            modelName: unEntry.model_name.trim(),
            size: unEntry.size.trim(),
            manual: toManual(unEntry),
          }

    setItems((prev) => [...prev, item])
    setStage('mount')
    setError(null)
    scrollTo(workRef)
  }

  /** บันทึกการใส่ยางของล้อเดิม แล้วกลับไปที่ผังล้อเพื่อทำล้อถัดไป */
  function saveMount() {
    if (!canSaveMount || !position) return
    const treadMm = mnEntry.tread_mm.trim() === '' ? null : Number(mnEntry.tread_mm)

    const base = {
      key: nextKey(),
      positionCode: position,
      treadMm,
      reasonId: null,
      reasonLabel: '',
      note: mnEntry.note.trim() || null,
    }

    const item: DraftItem = mountCandidate
      ? {
          ...base,
          kind: 'mount',
          tireId: mountCandidate.id,
          serialNo: mountCandidate.serial_no,
          brandName: mountCandidate.brand_name ?? '',
          modelName: mountCandidate.model_name ?? '',
          size: mountCandidate.size ?? '',
          manual: null,
        }
      : {
          ...base,
          kind: 'manual_mount',
          tireId: null,
          serialNo: mnSerial,
          brandName: mnEntry.brand_name.trim(),
          modelName: mnEntry.model_name.trim(),
          size: mnEntry.size.trim(),
          manual: toManual(mnEntry),
        }

    setItems((prev) => [...prev, item])
    setLastDone(`${wheelName(position)} — ถอด ${unmountItems.at(-1)?.serialNo ?? ''} ใส่ ${item.serialNo}`)
    closeWheel()
    setError(null)
    scrollTo(wheelRef)
  }

  /** ปิดล้อนี้โดยไม่ใส่ยางกลับ (ถอดอย่างเดียว หรือยกเลิกกลางคัน) */
  function skipMount() {
    setLastDone(
      stage === 'mount' && position ? `${wheelName(position)} — ถอดอย่างเดียว ไม่ใส่ยางกลับ` : null,
    )
    closeWheel()
    setError(null)
    scrollTo(wheelRef)
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key))
  }

  /** ล้างงานทั้งชุดแต่คงรถคันเดิมไว้ */
  function resetAll() {
    setItems([])
    setSavedCount(0)
    closeWheel()
    setError(null)
    setDone(false)
    setEventDate(todayISO())
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
        tread_mm: i.treadMm,
        reason_id: i.reasonId,
        note: i.note,
        manual: i.manual
          ? {
              serial_no: i.manual.serial_no,
              tire_model_id: null,
              brand_name: i.manual.brand_name || null,
              model_name: i.manual.model_name || null,
              size: i.manual.size || null,
              dot: i.manual.dot || null,
              new_tread_mm: null,
              mounted_odometer: i.manual.mounted_odometer || null,
            }
          : null,
      })),
    })

    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      // ข้อความผิดพลาดอยู่บนสุด — เลื่อนขึ้นไปให้เห็นทันทีเพราะปุ่มบันทึกอยู่ล่างจอ
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
            <Button variant="secondary" onClick={() => { resetAll(); changeVehicle() }}>
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
      {/* แถบบริบทงานปัจจุบัน — ติดไว้ด้านบนเพื่อให้เห็นตลอดตอนเลื่อนหน้ายาว ๆ */}
      {vehicle && (
        <div className="glass sticky top-[4.5rem] z-20 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-line px-4 py-3">
          <span className="flex items-center gap-2 font-semibold text-ink-900">
            <Truck className="size-4.5 text-brand-500" />
            {vehicle.plate_no}
          </span>
          <span className="text-sm text-ink-500">{formatKm(Number(odometer) || 0)}</span>
          <span className="text-sm text-ink-400">{eventDate}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700">
            ถอด {unmountItems.length} · ใส่ {mountItems.length}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* ------------------------------------- ขั้นที่ 1 : รถ + เลขไมล์ */}
        <StepSection
          index={1}
          title="เลือกรถ และใส่เลขไมล์ปัจจุบัน"
          description={
            vehicle
              ? `${vehicle.plate_no} ${vehicle.province} · ${[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'ไม่ระบุรุ่น'}`
              : 'พิมพ์ทะเบียนรถ หรือเลขยาง เพื่อค้นหารถที่ต้องการทำรายการ'
          }
          done={Boolean(vehicle) && odometerValid}
          action={
            vehicle ? (
              <Button size="sm" variant="secondary" onClick={changeVehicle}>
                <RotateCcw className="size-4" />
                เปลี่ยนรถ
              </Button>
            ) : undefined
          }
        >
          {vehicle ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-brand-50/60 px-4 py-3.5 ring-1 ring-inset ring-brand-100">
                <span className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-600 text-white">
                    <Truck className="size-5.5" />
                  </span>
                  <span>
                    <span className="block text-lg font-semibold text-ink-900">{vehicle.plate_no}</span>
                    <span className="block text-sm text-ink-500">{vehicle.province}</span>
                  </span>
                </span>
                <span className="text-sm text-ink-500">{layout.name}</span>
                <span className="text-sm text-ink-500">
                  ยางติดตั้ง {mountedOnVehicle.length}/{layout.wheelCount} เส้น
                </span>
              </div>

              <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
                <Field label="วันที่ทำรายการ" required>
                  <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                </Field>
                <Field
                  label="เลขไมล์ปัจจุบัน (กม.)"
                  required
                  hint={`ล่าสุดในระบบ ${formatKm(vehicle.current_mileage)}`}
                >
                  <Input
                    type="number" inputMode="numeric" min={0}
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <>
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
                    const total = getLayout(v.axle_type, axleTypes).wheelCount
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => selectVehicle(v)}
                        className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left transition-all hover:border-brand-300 hover:bg-brand-50/50 active:scale-[0.99]"
                      >
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
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
            </>
          )}
        </StepSection>

        {/* ------------------------------------- ขั้นที่ 2 : เลือกตำแหน่งล้อ */}
        <StepSection
          index={2}
          title="เลือกตำแหน่งยาง"
          description={
            position
              ? `กำลังทำ ${wheelName(position)}`
              : 'แตะล้อที่จะเปลี่ยนยาง — ทำทีละล้อจนครบ แล้วกดเสร็จสิ้น'
          }
          locked={!wheelOpen}
          lockedText="เลือกรถและใส่เลขไมล์ก่อน ขั้นนี้จึงจะเปิด"
          done={items.length > 0 && !position}
          sectionRef={wheelRef}
          badge={<Badge tone="brand">{layout.name}</Badge>}
        >
          {vehicle && (
            <div className="space-y-3">
              {lastDone && !position && (
                <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-100">
                  <Check className="size-4 shrink-0" />
                  {lastDone}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <StatChip tone="emerald" label="มียาง" value={`${filledCount} เส้น`} />
                <StatChip tone="slate" label="ว่าง" value={`${emptyCount} ตำแหน่ง`} />
                <StatChip tone="amber" label="ถึงเกณฑ์เตือน" value={`${alertCount} เส้น`} />
                {touchedPositions.size > 0 && (
                  <StatChip tone="emerald" label="ทำแล้ว" value={`${touchedPositions.size} ล้อ`} />
                )}
              </div>

              <WheelDiagram
                axleType={vehicle.axle_type}
                axleTypes={axleTypes}
                slots={previewSlots}
                selected={position}
                onSelect={startWheel}
                mode="unmount"
                allowEmpty
                doneCodes={[...touchedPositions]}
              />

              {!position && (
                <p className="flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700">
                  <ArrowDown className="size-4" />
                  แตะเลขล้อที่ต้องการทำรายการ แล้วฟอร์มคีย์ข้อมูลจะเปิดด้านล่าง
                </p>
              )}
            </div>
          )}
        </StepSection>

        {/* --------------------------- ขั้นที่ 3 : ถอด → ใส่ ที่ล้อเดียวกัน */}
        <StepSection
          index={3}
          title={
            position
              ? `${stage === 'unmount' ? 'ถอดยาง' : 'ใส่ยาง'} — ${wheelName(position)}`
              : 'ถอดยาง แล้วใส่ยางล้อเดิม'
          }
          description={
            stage === 'unmount'
              ? 'คีย์ข้อมูลยางที่ถอดออกจากล้อนี้'
              : 'คีย์ข้อมูลยางที่ใส่เข้าไปแทน — ล้อเดิม ไม่ต้องเลือกตำแหน่งอีก'
          }
          locked={!workOpen}
          lockedText="แตะล้อบนแผนผังก่อน ขั้นนี้จึงจะเปิด"
          sectionRef={workRef}
          badge={
            position ? (
              <Badge tone={stage === 'unmount' ? 'amber' : 'brand'}>
                ขั้น {stage === 'unmount' ? '1/2 ถอด' : '2/2 ใส่'}
              </Badge>
            ) : undefined
          }
          action={
            position ? (
              <Button size="sm" variant="secondary" onClick={skipMount}>
                ยกเลิกล้อนี้
              </Button>
            ) : undefined
          }
        >
          {vehicle && position && stage === 'unmount' && (
            <div className="max-w-3xl space-y-4">
              {slotTire && (
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink-500">
                  <p>
                    ระบบบันทึกไว้ว่าล้อนี้คือ{' '}
                    <span className="font-medium text-ink-800">{slotTire.serial_no}</span>
                    {' — คีย์เลขยางจากเส้นจริงเพื่อยืนยัน'}
                  </p>
                  <TireSpec
                    size={slotTire.size}
                    brandName={slotTire.brand_name}
                    modelName={slotTire.model_name}
                    className="mt-2"
                  />
                </div>
              )}

              <TireEntryFields
                entry={unEntry}
                onChange={(key, value) => setUnEntry((e) => ({ ...e, [key]: value }))}
                serialLabel="เลขยางที่ถอด (ซีเรียล)"
                serialError={
                  unMismatch
                    ? `ไม่ตรงกับที่ระบบบันทึกไว้ (${slotTire!.serial_no}) — ตรวจสอบเลขยางอีกครั้ง`
                    : undefined
                }
                lockedInfo={unMatched && slotTire ? slotTire : null}
                treadLabel="ดอกยางที่วัดได้ (มม.)"
                extra={
                  <>
                    {!unMatched && (
                      <Field
                        label="เลขไมล์ตอนใส่ยางเส้นนี้ (ถ้าทราบ)"
                        className="max-w-64"
                        hint="ใส่เพื่อให้ระบบคำนวณระยะวิ่งรอบนี้ ถ้าไม่ทราบให้เว้นว่าง"
                        error={
                          unEntry.mounted_odometer.trim() !== '' &&
                          Number(unEntry.mounted_odometer) > Number(odometer)
                            ? 'ต้องไม่มากกว่าเลขไมล์ปัจจุบัน'
                            : undefined
                        }
                      >
                        <Input
                          type="number" inputMode="numeric" min={0}
                          value={unEntry.mounted_odometer}
                          onChange={(e) => setUnEntry((x) => ({ ...x, mounted_odometer: e.target.value }))}
                          placeholder="เช่น 120000"
                        />
                      </Field>
                    )}
                    <Field label="หมายเหตุ">
                      <Textarea
                        value={unEntry.note}
                        onChange={(e) => setUnEntry((x) => ({ ...x, note: e.target.value }))}
                        placeholder="ระบุหมายเหตุ (ถ้ามี)"
                      />
                    </Field>
                  </>
                }
              >
                <Field label="สาเหตุที่ถอด" required className="max-w-md">
                  <Select value={unReasonId} onChange={(e) => setUnReasonId(e.target.value)}>
                    <option value="">— เลือกสาเหตุ —</option>
                    {reasons.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.is_scrap ? ' (ตัดจำหน่าย)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </TireEntryFields>

              <Button className="w-full" size="lg" onClick={saveUnmount} disabled={!canSaveUnmount}>
                <Check className="size-4.5" />
                บันทึกการถอด แล้วใส่ยางล้อนี้ต่อ
              </Button>
            </div>
          )}

          {vehicle && position && stage === 'mount' && (
            <div className="max-w-3xl space-y-4">
              <p className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-100">
                <Check className="size-4 shrink-0" />
                ถอด{' '}
                <span className="font-medium">
                  {items[items.length - 1]?.serialNo}
                </span>{' '}
                ออกจาก {wheelName(position)} แล้ว — คีย์ยางเส้นใหม่ที่ใส่แทน
              </p>

              <TireEntryFields
                entry={mnEntry}
                onChange={(key, value) => setMnEntry((e) => ({ ...e, [key]: value }))}
                serialLabel="เลขยางที่ใส่ (ซีเรียล)"
                serialError={mountBlocked ?? undefined}
                serialHint={
                  mountCandidate && !mountBlocked
                    ? 'พบยางเส้นนี้ในระบบแล้ว — ใช้ข้อมูลเดิม'
                    : 'ถ้ายังไม่มีในระบบ ระบบจะสร้างให้จากข้อมูลที่คีย์'
                }
                lockedInfo={mountCandidate && !mountBlocked ? mountCandidate : null}
                treadLabel="ดอกยางที่วัดได้ (มม.)"
                extra={
                  <Field label="หมายเหตุ">
                    <Textarea
                      value={mnEntry.note}
                      onChange={(e) => setMnEntry((x) => ({ ...x, note: e.target.value }))}
                      placeholder="ระบุหมายเหตุ (ถ้ามี)"
                    />
                  </Field>
                }
              />

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button className="flex-1" size="lg" onClick={saveMount} disabled={!canSaveMount}>
                  <Check className="size-4.5" />
                  บันทึกการใส่ยาง
                </Button>
                <Button variant="secondary" size="lg" onClick={skipMount}>
                  <SkipForward className="size-4.5" />
                  ไม่ใส่ยางล้อนี้
                </Button>
              </div>
            </div>
          )}
        </StepSection>

        {/* ------------------------------------- ขั้นที่ 4 : รายการ + เสร็จสิ้น */}
        <StepSection
          index={4}
          title="รายการที่ทำแล้ว"
          description="ทำล้อถัดไปได้เรื่อย ๆ หรือกด “เสร็จสิ้น” เพื่อบันทึกทั้งชุดพร้อมกัน"
          locked={!reviewOpen}
          lockedText="ยังไม่มีรายการ — เริ่มจากแตะล้อบนแผนผัง"
          badge={<Badge tone="brand">{items.length} รายการ</Badge>}
        >
          {vehicle && (
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <DraftList
                  items={items}
                  wheelName={wheelName}
                  itemImage={itemImage}
                  onRemove={removeItem}
                />
              </div>

              <div className="lg:col-span-2">
                <p className="mb-2 text-sm font-medium text-ink-700">ผังล้อหลังบันทึก</p>
                <WheelDiagram
                  axleType={vehicle.axle_type}
                  axleTypes={axleTypes}
                  slots={previewSlots}
                  mode="view"
                />
              </div>
            </div>
          )}
        </StepSection>
      </div>

      {/* ------------------------------------------------ แถบบันทึกด้านล่าง */}
      {vehicle && (
        <div className="safe-bottom sticky bottom-0 z-20 mt-6 flex items-center justify-between gap-3 border-t border-line bg-surface/85 px-1 py-4 backdrop-blur">
          <Button variant="secondary" onClick={resetAll} disabled={saving || items.length === 0}>
            <RotateCcw className="size-4.5" />
            ล้างรายการ
          </Button>

          <span className="hidden text-sm text-ink-400 sm:block">
            {position
              ? stage === 'unmount'
                ? 'กำลังคีย์ยางที่ถอด'
                : 'กำลังคีย์ยางที่ใส่'
              : items.length === 0
                ? 'แตะล้อบนแผนผังเพื่อเริ่ม'
                : `ทำแล้ว ${touchedPositions.size} ล้อ`}
          </span>

          <Button
            size="lg"
            variant="success"
            onClick={handleSubmit}
            loading={saving}
            disabled={items.length === 0 || Boolean(position)}
          >
            <Check className="size-4.5" />
            เสร็จสิ้น ({formatNumber(items.length)})
          </Button>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------ subviews */

/**
 * กล่องของ 1 ขั้นตอนบนหน้าเดียว — ขั้นที่ยังไม่ถึงจะล็อกไว้ (เห็นหัวข้อแต่เปิดไม่ได้)
 * และจะเปิดเนื้อหาออกมาเองเมื่อขั้นก่อนหน้าทำเสร็จ
 */
function StepSection({
  index,
  title,
  description,
  lockedText,
  locked = false,
  done = false,
  badge,
  action,
  sectionRef,
  children,
}: {
  index: number
  title: string
  description: string
  lockedText?: string
  locked?: boolean
  done?: boolean
  badge?: React.ReactNode
  action?: React.ReactNode
  sectionRef?: React.RefObject<HTMLElement | null>
  children: React.ReactNode
}) {
  return (
    <section
      ref={sectionRef}
      className={cn(
        'scroll-mt-32 overflow-hidden rounded-2xl border bg-white',
        locked ? 'border-dashed border-line' : 'border-line shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
      )}
    >
      <header
        className={cn(
          'flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5',
          !locked && 'border-b border-line/70',
          locked && 'opacity-60',
        )}
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            locked && 'bg-slate-100 text-ink-400',
            !locked && done && 'bg-emerald-50 text-emerald-600',
            !locked && !done && 'bg-brand-600 text-white',
          )}
        >
          {locked ? <Lock className="size-4" /> : done ? <Check className="size-4.5" /> : index}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-ink-900">{title}</p>
          <p className="text-sm text-ink-500">{locked ? lockedText : description}</p>
        </div>

        {!locked && badge}
        {!locked && action}
      </header>

      {!locked && <div className="p-4 sm:p-5">{children}</div>}
    </section>
  )
}

/**
 * ชุดช่องคีย์ข้อมูลยาง 1 เส้น ใช้ร่วมกันทั้งตอนถอดและตอนใส่
 *
 * โชว์เฉพาะช่องที่ต้องคีย์จริง (เลขยาง · ขนาด · ยี่ห้อ · รุ่น · ดอกยาง)
 * ส่วนที่ไม่จำเป็นซ่อนไว้ใต้ "รายละเอียดเพิ่มเติม"
 * ถ้ายางเส้นนั้นมีข้อมูลในระบบอยู่แล้ว จะโชว์ยี่ห้อ/รุ่นจากระบบแทนการให้คีย์ซ้ำ
 */
function TireEntryFields({
  entry,
  onChange,
  serialLabel,
  serialHint,
  serialError,
  lockedInfo,
  treadLabel,
  extra,
  children,
}: {
  entry: TireEntry
  onChange: <K extends keyof TireEntry>(key: K, value: string) => void
  serialLabel: string
  serialHint?: string
  serialError?: string
  /** ยางที่ระบบรู้จักแล้ว — ถ้ามี ไม่ต้องคีย์ยี่ห้อ/รุ่นซ้ำ */
  lockedInfo: TireLite | null
  treadLabel: string
  /** ช่องเสริมที่ซ่อนไว้ใต้ "รายละเอียดเพิ่มเติม" */
  extra?: React.ReactNode
  /** ช่องบังคับของแต่ละขั้น (เช่น สาเหตุที่ถอด) แสดงต่อจากดอกยาง */
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <Field
        label={serialLabel}
        required
        hint={serialError ? undefined : serialHint ?? 'อ่านเลขจากยางเส้นจริงแล้วคีย์ทุกครั้ง'}
        error={serialError}
      >
        <Input
          value={entry.serial_no}
          onChange={(e) => onChange('serial_no', e.target.value)}
          placeholder="T-295/80R22.5-010"
          autoFocus
        />
      </Field>

      {lockedInfo ? (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-100">
          <TireThumb
            src={lockedInfo.image_url}
            alt={[lockedInfo.brand_name, lockedInfo.model_name].filter(Boolean).join(' ')}
            size="lg"
          />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{lockedInfo.serial_no}</p>
            <TireSpec
              size={lockedInfo.size}
              brandName={lockedInfo.brand_name}
              modelName={lockedInfo.model_name}
              className="mt-1"
              detailClassName="text-sm text-ink-500"
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="ขนาด">
            <Input
              value={entry.size}
              onChange={(e) => onChange('size', e.target.value)}
              placeholder="295/80R22.5"
            />
          </Field>
          <Field label="ยี่ห้อ">
            <Input
              value={entry.brand_name}
              onChange={(e) => onChange('brand_name', e.target.value)}
              placeholder="MICHELIN"
            />
          </Field>
          <Field label="รุ่น">
            <Input
              value={entry.model_name}
              onChange={(e) => onChange('model_name', e.target.value)}
              placeholder="X MULTI Z"
            />
          </Field>
        </div>
      )}

      <TreadPicker
        label={treadLabel}
        value={entry.tread_mm}
        onChange={(v) => onChange('tread_mm', v)}
        max={12}
      />

      {children}

      <MoreDetails>
        {!lockedInfo && (
          <Field label="DOT" className="max-w-64">
            <Input
              value={entry.dot}
              onChange={(e) => onChange('dot', e.target.value)}
              placeholder="2323"
            />
          </Field>
        )}
        {extra}
      </MoreDetails>
    </div>
  )
}

/** ช่องที่ไม่ค่อยได้ใช้ — ซ่อนไว้ก่อน กดเปิดเมื่อจำเป็น */
function MoreDetails({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        {open ? 'ซ่อนรายละเอียดเพิ่มเติม' : 'รายละเอียดเพิ่มเติม (ไม่บังคับ)'}
      </button>
      {open && <div className="mt-3 space-y-4">{children}</div>}
    </div>
  )
}

/**
 * แผงเลือกค่าดอกยางแบบกดตัวเลข (นิ้วเดียวจบ) พร้อมช่องพิมพ์ทศนิยม
 */
function TreadPicker({
  label,
  value,
  onChange,
  max = 9,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  /** ตัวเลขสูงสุดของปุ่มกด (0..max) — default 9 */
  max?: number
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-700">{label}</p>
      <div className="grid max-w-md grid-cols-5 gap-2">
        {Array.from({ length: max + 1 }, (_, i) => i).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(String(n))}
            className={cn(
              'h-12 rounded-xl border text-lg font-semibold transition-all active:scale-95',
              Number(value) === n && value !== ''
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="หรือระบุทศนิยม เช่น 6.5"
        />
      </div>
    </div>
  )
}

/** รายการที่คีย์ไว้แล้วในชุดนี้ พร้อมปุ่มลบทีละรายการ */
function DraftList({
  items,
  wheelName,
  itemImage,
  onRemove,
}: {
  items: DraftItem[]
  wheelName: (code: string) => string
  itemImage: (item: DraftItem) => string | null
  onRemove: (key: string) => void
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink-400">
        ยังไม่มีรายการ — แตะล้อบนแผนผังเพื่อเริ่ม
      </p>
    )
  }

  return (
    <div className="space-y-2.5">
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
              {item.kind === 'manual_mount' && (
                <Badge tone="brand">
                  <PencilLine className="size-3.5" />
                  สร้างใหม่
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-500">{wheelName(item.positionCode)}</p>
            <TireSpec
              size={item.size}
              brandName={item.brandName}
              modelName={item.modelName}
              className="mt-1"
              sizeClassName="text-sm"
            />
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
            onClick={() => onRemove(item.key)}
            aria-label="ลบรายการนี้"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="size-4.5" />
          </button>
        </div>
      ))}
    </div>
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
