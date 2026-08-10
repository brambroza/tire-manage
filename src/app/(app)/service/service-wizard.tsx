'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, ArrowLeft, Check, ChevronRight, Gauge, MapPin, Plus, Truck, X,
} from 'lucide-react'
import { Badge, Button, Field, Input, Select } from '@/components/ui'
import { WheelDiagram, type WheelSlot } from '@/components/wheel-diagram'
import { getLayout, positionLabel, positionNo, type WheelPosition } from '@/lib/axle-layouts'
import { PROVINCES } from '@/lib/provinces'
import { cn, formatKm, todayISO } from '@/lib/utils'
import {
  addCompanyTireModelAction, applyServiceBatchAction, ensureServiceVehicleAction,
} from './actions'
import type { AxleCategory, AxleType } from '@/lib/database.types'

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
  /** ดอกยางตอนใหม่ของยางเส้นนี้ (ถ้าบันทึกไว้) */
  new_tread_mm: number | null
  lifetime_km: number
  current_run_km: number
  vehicle_id: string | null
  position_code: string | null
  plate_no: string | null
  /** รูปยางจากแคตตาล็อก (ถ้ารุ่นนั้นมีรูป) */
  image_url: string | null
}

/** รุ่นยางในแคตตาล็อกที่ super admin กำหนดให้บริษัทนี้เห็น */
export interface TireModelLite {
  id: string
  brand_name: string
  model_name: string
  size: string | null
  new_tread_mm: number | null
}

export interface ReasonOption {
  id: string
  name: string
  is_scrap: boolean
}

/** ขั้นตอนบนหน้าจอช่าง — ทีละหน้าจอ ไม่มีการเลื่อนยาว */
type Step =
  | 'plate'
  | 'category'
  | 'axle'
  | 'odometer'
  | 'wheel'
  | 'unmount'
  | 'mount-kind'
  | 'mount'

/** ยางที่ช่างเลือกในแต่ละขั้น — เลือกได้เฉพาะจากรายการที่ระบบกำหนดให้ */
interface TirePick {
  /** รุ่นในแคตตาล็อกที่ super admin กำหนดให้บริษัทนี้ ('' = ยังไม่ได้เลือก) */
  modelId: string
  /** ยางเส้นจริงที่ว่างอยู่ในคลัง ('' = ไม่ได้เลือกจากคลัง) */
  stockTireId: string
  serialNo: string
  /** ดอกยางคงเหลือ (มม.) */
  treadMm: string
}

const EMPTY_PICK: TirePick = { modelId: '', stockTireId: '', serialNo: '', treadMm: '' }

/**
 * 1 บรรทัดในรายการเลือกยาง
 * catalog = รุ่นที่ super admin กำหนดให้ (ช่างคีย์ซีเรียลเอง)
 * stock   = ยางเส้นจริงที่ว่างอยู่ในคลัง (ระบบเติมซีเรียลและดอกยางให้)
 */
type TireOption =
  | { kind: 'catalog'; id: string; size: string; detail: string; model: TireModelLite }
  | { kind: 'stock'; id: string; size: string; detail: string; tire: TireLite }

const CATEGORY_LABEL: Record<AxleCategory, string> = { head: 'หัว', trailer: 'หาง' }

/** ตัวเลือกดอกยางในรายการ dropdown (มม.) */
const TREAD_OPTIONS = Array.from({ length: 21 }, (_, i) => i)

/**
 * ใส่จุลภาคคั่นหลักพันให้ตัวเลขที่กำลังคีย์ เช่น "555505" → "555,505"
 * @param digits ตัวเลขล้วน (ว่างได้)
 */
function groupDigits(digits: string): string {
  if (digits === '') return ''
  return Number(digits).toLocaleString('en-US')
}

/**
 * ทำข้อความให้เทียบง่ายตอนค้นหา — ตัดช่องว่าง ขีด จุด และตัวพิมพ์ใหญ่ทิ้ง
 * เช่น "11R22.5" "11 r 22 5" "295/80R22.5" จึงค้นเจอกันได้
 * @param value ข้อความดิบ
 */
function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/[\s\-_./]/g, '')
}

/**
 * ตัดคำค้นเป็นคำย่อย ๆ เพื่อค้นแบบ "ต้องเจอทุกคำ" (ไม่สนลำดับ)
 * เช่น "bridgestone 11r22.5" ค้นเจอ "11R22.5 · Bridgestone R150"
 * @param query คำค้นที่ช่างพิมพ์
 */
function searchTokens(query: string): string[] {
  return query
    .split(/\s+/)
    .map(normalizeSearch)
    .filter((token) => token !== '')
}

/**
 * แปลงรุ่นยางเป็นตัวเลือกในรายการค้นหา เรียงตามขนาดแล้วยี่ห้อ
 * @param list รุ่นยางที่จะให้เลือก
 */
function toCatalogOptions(list: TireModelLite[]): TireOption[] {
  return [...list]
    .sort(
      (a, b) =>
        (a.size ?? '').localeCompare(b.size ?? '') ||
        a.brand_name.localeCompare(b.brand_name),
    )
    .map((model) => ({
      kind: 'catalog' as const,
      id: model.id,
      size: model.size ?? 'ไม่ระบุขนาด',
      detail: [model.brand_name, model.model_name].filter(Boolean).join(' ') || 'ไม่ระบุรุ่น',
      model,
    }))
}

const STEP_TITLE: Record<Step, string> = {
  plate: 'ใส่ทะเบียนรถ',
  category: 'เลือกประเภทรถ',
  axle: 'เลือกแบบรถ',
  odometer: 'ใส่เลขไมล์',
  wheel: 'เลือกตำแหน่งล้อ',
  unmount: 'ถอดยาง',
  'mount-kind': 'ใส่ยาง — เลือกชนิดยาง',
  mount: 'ใส่ยาง',
}

/* ------------------------------------------------------------- component */

/**
 * หน้าบันทึกถอด-ใส่ยางสำหรับช่าง (ออกแบบให้ใช้บนมือถือ ทีละหน้าจอ)
 *
 * ทะเบียน → ประเภทรถ (หัว/หาง) → แบบรถ → เลขไมล์ → ตำแหน่งล้อ
 * → ถอดยาง → ใส่ยาง (ใหม่/เก่า) → บันทึก → เคลียร์หน้าจอทำล้อถัดไป
 */
export function ServiceWizard({
  vehicles,
  tires,
  reasons,
  axleTypes,
  models,
  initialVehicleId,
}: {
  vehicles: VehicleLite[]
  tires: TireLite[]
  reasons: ReasonOption[]
  axleTypes: AxleType[]
  models: TireModelLite[]
  initialVehicleId?: string
}) {
  const router = useRouter()

  const initialVehicle = vehicles.find((v) => v.id === initialVehicleId) ?? null

  const [step, setStep] = React.useState<Step>('plate')
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  /** ข้อความแจ้งเตือนสั้นหลังบันทึกสำเร็จ (null = ไม่แสดง) */
  const [toast, setToast] = React.useState<string | null>(null)

  /* ทะเบียน: กล่องหน้า (ตัวอักษร/เลข) + กล่องหลัง */
  const initialPlate = (initialVehicle?.plate_no ?? '').split('-')
  const [platePrefix, setPlatePrefix] = React.useState(initialPlate[0] ?? '')
  const [plateNumber, setPlateNumber] = React.useState(initialPlate[1] ?? '')
  const [province, setProvince] = React.useState(initialVehicle?.province ?? PROVINCES[0])
  /** ช่องทะเบียนส่วนหน้า — โฟกัสกลับเมื่อลบย้อนจากช่องหลังที่ว่าง */
  const platePrefixRef = React.useRef<HTMLInputElement>(null)
  /** ช่องทะเบียนส่วนหลัง — โฟกัสอัตโนมัติเมื่อคีย์ส่วนหน้าครบ 2 ตัว */
  const plateNumberRef = React.useRef<HTMLInputElement>(null)

  /** รถที่กำลังทำงานอยู่ (มาจากระบบ หรือเพิ่งสร้างจากทะเบียนที่คีย์) */
  const [vehicle, setVehicle] = React.useState<VehicleLite | null>(initialVehicle)
  /** true = ทะเบียนนี้ยังไม่มีในระบบ ต้องเลือกจังหวัดเพื่อสร้างรถใหม่ */
  const [isNewVehicle, setIsNewVehicle] = React.useState(false)

  const [category, setCategory] = React.useState<AxleCategory | null>(null)
  const [axleTypeCode, setAxleTypeCode] = React.useState<string | null>(
    initialVehicle?.axle_type ?? null,
  )
  const [odometer, setOdometer] = React.useState(
    initialVehicle ? String(initialVehicle.current_mileage) : '',
  )

  const [position, setPosition] = React.useState<string | null>(null)

  /* ขั้นถอด */
  const [unPick, setUnPick] = React.useState<TirePick>(EMPTY_PICK)
  const [reasonId, setReasonId] = React.useState('')

  /* ขั้นใส่ */
  const [mountKind, setMountKind] = React.useState<'new' | 'used' | null>(null)
  const [mnPick, setMnPick] = React.useState<TirePick>(EMPTY_PICK)

  /** รุ่นยางรอตรวจสอบที่ช่างเพิ่งเพิ่มจากคำค้นหน้างาน (ยังไม่ผ่าน refresh) */
  const [addedModels, setAddedModels] = React.useState<TireModelLite[]>([])

  /** แคตตาล็อกของบริษัทนี้ = ที่ super admin กำหนดให้ + รายการรอตรวจสอบจากหน้างาน */
  const allModels = React.useMemo(() => {
    const seen = new Set(models.map((m) => m.id))
    return [...models, ...addedModels.filter((m) => !seen.has(m.id))]
  }, [models, addedModels])

  /** ซ่อน snackbar เองหลัง 3 วินาที — ช่างไม่ต้องกดปิด */
  React.useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const plateNo = `${platePrefix.trim()}-${plateNumber.trim()}`
  const axleType = axleTypes.find((t) => t.code === axleTypeCode) ?? null
  const layout = getLayout(axleTypeCode, axleTypes)

  /** ประเภทเพลาที่เปิดใช้งาน แยกตามหมวดที่ช่างเลือก */
  const axleChoices = React.useMemo(
    () => axleTypes.filter((t) => t.is_active && t.category === category),
    [axleTypes, category],
  )

  /** ยางที่ระบบบันทึกว่าติดตั้งอยู่บนรถคันนี้ */
  const mountedOnVehicle = React.useMemo(
    () => tires.filter((t) => t.vehicle_id === vehicle?.id && t.status === 'mounted'),
    [tires, vehicle],
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
        alert: false,
      }
    }
    return map
  }, [mountedOnVehicle])

  /** ยางที่ระบบบันทึกไว้ในล้อที่กำลังทำ (ใช้เป็นค่าตั้งต้นตอนถอด) */
  const slotTire = React.useMemo(() => {
    if (!position) return null
    const slot = slots[position]
    return slot ? tires.find((t) => t.id === slot.tireId) ?? null : null
  }, [position, slots, tires])

  /** ชื่อล้อแบบสั้น เช่น "ล้อ 3 · เพลา 2 ซ้ายนอก" */
  function wheelName(code: string | null) {
    if (!code) return '-'
    const no = positionNo(code, axleTypeCode, axleTypes)
    const label = positionLabel(code, axleTypeCode, axleTypes)
    return no ? `ล้อ ${no} · ${label}` : label
  }

  /**
   * ตัวเลือกรุ่นยางที่บริษัทนี้เห็น = ที่ super admin กำหนดให้ + รุ่นที่ช่างเพิ่มเองหน้างาน
   * ใช้ตอนถอด และตอนใส่ยางใหม่ (ซีเรียลคีย์อิสระเสมอ)
   */
  const catalogOptions = React.useMemo<TireOption[]>(
    () => toCatalogOptions(allModels),
    [allModels],
  )

  /**
   * ยางเก่าเลือกได้เฉพาะเส้นที่ "ถอดเก็บ" อยู่ในคลัง — ต้องเคยวิ่งมาแล้ว
   * (ยางใหม่ที่ยังไม่เคยใส่จะไม่อยู่ในรายการนี้ ให้ไปทางเมนูยางใหม่แทน)
   * ถ้าเส้นที่ถืออยู่หน้างานไม่มีในรายการ ช่างพิมพ์คีย์เข้าไปใหม่ได้
   */
  const usedOptions = React.useMemo<TireOption[]>(
    () =>
      tires
        .filter((t) => t.status === 'in_stock' && t.vehicle_id === null && t.lifetime_km > 0)
        .sort(
          (a, b) =>
            (a.size ?? '').localeCompare(b.size ?? '') ||
            (b.tread_mm ?? 0) - (a.tread_mm ?? 0),
        )
        .map((tire) => ({
          kind: 'stock' as const,
          id: tire.id,
          size: tire.size ?? 'ไม่ระบุขนาด',
          detail: [
            tire.serial_no,
            [tire.brand_name, tire.model_name].filter(Boolean).join(' ') || null,
            tire.tread_mm !== null ? `ดอกยาง ${tire.tread_mm} มม.` : null,
            `วิ่งสะสม ${formatKm(tire.lifetime_km)}`,
          ]
            .filter(Boolean)
            .join(' · '),
          tire,
        })),
    [tires],
  )

  /**
   * ตัวเลือกตอนใส่ยางเก่า = ยางถอดเก็บในคลังก่อน ตามด้วยรุ่นในแคตตาล็อก
   * (ต้องมีแคตตาล็อกต่อท้าย ไม่งั้นรุ่นที่ช่างเพิ่งกด "ใช้คำนี้เลย" จะไม่อยู่ในรายการ
   *  ทำให้ช่องค้นหากลับมาว่างเหมือนเพิ่มไม่สำเร็จ)
   */
  const mountUsedOptions = React.useMemo<TireOption[]>(
    () => [...usedOptions, ...catalogOptions],
    [usedOptions, catalogOptions],
  )

  const findTire = React.useCallback(
    (serial: string) => {
      const key = serial.trim().toLowerCase()
      if (!key) return null
      return tires.find((t) => t.serial_no.toLowerCase() === key) ?? null
    },
    [tires],
  )

  /** ขนาด/ยี่ห้อ/รุ่นของยางที่เลือกไว้ในขั้นนั้น (มาจากแคตตาล็อกหรือยางในคลัง) */
  function pickSpec(pick: TirePick) {
    const stock = tires.find((t) => t.id === pick.stockTireId) ?? null
    if (stock) {
      // ยางในคลังมีข้อมูลครบอยู่แล้ว ใช้ของเดิมทั้งชุด
      const model = allModels.find(
        (m) =>
          (m.size ?? '').toLowerCase() === (stock.size ?? '').toLowerCase() &&
          m.brand_name.toLowerCase() === (stock.brand_name ?? '').toLowerCase() &&
          m.model_name.toLowerCase() === (stock.model_name ?? '').toLowerCase(),
      ) ?? null
      return {
        model,
        size: stock.size ?? '',
        brandName: stock.brand_name ?? '',
        modelName: stock.model_name ?? '',
        newTreadMm: stock.new_tread_mm ?? model?.new_tread_mm ?? null,
      }
    }

    const model = allModels.find((m) => m.id === pick.modelId) ?? null
    return {
      model,
      size: model?.size ?? '',
      brandName: model?.brand_name ?? '',
      modelName: model?.model_name ?? '',
      newTreadMm: model?.new_tread_mm ?? null,
    }
  }

  const unSpec = pickSpec(unPick)
  const mnSpec = pickSpec(mnPick)

  const odometerValid = odometer.trim() !== '' && Number(odometer) >= 0

  /**
   * ล้อนี้มียางในระบบอยู่แล้ว แต่ซีเรียลที่คีย์ไม่ตรง — ต้องให้ช่างตรวจก่อน
   * ไม่งั้นระบบจะสร้างยางซ้ำทับตำแหน่งเดิมและประวัติยางเพี้ยน
   */
  const unMismatch =
    Boolean(slotTire) &&
    unPick.serialNo.trim() !== '' &&
    unPick.serialNo.trim().toLowerCase() !== slotTire!.serial_no.toLowerCase()

  const canSubmitUnmount =
    unPick.serialNo.trim() !== '' &&
    unSpec.size !== '' &&
    unPick.treadMm !== '' &&
    reasonId !== '' &&
    !unMismatch

  const mountCandidate = findTire(mnPick.serialNo)

  /** เหตุผลที่ยางเส้นที่คีย์ใส่ไม่ได้ (null = ใส่ได้) */
  const mountBlocked = (() => {
    // ยางใหม่ = ซีรีย์ต้องไม่เคยมีในระบบ เช็คซ้ำจากซีรีย์อย่างเดียว
    if (mountKind === 'new' && mountCandidate) {
      return `ซีรีย์ ${mountCandidate.serial_no} มีอยู่ในระบบแล้ว — ยางใหม่ต้องเป็นซีรีย์ที่ยังไม่เคยบันทึก`
    }
    if (!mountCandidate) return null
    // ยางเก่า: ซ้ำได้เฉพาะกรณีซีรีย์นั้นยังติดตั้งอยู่บนรถอยู่แล้ว ต้องถอดออกก่อน
    if (mountCandidate.status === 'mounted' && mountCandidate.id !== slotTire?.id) {
      return `ซีรีย์ ${mountCandidate.serial_no} ติดตั้งอยู่ที่ ${mountCandidate.plate_no ?? 'รถคันอื่น'} — ต้องถอดออกก่อน`
    }
    return null
  })()

  const canSubmitMount =
    mnPick.serialNo.trim() !== '' &&
    mnSpec.size !== '' &&
    !mountBlocked &&
    (mountKind === 'new' || mnPick.treadMm !== '')

  /* ------------------------------------------------------------- actions */

  /** ยืนยันทะเบียน — หาในระบบก่อน ถ้าไม่พบให้เตรียมสร้างรถใหม่ */
  function submitPlate() {
    setError(null)
    if (platePrefix.trim() === '' || plateNumber.trim() === '') {
      setError('กรุณาใส่ทะเบียนรถให้ครบทั้งสองช่อง')
      return
    }

    const key = plateNo.toLowerCase()
    const found =
      vehicles.find((v) => v.plate_no.toLowerCase() === key) ??
      vehicles.find((v) => v.plate_no.replace(/[\s-]/g, '').toLowerCase() === key.replace(/-/g, '')) ??
      null

    setVehicle(found)
    setIsNewVehicle(!found)
    if (found) {
      setProvince(found.province)
      setOdometer(String(found.current_mileage))
      const currentType = axleTypes.find((t) => t.code === found.axle_type) ?? null
      setCategory(currentType?.category ?? null)
      setAxleTypeCode(found.axle_type)
    } else {
      setOdometer('')
      setCategory(null)
      setAxleTypeCode(null)
    }
    setStep('category')
  }

  /** เลือกแบบรถแล้วผูกกับทะเบียน (สร้างรถใหม่ให้ถ้ายังไม่มีในระบบ) */
  async function selectAxleType(code: string) {
    setError(null)
    setSaving(true)
    const result = await ensureServiceVehicleAction({
      plate_no: plateNo,
      province,
      axle_type: code,
    })
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    const data = result.data!
    setAxleTypeCode(data.axle_type)
    setVehicle({
      id: data.id,
      plate_no: data.plate_no,
      province: data.province,
      brand: null,
      model: null,
      axle_type: data.axle_type,
      current_mileage: data.current_mileage,
    })
    setIsNewVehicle(false)
    if (odometer.trim() === '') setOdometer(data.current_mileage > 0 ? String(data.current_mileage) : '')
    setStep('odometer')
    router.refresh()
  }

  /**
   * เพิ่มคำค้นที่ไม่มีในรายการเป็นรุ่นรอตรวจสอบ แล้วเลือกใช้ต่อได้ทันที
   * @param label คำค้นขนาด/ยี่ห้อ/รุ่นที่ช่างพิมพ์หน้างาน
   * @returns รุ่นรอตรวจสอบที่เพิ่ม (null = เพิ่มไม่สำเร็จ)
   */
  async function addModel(label: string): Promise<TireModelLite | null> {
    const result = await addCompanyTireModelAction({ label })

    if (!result.ok) {
      setError(result.error)
      return null
    }

    const model: TireModelLite = {
      id: result.data!.id,
      brand_name: result.data!.brand_name,
      model_name: result.data!.model_name,
      size: result.data!.size,
      new_tread_mm: result.data!.new_tread_mm,
    }
    setAddedModels((prev) => [...prev, model])
    setError(null)
    router.refresh()
    return model
  }

  /** แตะล้อบนผัง → เริ่มขั้นถอดของล้อนั้น */
  function startWheel(pos: WheelPosition) {
    setError(null)
    setPosition(pos.code)

    // เติมยางที่ระบบบันทึกไว้ในล้อนี้ให้ก่อน ช่างแก้ได้ถ้าหน้างานไม่ตรง
    const current = slots[pos.code]
    const tire = current ? tires.find((t) => t.id === current.tireId) ?? null : null
    const model = tire
      ? allModels.find(
          (m) =>
            (m.size ?? '').toLowerCase() === (tire.size ?? '').toLowerCase() &&
            m.brand_name.toLowerCase() === (tire.brand_name ?? '').toLowerCase() &&
            m.model_name.toLowerCase() === (tire.model_name ?? '').toLowerCase(),
        ) ?? null
      : null

    setUnPick({
      modelId: model?.id ?? '',
      stockTireId: '',
      serialNo: tire?.serial_no ?? '',
      treadMm: '',
    })
    setReasonId('')
    setMountKind(null)
    setMnPick(EMPTY_PICK)
    setStep('unmount')
  }

  /** เลือกชนิดยางที่จะใส่ แล้วเตรียมค่าตั้งต้นของฟอร์มใส่ยาง */
  function selectMountKind(kind: 'new' | 'used') {
    setMountKind(kind)
    setMnPick(EMPTY_PICK)
    setStep('mount')
  }

  /** สร้างรายการ 1 บรรทัดสำหรับส่งเข้า batch */
  function buildItems() {
    if (!position) return []
    const unTire = findTire(unPick.serialNo)
    const unIsKnown = Boolean(unTire) && unTire!.id === slotTire?.id

    const unmountItem = {
      kind: unIsKnown ? ('unmount' as const) : ('manual_unmount' as const),
      tire_id: unIsKnown ? unTire!.id : null,
      position_code: position,
      tread_mm: Number(unPick.treadMm),
      reason_id: reasonId,
      note: null,
      manual: unIsKnown
        ? null
        : {
            serial_no: unPick.serialNo.trim(),
            tire_model_id: unSpec.model?.id ?? null,
            brand_name: unSpec.brandName || null,
            model_name: unSpec.modelName || null,
            size: unSpec.size || null,
            dot: null,
            new_tread_mm: unSpec.newTreadMm,
            mounted_odometer: null,
          },
    }

    // ยางใหม่ยังไม่มีดอกยางวัดจริง → ใช้ดอกยางตอนใหม่จากแคตตาล็อก
    const mountTread =
      mountKind === 'used' ? Number(mnPick.treadMm) : mnSpec.newTreadMm ?? null

    const mountItem = {
      kind: mountCandidate ? ('mount' as const) : ('manual_mount' as const),
      tire_id: mountCandidate?.id ?? null,
      position_code: position,
      tread_mm: mountTread,
      reason_id: null,
      note: null,
      // บอก server ว่าเป็นยางใหม่ เพื่อบังคับกฎแคตตาล็อก + ซีรีย์ห้ามซ้ำอีกชั้น
      new_tire: mountKind === 'new',
      manual: mountCandidate
        ? null
        : {
            serial_no: mnPick.serialNo.trim(),
            tire_model_id: mnSpec.model?.id ?? null,
            brand_name: mnSpec.brandName || null,
            model_name: mnSpec.modelName || null,
            size: mnSpec.size || null,
            dot: null,
            new_tread_mm: mnSpec.newTreadMm,
            mounted_odometer: null,
          },
    }

    return [unmountItem, mountItem]
  }

  /** บันทึกล้อนี้ทั้งคู่ (ถอด + ใส่) ในทรานแซกชันเดียว */
  async function handleSave() {
    if (!vehicle || !position || !canSubmitMount) return
    setSaving(true)
    setError(null)

    const result = await applyServiceBatchAction({
      vehicle_id: vehicle.id,
      odometer: Number(odometer),
      event_date: todayISO(),
      items: buildItems(),
    })

    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }

    // บันทึกแล้วกลับไปเริ่มรถคันใหม่ทันที — ไม่มีทางเลือกทำต่อรถคันเดิม
    startOver()
    setToast('บันทึกเรียบร้อย')
    router.refresh()
  }

  /** เคลียร์ทั้งหน้าจอ เริ่มรถคันใหม่ */
  function startOver() {
    setPlatePrefix('')
    setPlateNumber('')
    setVehicle(null)
    setIsNewVehicle(false)
    setCategory(null)
    setAxleTypeCode(null)
    setOdometer('')
    setPosition(null)
    setUnPick(EMPTY_PICK)
    setReasonId('')
    setMountKind(null)
    setMnPick(EMPTY_PICK)
    setError(null)
    setStep('plate')
  }

  /** ปุ่มย้อนกลับของแต่ละขั้น */
  function goBack() {
    setError(null)
    const back: Partial<Record<Step, Step>> = {
      category: 'plate',
      axle: 'category',
      odometer: 'axle',
      wheel: 'odometer',
      unmount: 'wheel',
      'mount-kind': 'unmount',
      mount: 'mount-kind',
    }
    const target = back[step]
    if (target) setStep(target)
  }

  /* --------------------------------------------------------------- views */

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* แถบสรุปงานปัจจุบัน — เห็นตลอดว่ากำลังทำรถคันไหน */}
      <div className="glass sticky top-[4.5rem] z-20 mb-4 rounded-2xl border border-line px-4 py-3">
        <div className="flex items-center gap-3">
          {step !== 'plate' && (
            <button
              type="button"
              onClick={goBack}
              aria-label="ย้อนกลับ"
              className="-ml-1 flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-500 hover:bg-brand-50 hover:text-brand-600"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-base font-semibold text-ink-900">
              <Truck className="size-5 shrink-0 text-brand-500" />
              <span className="truncate">
                {vehicle?.plate_no ?? (platePrefix || plateNumber ? plateNo : 'ยังไม่ได้เลือกรถ')}
              </span>
            </p>
            <p className="truncate text-sm text-ink-500">
              {[
                STEP_TITLE[step],
                axleType?.name,
                odometerValid ? formatKm(Number(odometer)) : null,
                position ? wheelName(position) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* --------------------------------------------- ขั้นที่ 1: ทะเบียน */}
      {step === 'plate' && (
        <StepCard title="ใส่ทะเบียนรถ" description="">
          <div className="flex items-center gap-2">
            <Input
              ref={platePrefixRef}
              value={platePrefix}
              onChange={(e) => {
                // จำกัด 2 ตัว แล้วดีดไปช่องหลังทันที — ช่างคีย์รวดเดียวไม่ต้องแตะจอ
                const value = e.target.value.slice(0, 2)
                setPlatePrefix(value)
                if (value.length === 2) plateNumberRef.current?.focus()
              }}
              placeholder="70"
              maxLength={2}
              autoFocus
              className="h-16 text-center text-2xl font-semibold"
              aria-label="ทะเบียนส่วนหน้า"
            />
            <span className="text-2xl font-semibold text-ink-400">-</span>
            <Input
              ref={plateNumberRef}
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              onKeyDown={(e) => {
                // ลบย้อนจากช่องว่าง = กลับไปแก้ส่วนหน้า
                if (e.key === 'Backspace' && plateNumber === '') {
                  e.preventDefault()
                  setPlatePrefix((prev) => prev.slice(0, -1))
                  platePrefixRef.current?.focus()
                }
              }}
              placeholder="1234"
              inputMode="numeric"
              maxLength={8}
              className="h-16 text-center text-2xl font-semibold"
              aria-label="ทะเบียนส่วนหลัง"
            />
          </div>

          <PrimaryButton onClick={submitPlate}>ตกลง</PrimaryButton>
        </StepCard>
      )}

      {/* ------------------------------------------ ขั้นที่ 2: ประเภทรถ */}
      {step === 'category' && (
        <StepCard
          title="เลือกประเภทรถ"
          description={
            isNewVehicle
              ? `ทะเบียน ${plateNo} ยังไม่มีในระบบ — ระบบจะสร้างรถคันนี้ให้`
              : `ทะเบียน ${plateNo}`
          }
        >
          {isNewVehicle && (
            <Field label="จังหวัดของทะเบียน" required>
              <Select value={province} onChange={(e) => setProvince(e.target.value)}>
                {PROVINCES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            {(['head', 'trailer'] as AxleCategory[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { setCategory(value); setStep('axle') }}
                className={cn(
                  'flex h-24 flex-col items-center justify-center gap-1 rounded-2xl border text-xl font-semibold transition-all active:scale-[0.98]',
                  category === value
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-line bg-white text-ink-800 hover:border-brand-300 hover:bg-brand-50',
                )}
              >
                <Truck className="size-7" />
                {CATEGORY_LABEL[value]}
              </button>
            ))}
          </div>
        </StepCard>
      )}

      {/* --------------------------------------------- ขั้นที่ 3: แบบรถ */}
      {step === 'axle' && (
        <StepCard
          title={`เลือกแบบรถ (${category ? CATEGORY_LABEL[category] : ''})`}
          description=""
        >
          {axleChoices.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              ยังไม่มีแบบรถในหมวดนี้ — แจ้งแอดมินให้เพิ่มที่หน้าตั้งค่าประเภทเพลา
            </p>
          ) : (
            <div className="space-y-3">
              {axleChoices.map((type) => {
                const typeLayout = getLayout(type.code, axleTypes)
                return (
                  <button
                    key={type.id}
                    type="button"
                    disabled={saving}
                    onClick={() => selectAxleType(type.code)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.99] disabled:opacity-60',
                      axleTypeCode === type.code
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-line bg-white hover:border-brand-300 hover:bg-brand-50/50',
                    )}
                  >
                    {type.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={type.image_url}
                        alt={type.name}
                        className="h-16 w-20 shrink-0 rounded-xl object-contain"
                      />
                    ) : (
                      <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                        <Truck className="size-7" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-semibold text-ink-900">
                        {type.name}
                      </span>
                      <span className="block text-sm text-ink-500">
                        {typeLayout.wheelCount} ล้อ · {type.axle_kinds.length} เพลา
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-ink-300" />
                  </button>
                )
              })}
            </div>
          )}
        </StepCard>
      )}

      {/* -------------------------------------------- ขั้นที่ 4: เลขไมล์ */}
      {step === 'odometer' && (
        <StepCard title="ใส่เลขไมล์" description={`เลขไมล์ปัจจุบันของ ${vehicle?.plate_no ?? plateNo}`}>
          <Field
            label="เลขไมล์ (กม.)"
            required
            hint={vehicle ? `ล่าสุดในระบบ ${formatKm(vehicle.current_mileage)}` : undefined}
          >
            <div className="relative">
              <Gauge className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-400" />
              <Input
                type="text"
                inputMode="numeric"
                // โชว์คั่นหลักพันให้อ่านง่ายหน้างาน แต่เก็บเป็นตัวเลขล้วนใน state
                value={groupDigits(odometer)}
                onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))}
                autoFocus
                className="h-16 pl-12 text-2xl font-semibold"
              />
            </div>
          </Field>

          <PrimaryButton
            disabled={!odometerValid}
            onClick={() => { setError(null); setStep('wheel') }}
          >
            ถัดไป
          </PrimaryButton>
        </StepCard>
      )}

      {/* --------------------------------------- ขั้นที่ 5: ตำแหน่งล้อ */}
      {step === 'wheel' && vehicle && (
        <StepCard
          title="เลือกตำแหน่งล้อ"
          description={`${layout.name} · แตะล้อที่จะเปลี่ยนยาง`}
        >
          {axleType?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={axleType.image_url}
              alt={axleType.name}
              className="mx-auto max-h-56 w-full rounded-2xl border border-line object-contain p-2"
            />
          )}

          <WheelDiagram
            axleType={vehicle.axle_type}
            axleTypes={axleTypes}
            slots={slots}
            selected={position}
            onSelect={startWheel}
            mode="unmount"
            allowEmpty
          />
        </StepCard>
      )}

      {/* ------------------------------------------- ขั้นที่ 6: ถอดยาง */}
      {step === 'unmount' && (
        <StepCard title="ถอดยาง" description={wheelName(position)}>
          {slotTire && (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink-500">
              ระบบบันทึกไว้ว่าล้อนี้คือ{' '}
              <span className="font-medium text-ink-800">{slotTire.serial_no}</span>
            </p>
          )}

          <TirePickFields
            pick={unPick}
            onChange={setUnPick}
            options={catalogOptions}
            emptyText="ยังไม่มีรุ่นยางในแคตตาล็อกของบริษัทนี้ — เพิ่มรุ่นที่ใช้หน้างานได้เลย"
            onAddModel={addModel}
            withTread
            treadLabel="ดอกยางเหลือ (มม.)"
            serialError={
              unMismatch
                ? `ไม่ตรงกับที่ระบบบันทึกไว้ (${slotTire!.serial_no}) — ตรวจสอบซีรีย์ยางอีกครั้ง`
                : undefined
            }
          />

          <Field label="สาเหตุ" required>
            <Select value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
              <option value="">— เลือกสาเหตุ —</option>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.is_scrap ? ' (ตัดจำหน่าย)' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <PrimaryButton
            disabled={!canSubmitUnmount}
            onClick={() => { setError(null); setStep('mount-kind') }}
          >
            ถัดไป
          </PrimaryButton>
        </StepCard>
      )}

      {/* -------------------------------------- ขั้นที่ 7: ชนิดยางที่ใส่ */}
      {step === 'mount-kind' && (
        <StepCard title="ใส่ยาง" description={`${wheelName(position)} — เลือกชนิดยางที่จะใส่`}>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'new' as const, label: 'ยางใหม่' },
              { value: 'used' as const, label: 'ยางเก่า' },
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => selectMountKind(option.value)}
                className={cn(
                  'h-24 rounded-2xl border text-xl font-semibold transition-all active:scale-[0.98]',
                  mountKind === option.value
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-line bg-white text-ink-800 hover:border-brand-300 hover:bg-brand-50',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </StepCard>
      )}

      {/* ------------------------------------------- ขั้นที่ 8: ใส่ยาง */}
      {step === 'mount' && (
        <StepCard
          title={mountKind === 'new' ? 'ใส่ยางใหม่' : 'ใส่ยางเก่า'}
          description={wheelName(position)}
        >
          <TirePickFields
            pick={mnPick}
            onChange={setMnPick}
            options={mountKind === 'used' ? mountUsedOptions : catalogOptions}
            emptyText={
              mountKind === 'used'
                ? 'ยังไม่มียางถอดเก็บในคลัง — พิมพ์ขนาด/รุ่นเพื่อคีย์เข้าไปใหม่ได้เลย'
                : 'ยังไม่มีรุ่นยางในแคตตาล็อกของบริษัทนี้ — เพิ่มรุ่นที่ใช้หน้างานได้เลย'
            }
            selectionLabel={mountKind === 'used' ? 'เลือกยางถอดเก็บ' : 'เลือกรุ่นยางใหม่'}
            selectionHint={
              mountKind === 'used'
                ? 'ยางถอดเก็บในคลังขึ้นก่อน — ถ้าเส้นที่ถืออยู่ไม่มีในรายการ เลือกรุ่นจากแคตตาล็อกหรือแตะ “ใช้คำนี้เลย” แล้วคีย์ซีเรียลเอง'
                : 'เลือกรุ่นจากแคตตาล็อก — ถ้าไม่พบ แตะ “ใช้คำนี้เลย” ระบบเพิ่มให้เฉพาะบริษัทนี้'
            }
            onAddModel={addModel}
            withTread={mountKind === 'used'}
            treadLabel="ดอกยาง (มม.)"
            serialError={mountBlocked ?? undefined}
          />

          <PrimaryButton disabled={!canSubmitMount} loading={saving} onClick={handleSave}>
            <Check className="size-5" />
            บันทึก
          </PrimaryButton>
        </StepCard>
      )}

      {isNewVehicle && step === 'category' && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-400">
          <MapPin className="size-3.5" />
          รถใหม่จะถูกบันทึกเข้าระบบด้วยทะเบียนและจังหวัดที่เลือก
        </p>
      )}

      {/* snackbar ยืนยันบันทึกสำเร็จ — มุมขวาบน ไม่บังปุ่มหน้าจอ */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed right-4 top-4 z-50 max-w-[calc(100vw-2rem)]"
        >
          <div className="animate-slide-in-right flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white py-3 pl-3 pr-5 shadow-lg ring-1 ring-black/5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="size-5" strokeWidth={3} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold text-ink-900">{toast}</span>
              <span className="block text-xs text-ink-500">เริ่มรถคันใหม่ได้เลย</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ subviews */

/** กล่องของ 1 ขั้นตอน — 1 หน้าจอ 1 เรื่อง เพื่อให้กดง่ายบนมือถือ */
function StepCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <header className="mb-4">
        <p className="text-xl font-semibold text-ink-900">{title}</p>
        {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

/** ปุ่มหลักของแต่ละขั้น — เต็มความกว้าง กดด้วยนิ้วโป้งได้ */
function PrimaryButton({
  disabled,
  loading,
  onClick,
  children,
}: {
  disabled?: boolean
  loading?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button className="h-14 w-full text-lg" size="lg" disabled={disabled} loading={loading} onClick={onClick}>
      {children}
    </Button>
  )
}

/**
 * ช่องเลือกยางแบบ autocomplete — พิมพ์ค้นหาแล้วแตะเลือก
 *
 * ถ้าค้นหาแคตตาล็อกไม่พบ ช่างใช้คำที่พิมพ์ได้ทันที ระบบจะสร้างรายการ
 * รอตรวจสอบให้ super admin กลับมาแก้ยี่ห้อ รุ่น และขนาดภายหลัง
 */
function TireAutocomplete({
  pick,
  onChange,
  options,
  emptyText,
  onAddModel,
}: {
  pick: TirePick
  onChange: (pick: TirePick) => void
  options: TireOption[]
  /** ข้อความเมื่อไม่มีตัวเลือกให้เลือกเลย */
  emptyText: string
  /** เพิ่มคำค้นเป็นรุ่นรอตรวจสอบ (ไม่ส่งมา = เพิ่มไม่ได้ เช่น การเลือกยางเก่าในคลัง) */
  onAddModel?: (label: string) => Promise<TireModelLite | null>
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  /** true ระหว่างนิ้ว/เมาส์กดค้างอยู่ในรายการ — กัน blur ปิดรายการก่อนคลิกทำงาน (Safari) */
  const pressingRef = React.useRef(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const selectedId = pick.stockTireId || pick.modelId
  const selected = options.find((o) => o.id === selectedId) ?? null

  // เลือกแล้วโชว์ชื่อเต็มของรายการ ยังไม่เลือกก็โชว์คำค้นที่กำลังพิมพ์
  const text = selected ? `${selected.size} · ${selected.detail}` : query

  const matches = React.useMemo(() => {
    if (selected) return options.slice(0, 50)
    const tokens = searchTokens(query)
    if (tokens.length === 0) return options.slice(0, 50)
    return options
      .filter((o) => {
        const hay = normalizeSearch(`${o.size} ${o.detail}`)
        return tokens.every((t) => hay.includes(t))
      })
      .slice(0, 50)
  }, [options, query, selected])

  /** เลือก 1 รายการ — ยางในคลังเติมซีเรียลและดอกยางให้เลย */
  function choose(option: TireOption) {
    if (option.kind === 'stock') {
      onChange({
        ...pick,
        modelId: '',
        stockTireId: option.id,
        serialNo: option.tire.serial_no,
        treadMm: option.tire.tread_mm !== null ? String(option.tire.tread_mm) : pick.treadMm,
      })
    } else {
      onChange({ ...pick, modelId: option.id, stockTireId: '' })
    }
    setQuery('')
    setOpen(false)
  }

  /** ใช้คำค้นที่ไม่พบเลย — สร้างรายการรอตรวจสอบและเลือกให้ทันที */
  async function addUnmatchedQuery() {
    const label = query.trim()
    if (!label || !onAddModel || adding) return
    setAdding(true)
    let created: TireModelLite | null = null
    try {
      created = await onAddModel(label)
    } finally {
      setAdding(false)
    }
    if (!created) return

    onChange({ ...pick, modelId: created.id, stockTireId: '' })
    setQuery('')
    setOpen(false)
  }

  const canAddQuery = Boolean(onAddModel && query.trim() && matches.length === 0)

  /** ล้างรายการที่เลือก กลับไปค้นหาใหม่ */
  function clearSelection() {
    onChange({
      ...pick,
      modelId: '',
      stockTireId: '',
      ...(pick.stockTireId ? { serialNo: '', treadMm: '' } : {}),
    })
    setQuery('')
    setOpen(true)
    inputRef.current?.focus()
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        // Safari ไม่โฟกัสปุ่มตอนกด → relatedTarget เป็น null แล้วรายการปิดก่อน onClick ทำงาน
        // จึงไม่ปิดถ้ากำลังกดค้างอยู่ในรายการ
        if (pressingRef.current) return
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => {
          // พิมพ์ใหม่ = ยกเลิกรายการที่เลือกไว้ แล้วค้นหาต่อ
          // เช็คจาก pick ไม่ใช่ selected เพราะรายการที่เลือกอาจไม่อยู่ใน options ชุดปัจจุบัน
          setQuery(e.target.value)
          if (pick.modelId || pick.stockTireId) {
            onChange({
              ...pick,
              modelId: '',
              stockTireId: '',
              // ค่าซีรีย์/ดอกยางของเส้นในคลังต้องไม่ค้างเมื่อเปลี่ยนมาคีย์เอง
              ...(pick.stockTireId ? { serialNo: '', treadMm: '' } : {}),
            })
          }
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        // แตะซ้ำที่ช่องเมื่อเลือกไว้แล้ว = เปิดรายการให้เลือกใหม่ได้ทันที
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            return
          }
          if (e.key !== 'Enter' || !canAddQuery) return
          e.preventDefault()
          void addUnmatchedQuery()
        }}
        placeholder="พิมพ์ค้นหา เช่น 11R22.5"
        maxLength={40}
        disabled={adding}
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        className={cn('h-14 text-lg', selected && 'pr-12')}
      />

      {selected && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clearSelection}
          aria-label="ล้างยางที่เลือก"
          className="absolute right-1 top-1 flex size-12 items-center justify-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-ink-700"
        >
          <X className="size-5" />
        </button>
      )}

      {open && (
        <div
          // กัน input หลุดโฟกัสตอนแตะรายการ — Safari ปิด dropdown ก่อน click ถ้าไม่กัน
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={() => { pressingRef.current = true }}
          onPointerUp={() => { pressingRef.current = false }}
          onPointerCancel={() => { pressingRef.current = false }}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto overscroll-contain rounded-xl border border-line bg-white py-1 shadow-lg"
        >
          {query.trim() === '' && options.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-500">{emptyText}</p>
          )}

          {query.trim() !== '' && matches.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-500">
              ไม่พบยางตามคำค้น “{query.trim()}” — ลองพิมพ์เฉพาะขนาด เช่น 11R22.5
            </p>
          )}

          {/* หายางที่ใช้หน้างานไม่เจอ → ใช้คำค้นได้เลย แอดมินค่อยแก้รายละเอียด */}
         {/*  {canAddQuery && (
            <button
              type="button"
              onClick={() => void addUnmatchedQuery()}
              disabled={adding}
              className="flex min-h-16 w-full items-center gap-3 bg-brand-600 px-4 py-3 text-left text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60"
            >
              <Plus className="size-6 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold">
                  {adding ? 'กำลังเพิ่ม…' : `ไม่พบรายการ — ใช้ “${query.trim()}” เลย`}
                </span>
                <span className="mt-0.5 block text-xs text-brand-100">
                  แตะตรงนี้ได้ทันที · แอดมินแก้รายละเอียดภายหลัง
                </span>
              </span>
            </button>
          )} */}

          {matches.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => choose(option)}
              className={cn(
                'flex min-h-14 w-full items-center gap-2 px-4 py-3 text-left hover:bg-brand-50 active:bg-brand-100',
                option.id === selectedId && 'bg-brand-50',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-medium text-ink-900">{option.size}</span>
                  {option.kind === 'stock' && <Badge tone="emerald">พร้อมใช้</Badge>}
                </span>
                <span className="block truncate text-sm text-ink-500">{option.detail}</span>
              </span>
              {option.id === selectedId && <Check className="size-5 shrink-0 text-brand-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * ชุดช่องคีย์ยาง 1 เส้น — เลือกยางจากรายการที่ระบบกำหนดให้
 * แล้วคีย์ซีเรียล (และดอกยางเมื่อจำเป็น)
 */
function TirePickFields({
  pick,
  onChange,
  options,
  emptyText,
  selectionLabel = 'เลือกยาง',
  selectionHint,
  onAddModel,
  withTread,
  treadLabel,
  serialError,
}: {
  pick: TirePick
  onChange: (pick: TirePick) => void
  /** ยางที่เลือกได้ — แคตตาล็อกของบริษัทนี้ หรือยางว่างในคลัง */
  options: TireOption[]
  emptyText: string
  selectionLabel?: string
  selectionHint?: string
  /** เพิ่มคำค้นเป็นรุ่นรอตรวจสอบ (ไม่ส่งมา = เพิ่มไม่ได้) */
  onAddModel?: (label: string) => Promise<TireModelLite | null>
  /** แสดงช่องดอกยางคงเหลือ */
  withTread: boolean
  treadLabel: string
  serialError?: string
}) {
  const set = <K extends keyof TirePick>(key: K, value: string) =>
    onChange({ ...pick, [key]: value })

  /** เลือกยางจากคลังแล้ว = ซีเรียลมาจากเส้นจริง ไม่ต้องให้แก้ */
  const serialLocked = pick.stockTireId !== ''

  return (
    <>
      <Field
        label={selectionLabel}
        required
        hint={
          selectionHint ?? (onAddModel
            ? ''
            : '')
        }
      >
        <TireAutocomplete
          pick={pick}
          onChange={onChange}
          options={options}
          emptyText={emptyText}
          onAddModel={onAddModel}
        />
      </Field>

      <Field
        label="ซีรีย์ยาง"
        required
        error={serialError}
        hint={serialLocked ? 'ซีเรียลของยางเส้นที่เลือกจากคลัง' : undefined}
      >
        <Input
          value={pick.serialNo}
          onChange={(e) => set('serialNo', e.target.value)}
          placeholder="111111"
          className="h-14 text-lg"
          readOnly={serialLocked}
        />
      </Field>

      {withTread && (
        <Field label={treadLabel} required>
          <Select value={pick.treadMm} onChange={(e) => set('treadMm', e.target.value)}>
            <option value="">— เลือกดอกยาง —</option>
            {TREAD_OPTIONS.map((mm) => (
              <option key={mm} value={mm}>{mm} มม.</option>
            ))}
          </Select>
        </Field>
      )}
    </>
  )
}
