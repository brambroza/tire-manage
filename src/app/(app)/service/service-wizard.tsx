'use client'

import { VehiclePhotoThumb, VehicleSearch } from '@/components/vehicle-search'
import { vehicleLabel } from '@/lib/vehicle-display'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, ArrowLeft, Bus, Check, ChevronRight, Gauge, MapPin, Truck, X,
} from 'lucide-react'
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { Modal } from '@/components/ui/modal'
import { WheelDiagram, type WheelSlot } from '@/components/wheel-diagram'
import { getLayout, positionLabel, positionNo, type WheelPosition } from '@/lib/axle-layouts'
import { PROVINCES } from '@/lib/provinces'
import {
  cn, formatKm, groupDigits, todayISO,
  ODOMETER_HINT, ODOMETER_INPUT_MAXLENGTH, ODOMETER_MAX,
  PLATE_NUMBER_MAX, PLATE_PATTERN, PLATE_PATTERN_MESSAGE, PLATE_PREFIX_MAX, SERIAL_MAX,
  sanitizeOdometer, sanitizePlateNumber, sanitizePlatePrefix, sanitizeSerial, toUpperText,
} from '@/lib/utils'
import { IMPORT_NOTE_MAX, OTHER_BRAND, isOtherBrand } from '@/lib/tire-import'
import { applyServiceBatchAction, ensureServiceVehicleAction } from './actions'
import type { AxleCategory, AxleType } from '@/lib/database.types'

/* ------------------------------------------------------------------ types */

export interface VehicleLite {
  id: string
  /** null = รถไม่มีทะเบียน (ระบุด้วยชื่อเรียก) */
  plate_no: string | null
  nickname: string | null
  province: string | null
  brand: string | null
  model: string | null
  axle_type: string
  current_mileage: number
  /** signed URL ของรูปรถ (สร้างฝั่ง server) — null = ไม่มีรูป */
  photo_url?: string | null
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
  /** เคยมี event ใส่/ถอดแล้ว — ยางที่ถอดเก็บไม่ใช่ยางใหม่แม้ระยะสะสมเป็น 0 (undefined ก่อน apply migration 015) */
  has_been_mounted?: boolean | null
  vehicle_id: string | null
  position_code: string | null
  plate_no: string | null
  nickname: string | null
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
 * ข้อมูลที่ช่างกรอกของล้อ 1 ตำแหน่ง
 * เก็บแยกรายล้อเพื่อให้เลือกหลายล้อแล้วไล่กรอกทีละล้อ ก่อนบันทึกทั้งชุดพร้อมกัน
 */
interface WheelDraft {
  /** ยางที่ถอดออกจากล้อนี้ */
  unPick: TirePick
  /** สาเหตุที่ถอด */
  reasonId: string
  /** หมายเหตุการถอด (ไม่บังคับ) เช่น สภาพยาง อาการที่พบ */
  note: string
  /** ชนิดยางที่จะใส่กลับ (null = ยังไม่ได้เลือก) */
  mountKind: 'new' | 'used' | null
  /** ยางที่ใส่เข้าล้อนี้ */
  mnPick: TirePick
  /**
   * หมายเหตุยี่ห้อ/รุ่นที่เห็นบนยาง — บังคับเมื่อยางที่ใส่เป็นยี่ห้อ "อื่นๆ"
   * (ยี่ห้อกลางมีรุ่นเดียวต่อขนาด จึงต้องจดของจริงไว้กับรายการแทนการสร้างรุ่นใหม่)
   */
  mountNote: string
}

/** หมายเหตุการถอดยาวได้ไม่เกินกี่ตัวอักษร */
const NOTE_MAX = 200

const EMPTY_DRAFT: WheelDraft = {
  unPick: EMPTY_PICK,
  reasonId: '',
  note: '',
  mountKind: null,
  mnPick: EMPTY_PICK,
  mountNote: '',
}

/**
 * 1 บรรทัดในรายการเลือกยาง
 * catalog = รุ่นที่ super admin กำหนดให้ (ช่างคีย์ซีเรียลเอง)
 * stock   = ยางเส้นจริงที่ว่างอยู่ในคลัง (ระบบเติมซีเรียลและดอกยางให้)
 *           fresh = ยังไม่เคยวิ่ง (เช่น นำเข้าจากไฟล์) / ไม่ fresh = ยางถอดเก็บ
 */
type TireOption =
  | { kind: 'catalog'; id: string; size: string; detail: string; model: TireModelLite }
  | { kind: 'stock'; id: string; size: string; detail: string; tire: TireLite; fresh: boolean }

/** ยางเส้นนี้ว่างอยู่ในคลัง (เลือกไปใส่ได้) */
function isAvailableStock(tire: TireLite): boolean {
  return tire.status === 'in_stock' && tire.vehicle_id === null
}

/** ยางเส้นนี้ยังไม่เคยวิ่งและไม่เคยถูกใส่/ถอด = ยางใหม่ในคลัง (นำเข้าจากไฟล์หรือ super admin เพิ่มให้) */
function isFreshTire(tire: TireLite): boolean {
  return tire.lifetime_km === 0 && !tire.has_been_mounted
}

/**
 * ยางในคลังเส้นนี้เป็นรุ่นเดียวกับรุ่นในแคตตาล็อกหรือไม่ (เทียบขนาด + ยี่ห้อ + รุ่น ไม่สนตัวพิมพ์)
 * view ยางไม่มี tire_model_id จึงต้องเทียบจากชื่อ — ใช้กรองซีรีย์ตามรุ่นที่ช่างเลือกตอนใส่ยาง
 * @param tire ยางในคลัง
 * @param model รุ่นในแคตตาล็อก
 */
function stockMatchesModel(tire: TireLite, model: TireModelLite): boolean {
  return (
    (model.size ?? '').toLowerCase() === (tire.size ?? '').toLowerCase() &&
    model.brand_name.toLowerCase() === (tire.brand_name ?? '').toLowerCase() &&
    model.model_name.toLowerCase() === (tire.model_name ?? '').toLowerCase()
  )
}

/** ป้ายสถานะของยางในคลัง: ใหม่ / เคยใช้พร้อมระยะสะสม */
function StockBadge({ tire }: { tire: TireLite }) {
  return isFreshTire(tire)
    ? <Badge tone="emerald">ใหม่</Badge>
    : <Badge tone="amber">เคยใช้ · วิ่งสะสม {formatKm(tire.lifetime_km)}</Badge>
}

const CATEGORY_LABEL: Record<AxleCategory, string> = { head: 'หัว', trailer: 'หาง', bus: 'บัส' }

/** ลำดับปุ่มหมวดในขั้นเลือกประเภทรถ */
const CATEGORY_ORDER: AxleCategory[] = ['head', 'trailer', 'bus']

/** ตัวเลือกดอกยางในรายการ dropdown (มม.) */
const TREAD_OPTIONS = Array.from({ length: 21 }, (_, i) => i)

/** ข้อความเมื่อแคตตาล็อกของบริษัทว่าง — ช่างเพิ่มรุ่นเองไม่ได้แล้ว ต้องให้ผู้ดูแลระบบเปิดสิทธิ์ */
const CATALOG_EMPTY_TEXT =
  'ยังไม่มีรุ่นยางในแคตตาล็อกของบริษัทนี้ — แจ้งผู้ดูแลระบบให้เปิดสิทธิ์รุ่นยาง'

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
 * เช่น "r150 11r22.5" ค้นเจอ "11R22.5 · R150"
 * @param query คำค้นที่ช่างพิมพ์
 */
function searchTokens(query: string): string[] {
  return query
    .split(/\s+/)
    .map(normalizeSearch)
    .filter((token) => token !== '')
}

/**
 * แปลงรุ่นยางเป็นตัวเลือกในรายการค้นหา เรียงตามขนาดแล้วชื่อรุ่น
 * แสดงเฉพาะขนาดและชื่อรุ่น/ซีรีส์ — ไม่แสดงยี่ห้อหน้างาน
 * @param list รุ่นยางที่จะให้เลือก
 */
function toCatalogOptions(list: TireModelLite[]): TireOption[] {
  return [...list]
    .sort(
      (a, b) =>
        (a.size ?? '').localeCompare(b.size ?? '') ||
        a.brand_name.localeCompare(b.brand_name) ||
        a.model_name.localeCompare(b.model_name),
    )
    .map((model) => ({
      kind: 'catalog' as const,
      id: model.id,
      size: model.size ?? 'ไม่ระบุขนาด',
      // ใส่ยี่ห้อด้วย ไม่งั้นรุ่นชื่อคล้ายกันคนละยี่ห้อ (เช่น "อื่นๆ") ดูเหมือนรายการซ้ำ
      detail: [model.brand_name || null, model.model_name || 'ไม่ระบุรุ่น'].filter(Boolean).join(' '),
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
  /** เปิดกล่องยืนยันก่อนบันทึกจริง — กันช่างกดพลาดแล้วข้อมูลลงระบบ */
  const [confirmOpen, setConfirmOpen] = React.useState(false)
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
  const [newNickname, setNewNickname] = React.useState('')

  const [category, setCategory] = React.useState<AxleCategory | null>(null)
  /** ข้ามขั้นเลือกประเภทรถเพราะรถเดิมเป็นรถบัส — ปุ่มย้อนกลับจากเลขไมล์จะกลับไปหน้าเลือกรถ */
  const [skippedTypeStep, setSkippedTypeStep] = React.useState(false)
  const [axleTypeCode, setAxleTypeCode] = React.useState<string | null>(
    initialVehicle?.axle_type ?? null,
  )
  const [odometer, setOdometer] = React.useState(
    initialVehicle ? String(initialVehicle.current_mileage) : '',
  )

  /** ล้อทั้งหมดที่ช่างเลือกจะเปลี่ยนในชุดนี้ เรียงตามเลขล้อ */
  const [positions, setPositions] = React.useState<string[]>([])
  /** ล้อที่กำลังกรอกอยู่ (ดัชนีใน positions) */
  const [activeIndex, setActiveIndex] = React.useState(0)
  /** ข้อมูลถอด-ใส่ของแต่ละล้อ: position_code -> draft */
  const [drafts, setDrafts] = React.useState<Record<string, WheelDraft>>({})

  /** ซ่อน snackbar เองหลัง 3 วินาที — ช่างไม่ต้องกดปิด */
  React.useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const plateNo = `${platePrefix.trim()}-${plateNumber.trim()}`
  /** กำลังเพิ่มรถใหม่ด้วยชื่อเรียกอย่างเดียว (ไม่มีทะเบียน) */
  const nameOnly = isNewVehicle && platePrefix.trim() === '' && plateNumber.trim() === ''
  /** ป้ายชื่อรถที่กำลังทำงาน — รถเดิม / ทะเบียนที่คีย์ / ชื่อเรียกที่คีย์ */
  const pendingLabel = vehicle ? vehicleLabel(vehicle) : nameOnly ? newNickname.trim() : plateNo
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

  /** ล้อที่กำลังกรอกอยู่ (null = ยังไม่ได้เลือกล้อ) */
  const position = positions[activeIndex] ?? null

  /** ข้อมูลที่กรอกไว้ของล้อนั้น (ยังไม่เคยแตะ = ค่าว่าง) */
  function draftOf(code: string | null): WheelDraft {
    return (code && drafts[code]) || EMPTY_DRAFT
  }

  /** แก้ข้อมูลบางส่วนของล้อหนึ่ง */
  function patchDraft(code: string, partial: Partial<WheelDraft>) {
    setDrafts((prev) => ({ ...prev, [code]: { ...(prev[code] ?? EMPTY_DRAFT), ...partial } }))
  }

  /** ยางที่ระบบบันทึกไว้ในล้อที่ระบุ (ใช้เทียบว่าถอดยางเส้นเดิมหรือเส้นอื่น) */
  function slotTireOf(code: string | null) {
    if (!code) return null
    const slot = slots[code]
    return slot ? tires.find((t) => t.id === slot.tireId) ?? null : null
  }

  /* ฟอร์มของล้อปัจจุบัน — อ่าน/เขียนผ่าน drafts ให้ JSX ใช้ชื่อเดิม */
  const currentDraft = draftOf(position)
  const unPick = currentDraft.unPick
  const reasonId = currentDraft.reasonId
  const unmountNote = currentDraft.note
  const mountKind = currentDraft.mountKind
  const mnPick = currentDraft.mnPick

  const setUnPick = (pick: TirePick) => { if (position) patchDraft(position, { unPick: pick }) }
  const setReasonId = (id: string) => { if (position) patchDraft(position, { reasonId: id }) }
  const setUnmountNote = (note: string) => {
    if (position) patchDraft(position, { note: note.slice(0, NOTE_MAX) })
  }
  const setMnPick = (pick: TirePick) => { if (position) patchDraft(position, { mnPick: pick }) }
  const mountNote = currentDraft.mountNote
  const setMountNote = (note: string) => {
    // หมายเหตุยี่ห้อ/รุ่นบนยาง "อื่นๆ" บังคับตัวพิมพ์ใหญ่ ให้ค้นหา/เทียบกับซีรีย์และยี่ห้อได้
    if (position) patchDraft(position, { mountNote: toUpperText(note).slice(0, IMPORT_NOTE_MAX) })
  }

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
    () => toCatalogOptions(models),
    [models],
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
      const model = models.find((m) => stockMatchesModel(stock, m)) ?? null
      return {
        model,
        size: stock.size ?? '',
        brandName: stock.brand_name ?? '',
        modelName: stock.model_name ?? '',
        newTreadMm: stock.new_tread_mm ?? model?.new_tread_mm ?? null,
      }
    }

    const model = models.find((m) => m.id === pick.modelId) ?? null
    return {
      model,
      size: model?.size ?? '',
      brandName: model?.brand_name ?? '',
      modelName: model?.model_name ?? '',
      newTreadMm: model?.new_tread_mm ?? null,
    }
  }

  /**
   * ชื่อยางแบบสั้นสำหรับกล่องยืนยัน เช่น "11R22.5 · R150"
   * ไม่แสดงยี่ห้อ ให้ตรงกับรายการเลือกยางในขั้นตอนก่อนหน้า
   * @param pick ยางที่ช่างเลือกไว้ในล้อนั้น
   */
  function pickLabel(pick: TirePick): string {
    const spec = pickSpec(pick)
    return [spec.size, spec.modelName].filter(Boolean).join(' · ') || 'ไม่ระบุรุ่น'
  }

  const odometerValid =
    odometer.trim() !== '' && Number(odometer) >= 0 && Number(odometer) <= ODOMETER_MAX

  /**
   * เหตุผลที่ยางที่คีย์ "ถอด" ในล้อนี้ใช้ไม่ได้ (null = ถอดได้)
   * กันคีย์ซีรีย์เดียวกันซ้ำสองล้อในชุดเดียว ซึ่ง server จะ error ทั้งชุด
   */
  function unmountBlockedFor(code: string | null): string | null {
    if (!code) return null
    const serial = draftOf(code).unPick.serialNo.trim().toLowerCase()
    if (serial === '') return null

    const clash = positions.find(
      (other) => other !== code && draftOf(other).unPick.serialNo.trim().toLowerCase() === serial,
    )
    return clash
      ? `ซีรีย์นี้ถูกถอดที่ ${wheelName(clash)} ในชุดนี้แล้ว — ยาง 1 เส้นถอดได้ครั้งเดียว`
      : null
  }

  /** ล้อนี้กรอกขั้น "ถอด" ครบหรือยัง */
  function canSubmitUnmountFor(code: string | null): boolean {
    if (!code) return false
    const d = draftOf(code)
    return (
      d.unPick.serialNo.trim() !== '' &&
      pickSpec(d.unPick).size !== '' &&
      d.unPick.treadMm !== '' &&
      d.reasonId !== '' &&
      !unmountBlockedFor(code)
    )
  }

  /** เหตุผลที่ยางเส้นที่คีย์ใส่ในล้อนี้ใส่ไม่ได้ (null = ใส่ได้) */
  function mountBlockedFor(code: string | null): string | null {
    if (!code) return null
    const d = draftOf(code)
    const serial = d.mnPick.serialNo.trim()
    const candidate = findTire(serial)

    // ยางใหม่ = ซีรีย์ต้องไม่เคยมีในระบบ ยกเว้นยางใหม่ที่นำเข้าไว้ในคลัง (ยังไม่เคยวิ่ง)
    if (d.mountKind === 'new' && candidate && !(isAvailableStock(candidate) && isFreshTire(candidate))) {
      return candidate.status === 'mounted'
        ? `ซีรีย์ ${candidate.serial_no} ติดตั้งอยู่ที่ ${vehicleLabel(candidate, 'รถคันอื่น')} — ต้องถอดออกก่อน`
        : `ซีรีย์ ${candidate.serial_no} มีอยู่ในระบบแล้วและเคยใช้งาน — เลือก “ยางเก่า” แทน หรือตรวจซีรีย์อีกครั้ง`
    }

    // ซีรีย์เดียวกันใส่ได้ล้อเดียวในชุดนี้
    if (serial !== '') {
      const key = serial.toLowerCase()
      const clash = positions.find(
        (other) => other !== code && draftOf(other).mnPick.serialNo.trim().toLowerCase() === key,
      )
      if (clash) {
        return `ซีรีย์นี้ถูกใส่ที่ ${wheelName(clash)} ในชุดนี้แล้ว — ยาง 1 เส้นใส่ได้ล้อเดียว`
      }
    }

    if (!candidate) return null

    // ถ้าเส้นนี้ถูกถอดออกจากล้ออื่นในชุดเดียวกันอยู่แล้ว = สลับตำแหน่งได้
    // (server ถอดทุกเส้นให้เสร็จก่อนแล้วค่อยใส่)
    const key = serial.toLowerCase()
    const unmountedInBatch = positions.some(
      (other) => draftOf(other).unPick.serialNo.trim().toLowerCase() === key,
    )
    if (unmountedInBatch) return null

    // ยางเก่า: ซ้ำได้เฉพาะกรณีซีรีย์นั้นยังติดตั้งอยู่ที่ล้อนี้อยู่แล้ว
    if (candidate.status === 'mounted' && candidate.id !== slotTireOf(code)?.id) {
      return `ซีรีย์ ${candidate.serial_no} ติดตั้งอยู่ที่ ${vehicleLabel(candidate, 'รถคันอื่น')} — ต้องถอดออกก่อน`
    }
    return null
  }

  /** ยางที่จะใส่ในล้อนี้เป็นยี่ห้อ "อื่นๆ" หรือไม่ → ต้องจดยี่ห้อ/รุ่นจริงไว้ */
  function mountNeedsOtherNote(code: string | null): boolean {
    if (!code) return false
    return isOtherBrand(pickSpec(draftOf(code).mnPick).brandName)
  }

  /** ล้อนี้กรอกขั้น "ใส่" ครบหรือยัง */
  function canSubmitMountFor(code: string | null): boolean {
    if (!code) return false
    const d = draftOf(code)
    return (
      d.mnPick.serialNo.trim() !== '' &&
      pickSpec(d.mnPick).size !== '' &&
      !mountBlockedFor(code) &&
      (d.mountKind === 'new' || d.mnPick.treadMm !== '') &&
      (!mountNeedsOtherNote(code) || d.mountNote.trim() !== '')
    )
  }

  /** ล้อนี้กรอกครบทั้งถอดและใส่ พร้อมบันทึกแล้ว */
  function isDraftComplete(code: string): boolean {
    return canSubmitUnmountFor(code) && canSubmitMountFor(code)
  }

  const unmountBlocked = unmountBlockedFor(position)
  const canSubmitUnmount = canSubmitUnmountFor(position)
  const mountBlocked = mountBlockedFor(position)
  const canSubmitMount = canSubmitMountFor(position)

  /** ล้อในชุดนี้ที่ยังกรอกไม่ครบ — ใช้บล็อกปุ่มบันทึกและแจ้งเตือนสีแดง */
  const incompletePositions = positions.filter((code) => !isDraftComplete(code))
  /** ล้ออื่นที่ยังกรอกไม่ครบ — ไม่นับล้อที่กำลังกรอกอยู่ จะได้ไม่เตือนตอนพิมพ์ยังไม่จบ */
  const otherIncompletePositions = incompletePositions.filter((code) => code !== position)
  /** ล้อที่กรอกครบแล้ว ใช้ติ๊กถูกบนผังล้อ */
  const donePositions = positions.filter((code) => isDraftComplete(code))
  const isLastWheel = activeIndex >= positions.length - 1
  /** อยู่ในขั้นกรอกข้อมูลของล้อใดล้อหนึ่ง (ไม่ใช่ขั้นเลือกตำแหน่ง) */
  const inWheelForm = step === 'unmount' || step === 'mount-kind' || step === 'mount'

  /* ------------------------------------------------------------- actions */

  /**
   * ชื่อประเภทรถของรถคันนั้น เช่น "บัส · รถบัส 8 ล้อ 2 ชั้น (...)" ใช้แสดงตอนค้นหา/เลือกรถ
   * @param target รถที่ต้องการ
   */
  function describeVehicleType(target: Pick<VehicleLite, 'axle_type'>): string {
    const type = axleTypes.find((t) => t.code === target.axle_type)
    const typeLayout = getLayout(target.axle_type, axleTypes)
    const name = type?.name ?? typeLayout.name
    return [type ? CATEGORY_LABEL[type.category] : null, name, `${typeLayout.wheelCount} ล้อ`]
      .filter(Boolean)
      .join(' · ')
  }

  function chooseVehicle(selected: VehicleLite) {
    setError(null)
    const plate = selected.plate_no ?? ''
    const separator = plate.indexOf('-')
    setPlatePrefix(separator < 0 ? plate : plate.slice(0, separator))
    setPlateNumber(separator < 0 ? '' : plate.slice(separator + 1))
    setVehicle(selected)
    setProvince(selected.province ?? PROVINCES[0])
    setIsNewVehicle(false)
    setNewNickname('')
    setOdometer('')

    // รถบัสมีแบบรถตายตัวอยู่แล้ว — ใช้แบบเดิม ข้ามขั้นเลือกประเภทไปกรอกเลขไมล์เลย
    const currentType = axleTypes.find((t) => t.code === selected.axle_type)
    if (currentType?.category === 'bus') {
      setCategory('bus')
      setAxleTypeCode(selected.axle_type)
      setSkippedTypeStep(true)
      setStep('odometer')
      return
    }

    setSkippedTypeStep(false)
    setCategory(null)
    setAxleTypeCode(null)
    setStep('category')
  }

  /** ยืนยันทะเบียน — หาในระบบก่อน ถ้าไม่พบให้เตรียมสร้างรถใหม่ */
  function submitPlate() {
    setError(null)
    if (platePrefix.trim() === '' || plateNumber.trim() === '') {
      setError('กรุณาใส่ทะเบียนรถให้ครบทั้งสองช่อง')
      return
    }
    if (!PLATE_PATTERN.test(plateNo)) {
      setError(PLATE_PATTERN_MESSAGE)
      return
    }

    const key = plateNo.toLowerCase()
    const candidates = vehicles.filter((v) =>
      v.plate_no?.replace(/[\s-]/g, '').toLowerCase() === key.replace(/-/g, ''))
    if (candidates.length > 1) {
      setError('พบทะเบียนนี้หลายจังหวัด กรุณาค้นหาและเลือกรถจากรายการด้านบน')
      return
    }
    const found = candidates[0] ?? null
    if (found) {
      chooseVehicle(found)
      return
    }

    setVehicle(found)
    setIsNewVehicle(!found)
    setSkippedTypeStep(false)
    // รถใหม่เริ่มเลือกประเภทและเลขไมล์ใหม่ทุกครั้ง
    setOdometer('')
    setCategory(null)
    setAxleTypeCode(null)
    setStep('category')
  }

  /** เพิ่มรถที่ไม่มีทะเบียนด้วยชื่อเรียก — ถ้ามีรถไม่มีทะเบียนชื่อเดียวกันอยู่แล้วให้เลือกคันนั้นแทน */
  function submitNickname() {
    setError(null)
    const name = newNickname.trim()
    if (name === '') {
      setError('กรุณากรอกชื่อเรียกรถ')
      return
    }
    const existing = vehicles.find((v) =>
      !v.plate_no && (v.nickname ?? '').trim().toLowerCase() === name.toLowerCase())
    if (existing) {
      chooseVehicle(existing)
      return
    }

    setPlatePrefix('')
    setPlateNumber('')
    setNewNickname(name)
    setVehicle(null)
    setIsNewVehicle(true)
    setSkippedTypeStep(false)
    setOdometer('')
    setCategory(null)
    setAxleTypeCode(null)
    setStep('category')
  }

  /** เลือกแบบรถแล้วผูกกับทะเบียนหรือชื่อเรียก (สร้างรถใหม่ให้ถ้ายังไม่มีในระบบ) */
  async function selectAxleType(code: string) {
    setError(null)
    setSaving(true)
    const result = await ensureServiceVehicleAction({
      vehicle_id: vehicle?.id,
      plate_no: vehicle ? vehicle.plate_no : nameOnly ? null : plateNo,
      nickname: isNewVehicle ? newNickname : undefined,
      province: vehicle ? vehicle.province : nameOnly ? null : province,
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
      nickname: data.nickname,
      province: data.province,
      brand: null,
      model: null,
      axle_type: data.axle_type,
      current_mileage: data.current_mileage,
      // รถเดิมคงรูปไว้ · รถที่เพิ่งสร้างยังไม่มีรูป
      photo_url: vehicle?.id === data.id ? vehicle.photo_url ?? null : null,
    })
    setIsNewVehicle(false)
    setStep('odometer')
    router.refresh()
  }

  /** แตะล้อบนผัง → เลือก/ยกเลิกล้อนั้นในชุดที่จะเปลี่ยน */
  function togglePosition(pos: WheelPosition) {
    setError(null)

    setPositions((prev) =>
      prev.includes(pos.code)
        ? prev.filter((code) => code !== pos.code)
        : [...prev, pos.code].sort(
            (a, b) =>
              (positionNo(a, axleTypeCode, axleTypes) ?? 0) -
              (positionNo(b, axleTypeCode, axleTypes) ?? 0),
          ),
    )

    // ยกเลิกล้อไหน ทิ้งข้อมูลที่กรอกไว้ของล้อนั้นด้วย
    setDrafts((prev) => {
      if (!prev[pos.code]) return prev
      const next = { ...prev }
      delete next[pos.code]
      return next
    })
  }

  /** ยืนยันชุดล้อที่เลือก แล้วเริ่มกรอกจากล้อแรก */
  function startWheels() {
    if (positions.length === 0) return
    setError(null)
    // ล้อที่ระบบบันทึกว่ามียางติดอยู่ → ตั้งค่าถอดเป็นยางเส้นนั้นให้เลย (เฉพาะล้อที่ยังไม่ได้กรอก)
    // ดอกยางเว้นว่างไว้ให้ช่างวัดจริงตอนถอด เพราะค่าที่บันทึกไว้เป็นของตอนใส่
    setDrafts((prev) => {
      const next = { ...prev }
      for (const code of positions) {
        if (next[code]) continue
        const mounted = slotTireOf(code)
        if (!mounted) continue
        next[code] = {
          ...EMPTY_DRAFT,
          unPick: { modelId: '', stockTireId: mounted.id, serialNo: mounted.serial_no, treadMm: '' },
        }
      }
      return next
    })
    setActiveIndex(0)
    setStep('unmount')
  }

  /** กระโดดไปกรอกล้อลำดับที่ระบุ (ใช้กับแถบชิปด้านบน) */
  function goToWheel(index: number) {
    if (index < 0 || index >= positions.length) return
    setError(null)
    setActiveIndex(index)
    setStep('unmount')
  }

  /** ไปกรอกล้อถัดไปในชุด */
  function goNextWheel() {
    setError(null)
    setActiveIndex((i) => Math.min(i + 1, positions.length - 1))
    setStep('unmount')
  }

  /** เลือกชนิดยางที่จะใส่ แล้วเตรียมค่าตั้งต้นของฟอร์มใส่ยาง */
  function selectMountKind(kind: 'new' | 'used') {
    if (!position) return
    const current = draftOf(position)
    // เลือกชนิดเดิมซ้ำ (เช่น ย้อนกลับมาดู) ไม่ต้องล้างสิ่งที่กรอกไว้
    patchDraft(position, {
      mountKind: kind,
      mnPick: current.mountKind === kind ? current.mnPick : EMPTY_PICK,
    })
    setStep('mount')
  }

  /** สร้างรายการถอด+ใส่ของทุกล้อในชุด (2 บรรทัดต่อ 1 ล้อ) */
  function buildItems() {
    return positions.flatMap((code) => {
      const d = draftOf(code)
      const unSpecOf = pickSpec(d.unPick)
      const mnSpecOf = pickSpec(d.mnPick)

      const unTire = findTire(d.unPick.serialNo)
      const unIsKnown = Boolean(unTire) && unTire!.id === slotTireOf(code)?.id

      const unmountItem = {
        kind: unIsKnown ? ('unmount' as const) : ('manual_unmount' as const),
        tire_id: unIsKnown ? unTire!.id : null,
        position_code: code,
        tread_mm: Number(d.unPick.treadMm),
        reason_id: d.reasonId,
        note: d.note.trim() || null,
        manual: unIsKnown
          ? null
          : {
              serial_no: d.unPick.serialNo.trim(),
              tire_model_id: unSpecOf.model?.id ?? null,
              brand_name: unSpecOf.brandName || null,
              model_name: unSpecOf.modelName || null,
              size: unSpecOf.size || null,
              dot: null,
              new_tread_mm: unSpecOf.newTreadMm,
              mounted_odometer: null,
            },
      }

      // ยางใหม่ยังไม่มีดอกยางวัดจริง → ใช้ดอกยางตอนใหม่จากแคตตาล็อก
      const mountTread =
        d.mountKind === 'used' ? Number(d.mnPick.treadMm) : mnSpecOf.newTreadMm ?? null

      const mountCandidate = findTire(d.mnPick.serialNo)
      // ยี่ห้อ "อื่นๆ" → เก็บยี่ห้อ/รุ่นจริงที่เห็นบนยางไว้กับรายการใส่ (และกับยางเส้นใหม่)
      const mountNoteText = isOtherBrand(mnSpecOf.brandName) ? d.mountNote.trim() || null : null

      const mountItem = {
        kind: mountCandidate ? ('mount' as const) : ('manual_mount' as const),
        tire_id: mountCandidate?.id ?? null,
        position_code: code,
        tread_mm: mountTread,
        reason_id: null,
        note: mountNoteText,
        // บอก server ว่าเป็นยางใหม่ที่ยังไม่มีในระบบ เพื่อบังคับกฎแคตตาล็อก + ซีรีย์ห้ามซ้ำอีกชั้น
        // (ยางใหม่ที่นำเข้าไว้ในคลังแล้วถือเป็นเส้นเดิมในระบบ จึงส่งเป็น mount ธรรมดา)
        new_tire: d.mountKind === 'new' && !mountCandidate,
        manual: mountCandidate
          ? null
          : {
              serial_no: d.mnPick.serialNo.trim(),
              tire_model_id: mnSpecOf.model?.id ?? null,
              brand_name: mnSpecOf.brandName || null,
              model_name: mnSpecOf.modelName || null,
              size: mnSpecOf.size || null,
              dot: null,
              new_tread_mm: mnSpecOf.newTreadMm,
              mounted_odometer: null,
              note: mountNoteText,
            },
      }

      return [unmountItem, mountItem]
    })
  }

  /** กดปุ่มบันทึก — เปิดกล่องสรุปให้ยืนยันก่อน ยังไม่ยิงเข้าระบบ */
  function handleSave() {
    if (!vehicle || positions.length === 0 || incompletePositions.length > 0) return
    setError(null)
    setConfirmOpen(true)
  }

  /** บันทึกทุกล้อในชุด (ถอด + ใส่) ในทรานแซกชันเดียว — เรียกหลังช่างกดยืนยัน */
  async function confirmSave() {
    if (!vehicle || positions.length === 0 || incompletePositions.length > 0) return
    setSaving(true)
    setError(null)

    const wheelCount = positions.length
    const result = await applyServiceBatchAction({
      vehicle_id: vehicle.id,
      odometer: Number(odometer),
      event_date: todayISO(),
      items: buildItems(),
    })

    setSaving(false)
    if (!result.ok) {
      setConfirmOpen(false)
      setError(result.error)
      return
    }

    // บันทึกแล้วกลับไปเริ่มรถคันใหม่ทันที — ไม่มีทางเลือกทำต่อรถคันเดิม
    setConfirmOpen(false)
    startOver()
    setToast(`บันทึกเรียบร้อย ${wheelCount} ล้อ`)
    router.refresh()
  }

  /** เคลียร์ทั้งหน้าจอ เริ่มรถคันใหม่ */
  function startOver() {
    setPlatePrefix('')
    setPlateNumber('')
    setVehicle(null)
    setNewNickname('')
    setIsNewVehicle(false)
    setCategory(null)
    setAxleTypeCode(null)
    setOdometer('')
    setPositions([])
    setActiveIndex(0)
    setDrafts({})
    setError(null)
    setStep('plate')
  }

  /** ปุ่มย้อนกลับของแต่ละขั้น */
  function goBack() {
    setError(null)

    // ถอยจากล้อแรกของชุด = กลับไปแก้ชุดล้อที่เลือก, ล้อถัด ๆ ไป = กลับไปหน้าใส่ยางของล้อก่อนหน้า
    if (step === 'unmount') {
      if (activeIndex > 0) {
        setActiveIndex(activeIndex - 1)
        setStep('mount')
      } else {
        setStep('wheel')
      }
      return
    }

    const back: Partial<Record<Step, Step>> = {
      category: 'plate',
      axle: 'category',
      odometer: 'axle',
      wheel: 'odometer',
      'mount-kind': 'unmount',
      mount: 'mount-kind',
    }
    const target = step === 'odometer' && skippedTypeStep ? 'plate' : back[step]
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
              {vehicle?.photo_url
                ? <VehiclePhotoThumb src={vehicle.photo_url} size="xs" />
                : <Truck className="size-5 shrink-0 text-brand-500" />}
              <span className="truncate">
                {pendingLabel || 'ยังไม่ได้เลือกรถ'}
              </span>
            </p>
            <p className="truncate text-sm text-ink-500">
              {[
                STEP_TITLE[step],
                axleType?.name,
                odometerValid ? formatKm(Number(odometer)) : null,
                inWheelForm && position ? wheelName(position) : null,
                inWheelForm && positions.length > 1
                  ? `ล้อที่ ${activeIndex + 1}/${positions.length}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {/* ชิปล้อทั้งชุด — เห็นความคืบหน้าและกดข้ามไปแก้ล้อไหนก็ได้ */}
        {inWheelForm && positions.length > 1 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {positions.map((code, index) => {
              const done = isDraftComplete(code)
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => goToWheel(index)}
                  className={cn(
                    'flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                    index === activeIndex
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : done
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-rose-300 bg-rose-50 text-rose-700',
                  )}
                >
                  {done && index !== activeIndex && <Check className="size-3.5" strokeWidth={3} />}
                  ล้อ {positionNo(code, axleTypeCode, axleTypes) ?? index + 1}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* --------------------------------------------- ขั้นที่ 1: ทะเบียน */}
      {step === 'plate' && (
        <StepCard title="เลือกรถ" description="ค้นหาชื่อเรียกหรือทะเบียน · กรอกทะเบียนเพื่อเพิ่มรถใหม่ · รถไม่มีทะเบียนเพิ่มด้วยชื่อเรียก">
          <VehicleSearch
            vehicles={vehicles}
            onSelect={chooseVehicle}
            describe={describeVehicleType}
            photoOf={(v) => v.photo_url ?? null}
          />
          <p className="text-sm text-ink-500">หรือกรอกทะเบียนรถ</p>
          <div className="flex items-center gap-2">
            <Input
              ref={platePrefixRef}
              value={platePrefix}
              onChange={(e) => {
                // รับเฉพาะพยัญชนะไทย/ตัวเลข 2 ตัว แล้วดีดไปช่องหลังทันที — ช่างคีย์รวดเดียวไม่ต้องแตะจอ
                const value = sanitizePlatePrefix(e.target.value)
                setPlatePrefix(value)
                if (value.length === PLATE_PREFIX_MAX) plateNumberRef.current?.focus()
              }}
              placeholder="70"
              maxLength={PLATE_PREFIX_MAX}
              autoFocus
              className="h-16 text-center text-2xl font-semibold"
              aria-label="ทะเบียนส่วนหน้า"
            />
            <span className="text-2xl font-semibold text-ink-400">-</span>
            <Input
              ref={plateNumberRef}
              value={plateNumber}
              onChange={(e) => setPlateNumber(sanitizePlateNumber(e.target.value))}
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
              maxLength={PLATE_NUMBER_MAX}
              className="h-16 text-center text-2xl font-semibold"
              aria-label="ทะเบียนส่วนหลัง"
            />
          </div>

          <PrimaryButton onClick={submitPlate}>ตกลง</PrimaryButton>

          <div className="space-y-2 rounded-xl border border-dashed border-line p-3">
            <p className="text-sm text-ink-500">รถไม่มีทะเบียน? กรอกชื่อเรียกแทน (ต้องไม่ซ้ำกับรถไม่มีทะเบียนคันอื่น)</p>
            <div className="flex gap-2">
              <Input aria-label="ชื่อเรียกรถที่ไม่มีทะเบียน" value={newNickname}
                onChange={(event) => setNewNickname(event.target.value)} maxLength={100}
                placeholder="เช่น 32-002-BFn" className="flex-1" />
              <Button type="button" variant="secondary" onClick={submitNickname}>เพิ่มด้วยชื่อเรียก</Button>
            </div>
          </div>
        </StepCard>
      )}

      {/* ------------------------------------------ ขั้นที่ 2: ประเภทรถ */}
      {step === 'category' && (
        <StepCard
          title="เลือกประเภทรถ"
          description={
            isNewVehicle
              ? nameOnly
                ? `ชื่อเรียก ${newNickname.trim()} ยังไม่มีในระบบ — ระบบจะสร้างรถคันนี้ให้ (ไม่มีทะเบียน)`
                : `ทะเบียน ${plateNo} ยังไม่มีในระบบ — ระบบจะสร้างรถคันนี้ให้`
              : vehicleLabel(vehicle)
          }
        >
          {vehicle && !isNewVehicle && (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
              <VehiclePhotoThumb src={vehicle.photo_url} />
              <div className="min-w-0">
                <p className="text-xs text-ink-400">ประเภทรถที่บันทึกไว้</p>
                <p className="text-[15px] font-medium text-ink-900">{describeVehicleType(vehicle)}</p>
              </div>
            </div>
          )}
          {isNewVehicle && !nameOnly && (
            <Field label="ชื่อเรียกรถ" hint="ไม่บังคับ · ใช้ค้นหารถครั้งต่อไปได้">
              <Input aria-label="ชื่อเรียกรถ" value={newNickname}
                onChange={(event) => setNewNickname(event.target.value)} maxLength={100}
                placeholder="เช่น 32-002-BFn" />
            </Field>
          )}
          {isNewVehicle && !nameOnly && (
            <Field label="จังหวัดของทะเบียน" required>
              <Select value={province} onChange={(e) => setProvince(e.target.value)}>
                {PROVINCES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid grid-cols-3 gap-3">
            {CATEGORY_ORDER.map((value) => (
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
                {value === 'bus' ? <Bus className="size-7" /> : <Truck className="size-7" />}
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
        <StepCard title="ใส่เลขไมล์" description={`เลขไมล์ปัจจุบันของ ${pendingLabel}`}>
          <Field
            label="เลขไมล์ (กม.)"
            required
            hint={
              vehicle && !isNewVehicle
                ? `ไมล์ล่าสุดในระบบ ${formatKm(vehicle.current_mileage)} · ${ODOMETER_HINT}`
                : ODOMETER_HINT
            }
          >
            <div className="relative">
              <Gauge className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-400" />
              <Input
                type="text"
                inputMode="numeric"
                // โชว์คั่นหลักพันให้อ่านง่ายหน้างาน แต่เก็บเป็นตัวเลขล้วนใน state (ไม่เกิน ODOMETER_DIGITS หลัก)
                // maxLength นับตัวคั่นหลักพันด้วย จึงใช้ค่าที่คำนวณไว้ใน utils
                value={groupDigits(odometer)}
                onChange={(e) => setOdometer(sanitizeOdometer(e.target.value))}
                maxLength={ODOMETER_INPUT_MAXLENGTH}
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
          description={`${layout.name} · แตะล้อที่จะเปลี่ยนยาง เลือกได้หลายล้อในครั้งเดียว`}
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
            // ไม่โชว์ยางเดิมบนผัง — ทุกล้อว่างเสมอ ช่างเลือกแล้วคีย์ใหม่
            slots={{}}
            selectedCodes={positions}
            doneCodes={donePositions}
            onSelect={togglePosition}
            mode="unmount"
            allowEmpty
          />

          <p className="text-center text-sm text-ink-500">
            {positions.length === 0
              ? 'แตะล้อที่จะเปลี่ยนยาง — แตะซ้ำเพื่อยกเลิก'
              : `เลือกไว้ ${positions.length} ล้อ: ${positions
                  .map((code) => positionNo(code, axleTypeCode, axleTypes) ?? '?')
                  .join(', ')}`}
          </p>

          <PrimaryButton disabled={positions.length === 0} onClick={startWheels}>
            ถัดไป{positions.length > 0 ? ` (${positions.length} ล้อ)` : ''}
          </PrimaryButton>
        </StepCard>
      )}

      {/* ------------------------------------------- ขั้นที่ 6: ถอดยาง */}
      {step === 'unmount' && (
        <StepCard title="ถอดยาง" description={wheelName(position)}>
          <TirePickFields
            // สลับล้อผ่านแถบชิปโดยไม่เปลี่ยนขั้น — ต้อง remount เพื่อล้างคำค้นของล้อก่อนหน้า
            key={position ?? 'none'}
            pick={unPick}
            onChange={setUnPick}
            options={catalogOptions}
            emptyText={CATALOG_EMPTY_TEXT}
            withTread
            treadLabel="ดอกยางเหลือ (มม.)"
            serialError={unmountBlocked ?? undefined}
            knownTire={slotTireOf(position)}
            treadHint={
              unPick.stockTireId && unPick.stockTireId === slotTireOf(position)?.id
                ? `วัดดอกยางตอนถอด${slotTireOf(position)?.tread_mm != null ? ` · บันทึกครั้งก่อน ${slotTireOf(position)?.tread_mm} มม.` : ''}`
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

          <Field label="หมายเหตุการถอด" hint={`ไม่บังคับ · ${unmountNote.length}/${NOTE_MAX} ตัวอักษร`}>
            <Textarea
              value={unmountNote}
              onChange={(e) => setUnmountNote(e.target.value)}
              maxLength={NOTE_MAX}
              placeholder="เช่น ยางบวมด้านข้าง, ดอกยางสึกไม่เท่ากัน"
              className="min-h-20"
            />
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
        <StepCard title="ใส่ยาง" description={`${wheelName(position)} เลือกยางที่จะใส่`}>
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
          {/* เลือกยี่ห้อ/รุ่นก่อน แล้วระบบกรองซีรีย์ในคลังของรุ่นนั้นให้เลือก (หรือคีย์ซีรีย์ใหม่) */}
          <MountPickFields
            key={position ?? 'none'}
            pick={mnPick}
            onChange={setMnPick}
            mountKind={mountKind === 'used' ? 'used' : 'new'}
            models={models}
            catalogOptions={catalogOptions}
            tires={tires}
            serialError={mountBlocked ?? undefined}
            mountedText={(tire) =>
              `ติดอยู่ที่ ${vehicleLabel(tire, 'รถคันอื่น')} ${positionLabel(tire.position_code, null, axleTypes)} — ต้องถอดก่อน`
            }
          />

          {/* ยี่ห้อ "อื่นๆ" ไม่มีรุ่นจริงในแคตตาล็อก → ต้องจดยี่ห้อ/รุ่นที่พิมพ์บนยางไว้กับรายการนี้ */}
          {mountNeedsOtherNote(position) && (
            <Field
              label="หมายเหตุยี่ห้อ/รุ่นที่เห็นบนยาง"
              required
              error={
                mountNote.trim() === ''
                  ? `ยี่ห้อ “${OTHER_BRAND}” ต้องระบุยี่ห้อ/รุ่นที่พิมพ์อยู่บนยาง ก่อนไปล้อถัดไปหรือบันทึก`
                  : undefined
              }
              hint={`${mountNote.length}/${IMPORT_NOTE_MAX} ตัวอักษร`}
            >
              <Textarea
                value={mountNote}
                onChange={(e) => setMountNote(e.target.value)}
                maxLength={IMPORT_NOTE_MAX}
                placeholder="เช่น DOUBLE COIN RR202"
                autoCapitalize="characters"
                className="min-h-20 uppercase"
              />
            </Field>
          )}

          {/* ล้อสุดท้ายแล้วแต่ล้ออื่นยังกรอกไม่ครบ — เตือนสีแดงและห้ามบันทึก */}
          {isLastWheel && otherIncompletePositions.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                ต้องกรอกข้อมูลให้ครบทุกล้อที่เลือกก่อนบันทึก — ยังขาด{' '}
                {otherIncompletePositions.map((code) => wheelName(code)).join(', ')}
              </span>
            </div>
          )}

          {isLastWheel ? (
            <PrimaryButton
              disabled={!canSubmitMount || incompletePositions.length > 0}
              loading={saving}
              onClick={handleSave}
            >
              <Check className="size-5" />
              บันทึก{positions.length > 1 ? `ทั้งหมด (${positions.length} ล้อ)` : ''}
            </PrimaryButton>
          ) : (
            <PrimaryButton disabled={!canSubmitMount} onClick={goNextWheel}>
              ล้อถัดไป ({activeIndex + 2}/{positions.length})
              <ChevronRight className="size-5" />
            </PrimaryButton>
          )}
        </StepCard>
      )}

      {isNewVehicle && step === 'category' && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-400">
          <MapPin className="size-3.5" />
          {nameOnly ? 'รถใหม่จะถูกบันทึกเข้าระบบด้วยชื่อเรียก (ไม่มีทะเบียน) แอดมินเพิ่มทะเบียนภายหลังได้' : 'รถใหม่จะถูกบันทึกเข้าระบบด้วยทะเบียนและจังหวัดที่เลือก'}
        </p>
      )}

      {/* กล่องสรุปก่อนบันทึก — ทวนทะเบียน เลขไมล์ และยางทุกล้อให้ช่างตรวจอีกรอบ */}
      <Modal
        open={confirmOpen}
        onClose={() => { if (!saving) setConfirmOpen(false) }}
        title="ยืนยันการบันทึก"
        description={`${pendingLabel} · เลขไมล์ ${formatKm(Number(odometer) || 0)}`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={saving}
              className="h-12 rounded-xl border border-line bg-white px-5 text-[15px] font-medium text-ink-700 hover:bg-brand-50 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <Button className="h-12 px-5" loading={saving} onClick={confirmSave}>
              <Check className="size-5" />
              ยืนยันบันทึก
            </Button>
          </>
        }
      >
        <ul className="space-y-2.5">
          {positions.map((code) => {
            const d = drafts[code] ?? EMPTY_DRAFT
            return (
              <li key={code} className="rounded-xl bg-surface-alt px-4 py-3 ring-1 ring-inset ring-line">
                <p className="text-[15px] font-semibold text-ink-900">{wheelName(code)}</p>
                <p className="mt-1 text-sm text-ink-600">
                  ถอด {pickLabel(d.unPick)} · ซีรีย์ {d.unPick.serialNo || '-'}
                </p>
                {d.note.trim() !== '' && (
                  <p className="mt-0.5 text-sm text-ink-500">หมายเหตุ: {d.note.trim()}</p>
                )}
                <p className="mt-0.5 text-sm text-ink-600">
                  ใส่ {pickLabel(d.mnPick)} · ซีรีย์ {d.mnPick.serialNo || '-'}
                  {d.mountKind === 'new' ? ' (ยางใหม่)' : d.mountKind === 'used' ? ' (ยางเก่า)' : ''}
                </p>
                {isOtherBrand(pickSpec(d.mnPick).brandName) && d.mountNote.trim() !== '' && (
                  <p className="mt-0.5 text-sm text-ink-500">ยี่ห้อ/รุ่นบนยาง: {d.mountNote.trim()}</p>
                )}
              </li>
            )
          })}
        </ul>
        <p className="mt-4 text-sm text-ink-500">
          บันทึกแล้วแก้ไขเองไม่ได้ ตรวจให้ครบก่อนกดยืนยัน
        </p>
      </Modal>

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
 * เลือกได้เฉพาะรายการที่ super admin เปิดสิทธิ์ให้บริษัท (หรือยางว่างในคลัง)
 * ช่างเพิ่มรุ่นใหม่จากหน้างานไม่ได้ เพื่อกันข้อมูลแคตตาล็อกปนกับคำค้นดิบ
 */
function TireAutocomplete({
  pick,
  onChange,
  options,
  emptyText,
  fallbackLabel,
  stockOnlyUntilSearch,
  selectBy = 'any',
  trailing,
}: {
  pick: TirePick
  onChange: (pick: TirePick) => void
  options: TireOption[]
  /** ข้อความเมื่อไม่มีตัวเลือกให้เลือกเลย */
  emptyText: string
  /** ชื่อยางที่เลือกไว้แต่ไม่อยู่ใน options (เช่น หยิบจากคลังผ่านช่องซีรีย์) */
  fallbackLabel?: string
  /**
   * true = ยังไม่พิมพ์ค้นหา โชว์เฉพาะยางในคลัง (ถ้ามี) — รุ่นจากแคตตาล็อกขึ้นเมื่อพิมพ์ค้นหาเท่านั้น
   * ใช้ตอนใส่ยางใหม่ ไม่ให้รายการแคตตาล็อกกลบยางใหม่ที่นำเข้าไว้
   */
  stockOnlyUntilSearch?: boolean
  /**
   * 'model' = ช่องนี้เลือกเฉพาะรุ่น ใช้ modelId เป็นรายการที่เลือกเสมอ
   * (แม้จะหยิบซีรีย์จากคลังไว้แล้ว รุ่นที่เลือกต้องยังโชว์อยู่) — ค่าเริ่มต้น 'any' = คลังก่อน รุ่นทีหลัง
   */
  selectBy?: 'any' | 'model'
  /** ส่วนท้ายของแต่ละรายการ เช่น ป้ายจำนวนยางในคลังของรุ่นนั้น */
  trailing?: (option: TireOption) => React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  /** true ระหว่างนิ้ว/เมาส์กดค้างอยู่ในรายการ — กัน blur ปิดรายการก่อนคลิกทำงาน (Safari) */
  const pressingRef = React.useRef(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // โหมดรุ่น: รุ่นที่เลือกมาก่อน — ถ้าหยิบเส้นในคลังที่ไม่ตรงรุ่นใด ให้โชว์สเปกของเส้นนั้นผ่าน fallbackLabel แทน
  const selectedId = selectBy === 'model' ? pick.modelId || pick.stockTireId : pick.stockTireId || pick.modelId
  const selected = options.find((o) => o.id === selectedId) ?? null
  /** มีรายการที่เลือกไว้ (ในหรือนอก options) → โชว์ปุ่มล้าง */
  const hasSelection = Boolean(selected) || (Boolean(selectedId) && Boolean(fallbackLabel))

  // เลือกแล้วโชว์ชื่อเต็มของรายการ ยังไม่เลือกก็โชว์คำค้นที่กำลังพิมพ์
  const text = selected
    ? `${selected.size} · ${selected.detail}`
    : selectedId && fallbackLabel
      ? fallbackLabel
      : query

  /** ยังไม่พิมพ์ค้นหาและมียางในคลัง → ซ่อนแคตตาล็อกไว้ก่อน */
  const stockOptionsOnly = React.useMemo(() => options.filter((o) => o.kind === 'stock'), [options])
  const hideCatalog =
    Boolean(stockOnlyUntilSearch) &&
    query.trim() === '' &&
    stockOptionsOnly.length > 0 &&
    // เลือกรุ่นจากแคตตาล็อกไว้แล้ว ต้องเห็นรายการนั้นตอนเปิดใหม่
    selected?.kind !== 'catalog'
  const hiddenCatalogCount = hideCatalog ? options.length - stockOptionsOnly.length : 0

  const matches = React.useMemo(() => {
    if (hideCatalog) return stockOptionsOnly.slice(0, 50)
    if (selected) return options.slice(0, 50)
    const tokens = searchTokens(query)
    if (tokens.length === 0) return options.slice(0, 50)
    return options
      .filter((o) => {
        const hay = normalizeSearch(`${o.size} ${o.detail}`)
        return tokens.every((t) => hay.includes(t))
      })
      .slice(0, 50)
  }, [options, query, selected, hideCatalog, stockOptionsOnly])

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
      onChange({
        ...pick,
        modelId: option.id,
        stockTireId: '',
        // เปลี่ยนจากเส้นในคลังมาเป็นรุ่น — ซีรีย์/ดอกยางของเส้นเดิมต้องไม่ค้าง
        ...(pick.stockTireId ? { serialNo: '', treadMm: '' } : {}),
      })
    }
    setQuery('')
    setOpen(false)
  }

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
          if (e.key === 'Escape') setOpen(false)
          // Enter ไม่ทำอะไร — ต้องแตะเลือกจากรายการเท่านั้น (เพิ่มรุ่นใหม่จากหน้างานไม่ได้แล้ว)
          if (e.key === 'Enter') e.preventDefault()
        }}
        placeholder="พิมพ์ค้นหา เช่น 11R22.5"
        maxLength={40}
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        className={cn('h-14 text-lg', hasSelection && 'pr-12')}
      />

      {hasSelection && (
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
              หรือเลือกยี่ห้อ “อื่นๆ” ตามขนาดยาง
            </p>
          )}

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
                  {option.kind === 'stock' && <StockBadge tire={option.tire} />}
                </span>
                <span className="block truncate text-sm text-ink-500">{option.detail}</span>
              </span>
              {trailing?.(option)}
              {option.id === selectedId && <Check className="size-5 shrink-0 text-brand-600" />}
            </button>
          ))}

          {hiddenCatalogCount > 0 && (
            <p className="border-t border-line px-4 py-3 text-sm text-ink-500">
              ไม่มีเส้นที่ถืออยู่? พิมพ์ขนาดหรือยี่ห้อเพื่อค้นรุ่นจากแคตตาล็อกอีก {hiddenCatalogCount} รายการ
            </p>
          )}
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
  withTread,
  treadLabel,
  serialError,
  stockTires,
  mountedText,
  stockOnlyUntilSearch,
  knownTire,
  treadHint,
}: {
  pick: TirePick
  onChange: (pick: TirePick) => void
  /**
   * ยางที่ระบบบันทึกว่าติดอยู่ล้อนี้ — ใช้แสดงชื่อเมื่อถูกตั้งเป็นค่าเริ่มต้นของการถอด
   * (ไม่อยู่ใน options เพราะไม่ใช่ยางว่างในคลัง)
   */
  knownTire?: TireLite | null
  /** คำแนะนำใต้ช่องดอกยาง */
  treadHint?: string
  /** ส่งต่อให้ TireAutocomplete — ยังไม่ค้นหาโชว์เฉพาะยางในคลัง */
  stockOnlyUntilSearch?: boolean
  /** ยางที่เลือกได้ — แคตตาล็อกของบริษัทนี้ หรือยางว่างในคลัง */
  options: TireOption[]
  emptyText: string
  selectionLabel?: string
  selectionHint?: string
  /** แสดงช่องดอกยางคงเหลือ */
  withTread: boolean
  treadLabel: string
  serialError?: string
  /**
   * ยางทั้งหมดของบริษัท (ไม่รวมตัดจำหน่าย) สำหรับแนะนำซีรีย์ขณะพิมพ์
   * ไม่ส่ง = ช่องซีรีย์เป็นช่องพิมพ์ธรรมดา
   */
  stockTires?: TireLite[]
  /** ข้อความของเส้นที่ติดรถอยู่ (เลือกไม่ได้) เช่น "ติดอยู่ที่ 70-1234 เพลา 1 ซ้าย — ต้องถอดก่อน" */
  mountedText?: (tire: TireLite) => string
}) {
  const set = <K extends keyof TirePick>(key: K, value: string) =>
    onChange({ ...pick, [key]: value })

  /** เลือกยางจากคลังแล้ว = ซีเรียลมาจากเส้นจริง ไม่ต้องให้แก้ */
  const serialLocked = pick.stockTireId !== ''

  /** ยางในคลังที่เลือกไว้ (อาจหยิบผ่านช่องซีรีย์ จึงอาจไม่อยู่ใน options ของช่องเลือกยาง) */
  const stockPicked = pick.stockTireId
    ? stockTires?.find((t) => t.id === pick.stockTireId) ??
      (knownTire?.id === pick.stockTireId ? knownTire : null)
    : null
  /** ค่าเริ่มต้นมาจากยางที่บันทึกว่าติดอยู่ล้อนี้ */
  const fromMounted = Boolean(knownTire) && pick.stockTireId === knownTire?.id

  /** หยิบยางจากคลัง — เติมซีเรียล ดอกยาง และรุ่นให้เหมือนเลือกจากช่องเลือกยาง */
  function pickStock(tire: TireLite) {
    onChange({
      ...pick,
      modelId: '',
      stockTireId: tire.id,
      serialNo: tire.serial_no,
      treadMm: tire.tread_mm !== null ? String(tire.tread_mm) : pick.treadMm,
    })
  }

  return (
    <>
      <Field label={selectionLabel} required hint={selectionHint}>
        <TireAutocomplete
          pick={pick}
          onChange={onChange}
          options={options}
          emptyText={emptyText}
          stockOnlyUntilSearch={stockOnlyUntilSearch}
          fallbackLabel={
            stockPicked
              ? [stockPicked.size ?? 'ไม่ระบุขนาด', stockPicked.serial_no, stockPicked.model_name || null]
                  .filter(Boolean)
                  .join(' · ')
              : undefined
          }
        />
      </Field>

      <Field
        label="ซีรีย์ยาง"
        required
        error={serialError}
        hint={
          fromMounted
            ? 'ยางที่บันทึกว่าติดอยู่ล้อนี้ — ถ้ายางจริงไม่ใช่เส้นนี้ ลบที่ช่องเลือกยางแล้วเลือกใหม่'
            : serialLocked
            ? 'ซีเรียลของยางเส้นที่เลือกจากคลัง'
            : stockTires
              ? 'พิมพ์อย่างน้อย 2 ตัวเพื่อค้นซีรีย์ในคลัง — ถ้าเป็นยางที่ยังไม่มีในระบบ พิมพ์ต่อได้เลย (ระบบแปลงเป็นตัวพิมพ์ใหญ่ให้)'
              : 'ตัวเลขและตัวอักษรภาษาอังกฤษเท่านั้น (ระบบแปลงเป็นตัวพิมพ์ใหญ่ให้)'
        }
      >
        {stockTires && !serialLocked ? (
          <SerialAutocomplete
            value={pick.serialNo}
            onInput={(value) => set('serialNo', value)}
            onPickStock={pickStock}
            stockTires={stockTires}
            mountedText={mountedText}
          />
        ) : (
          <Input
            value={pick.serialNo}
            // กรองให้เหลือ A-Z 0-9 ขีด และแปลงเป็นตัวพิมพ์ใหญ่ทันที เพื่อให้ค้นเจอกันไม่ว่าจะพิมพ์เล็ก/ใหญ่
            onChange={(e) => set('serialNo', serialLocked ? e.target.value : sanitizeSerial(e.target.value))}
            placeholder="111111"
            maxLength={SERIAL_MAX}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="h-14 text-lg uppercase"
            readOnly={serialLocked}
          />
        )}
      </Field>

      {withTread && (
        <Field label={treadLabel} required hint={treadHint}>
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

/**
 * ชุดช่องใส่ยาง — เลือกยี่ห้อ/รุ่นก่อน แล้วค่อยเลือกซีรีย์
 *
 * ซีรีย์ที่ขึ้นให้เลือกกรองเฉพาะยางในคลังของรุ่นนั้น
 * (ใส่ยางใหม่ = เฉพาะเส้นที่ยังไม่เคยใส่/ถอด, ใส่ยางเก่า = เฉพาะเส้นที่เคยใส่/ถอดแล้ว)
 * ถ้าเส้นที่ถืออยู่ไม่มีในระบบ ช่างพิมพ์ซีรีย์เข้าไปใหม่ได้
 */
function MountPickFields({
  pick,
  onChange,
  mountKind,
  models,
  catalogOptions,
  tires,
  serialError,
  mountedText,
}: {
  pick: TirePick
  onChange: (pick: TirePick) => void
  /** ชนิดยางที่ใส่ — กำหนดว่าซีรีย์ในคลังชุดไหนหยิบได้ และต้องกรอกดอกยางหรือไม่ */
  mountKind: 'new' | 'used'
  /** รุ่นในแคตตาล็อกของบริษัทนี้ */
  models: TireModelLite[]
  /** รุ่นเดียวกับ models ในรูปตัวเลือกของช่องค้นหา */
  catalogOptions: TireOption[]
  /** ยางทั้งหมดของบริษัท (ไม่รวมตัดจำหน่าย) — ใช้กรองซีรีย์ตามรุ่น และเตือนเส้นที่ติดรถอยู่ */
  tires: TireLite[]
  serialError?: string
  /** ข้อความของเส้นที่ติดรถอยู่ (เลือกไม่ได้) */
  mountedText?: (tire: TireLite) => string
}) {
  const selectedModel = models.find((m) => m.id === pick.modelId) ?? null
  const stockPicked = pick.stockTireId ? tires.find((t) => t.id === pick.stockTireId) ?? null : null
  /** หยิบเส้นในคลังแล้ว = ซีรีย์มาจากเส้นจริง ไม่ให้แก้ (กดล้างเพื่อเลือกใหม่) */
  const serialLocked = pick.stockTireId !== ''

  /**
   * ยางในคลังที่หยิบไปใส่ได้ตามชนิดที่เลือก — แยกขาดกัน
   * ยางใหม่ = เส้นที่ยังไม่เคยใส่/ถอด, ยางเก่า = เส้นที่เคยใส่/ถอดแล้ว (ยางใหม่ไม่โผล่ในรายการยางเก่า)
   */
  const pickable = React.useMemo(
    () => tires.filter((t) => isAvailableStock(t) && (mountKind === 'used' ? !isFreshTire(t) : isFreshTire(t))),
    [tires, mountKind],
  )

  /** จำนวนเส้นที่หยิบได้ต่อรุ่น — โชว์ท้ายรายการรุ่นให้ช่างเห็นว่ารุ่นไหนมีของ */
  const stockCountByModel = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const model of models) {
      const count = pickable.filter((t) => stockMatchesModel(t, model)).length
      if (count > 0) map.set(model.id, count)
    }
    return map
  }, [models, pickable])

  /** ซีรีย์ในคลังของรุ่นที่เลือก — ใหม่ก่อนเคยใช้ แล้วดอกยางมากไปน้อย */
  const suggested = React.useMemo(() => {
    if (!selectedModel) return []
    return pickable
      .filter((t) => stockMatchesModel(t, selectedModel))
      .sort(
        (a, b) =>
          Number(isFreshTire(b)) - Number(isFreshTire(a)) ||
          (b.tread_mm ?? 0) - (a.tread_mm ?? 0) ||
          a.serial_no.localeCompare(b.serial_no),
      )
  }, [pickable, selectedModel])

  /** หยิบเส้นในคลัง — เติมซีรีย์/ดอกยาง และคงรุ่นที่เลือกไว้ถ้าเส้นนั้นเป็นรุ่นเดียวกัน */
  function pickStock(tire: TireLite) {
    const sameModel = selectedModel !== null && stockMatchesModel(tire, selectedModel)
    onChange({
      modelId: sameModel ? pick.modelId : '',
      stockTireId: tire.id,
      serialNo: tire.serial_no,
      treadMm: tire.tread_mm !== null ? String(tire.tread_mm) : pick.treadMm,
    })
  }

  /** ยกเลิกเส้นในคลังที่หยิบไว้ กลับไปเลือกซีรีย์ใหม่ของรุ่นเดิม */
  function clearStock() {
    onChange({ ...pick, stockTireId: '', serialNo: '', treadMm: '' })
  }

  const kindLabel = mountKind === 'new' ? 'ยางใหม่' : 'ยางเก่า'
  const serialHint = serialLocked
    ? 'ซีเรียลของยางเส้นที่เลือกจากคลัง — กด × เพื่อเลือกเส้นอื่น'
    : suggested.length > 0
      ? `${kindLabel}ของรุ่นนี้มี ${suggested.length} เส้น แตะช่องเพื่อเลือก หรือพิมพ์ซีรีย์เพื่อกรอง — ถ้าเส้นที่ถืออยู่ไม่มีในรายการ พิมพ์ซีรีย์เข้าไปใหม่ได้ (ระบบแปลงเป็นตัวพิมพ์ใหญ่ให้)`
      : `ไม่มี${kindLabel}ของรุ่นนี้ในคลัง — คีย์ซีรีย์ของเส้นที่ถืออยู่เข้าไปใหม่ (ระบบแปลงเป็นตัวพิมพ์ใหญ่ให้)`

  return (
    <>
      <Field
        label="ยี่ห้อ / รุ่นยาง"
        required
        hint="พิมพ์ขนาดหรือยี่ห้อเพื่อค้น เช่น 11R22.5 — ตัวเลข “ในคลัง” คือจำนวนเส้นที่หยิบใส่ได้ของรุ่นนั้น (ไม่ทราบยี่ห้อ เลือก “อื่นๆ” ตามขนาดยาง)"
      >
        <TireAutocomplete
          pick={pick}
          onChange={onChange}
          options={catalogOptions}
          emptyText={CATALOG_EMPTY_TEXT}
          selectBy="model"
          fallbackLabel={
            stockPicked
              ? [stockPicked.size ?? 'ไม่ระบุขนาด', stockPicked.brand_name || null, stockPicked.model_name || null]
                  .filter(Boolean)
                  .join(' · ')
              : undefined
          }
          trailing={(option) => {
            const count = stockCountByModel.get(option.id)
            return count ? <Badge tone="sky">ในคลัง {count}</Badge> : null
          }}
        />
      </Field>

      {selectedModel || stockPicked ? (
        <Field label="ซีรีย์ยาง" required error={serialError} hint={serialHint}>
          {serialLocked ? (
            <div className="relative">
              <Input
                value={pick.serialNo}
                readOnly
                className="h-14 pr-12 text-lg uppercase"
              />
              <button
                type="button"
                onClick={clearStock}
                aria-label="ล้างซีรีย์ที่เลือก"
                className="absolute right-1 top-1 flex size-12 items-center justify-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-ink-700"
              >
                <X className="size-5" />
              </button>
            </div>
          ) : (
            <SerialAutocomplete
              value={pick.serialNo}
              onInput={(value) => onChange({ ...pick, serialNo: value })}
              onPickStock={pickStock}
              stockTires={tires}
              mountedText={mountedText}
              suggested={suggested}
              suggestedTitle={`${kindLabel}ของรุ่นที่เลือก`}
            />
          )}
        </Field>
      ) : (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink-500 ring-1 ring-inset ring-line">
          เลือกยี่ห้อ/รุ่นก่อน — ระบบจะกรองซีรีย์{kindLabel}ของรุ่นนั้นให้เลือก ถ้าไม่มีค่อยคีย์ซีรีย์เอง
        </p>
      )}

      {mountKind === 'used' && (
        <Field label="ดอกยาง (มม.)" required>
          <Select value={pick.treadMm} onChange={(e) => onChange({ ...pick, treadMm: e.target.value })}>
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

/** จำนวนรายการแนะนำซีรีย์สูงสุดใน dropdown */
const SERIAL_SUGGEST_LIMIT = 8
/** พิมพ์กี่ตัวถึงเริ่มแนะนำ */
const SERIAL_SUGGEST_MIN = 2

/**
 * ช่องคีย์ซีรีย์พร้อมรายการแนะนำจากยางในคลัง — พิมพ์ตั้งแต่ 2 ตัวแล้วแตะเลือกได้เลย
 *
 * ยางที่ว่างในคลังเลือกได้ (ระบบเติมข้อมูลให้เหมือนเลือกจากช่องเลือกยาง)
 * ยางที่ติดรถอยู่โชว์เป็นรายการจาง ๆ กดไม่ได้ — ต้องถอดออกก่อน
 * ไม่เจอในคลังก็พิมพ์ต่อได้ตามปกติ (ยางใหม่ที่ยังไม่มีในระบบ)
 */
function SerialAutocomplete({
  value,
  onInput,
  onPickStock,
  stockTires,
  mountedText,
  suggested,
  suggestedTitle = 'ซีรีย์ในคลังของรุ่นที่เลือก',
}: {
  value: string
  onInput: (value: string) => void
  onPickStock: (tire: TireLite) => void
  stockTires: TireLite[]
  mountedText?: (tire: TireLite) => string
  /**
   * ยางในคลังที่กรองตามยี่ห้อ/รุ่นที่เลือกไว้ — แตะช่องแล้วขึ้นให้เลือกทั้งชุดทันทีโดยไม่ต้องพิมพ์
   * พิมพ์แล้วค้นเฉพาะในชุดนี้เท่านั้น (ส่งมาแล้วแม้ชุดว่าง = ไม่แนะนำซีรีย์รุ่นอื่นเลย ช่างคีย์ซีรีย์ใหม่ไปตรง ๆ)
   * ไม่ส่ง (undefined) = พฤติกรรมเดิม ต้องพิมพ์ 2 ตัวก่อนจึงแนะนำจากคลังทั้งหมด
   */
  suggested?: TireLite[]
  /** หัวรายการเมื่อผลค้นมาจากชุดที่กรองตามรุ่น */
  suggestedTitle?: string
}) {
  const [open, setOpen] = React.useState(false)
  /** true ระหว่างนิ้ว/เมาส์กดค้างอยู่ในรายการ — กัน blur ปิดรายการก่อนคลิกทำงาน (Safari) */
  const pressingRef = React.useRef(false)

  const query = value.trim().toUpperCase()

  const { matches, fromSuggested } = React.useMemo(() => {
    const byPrefixThenName = (a: TireLite, b: TireLite) =>
      Number(b.serial_no.toUpperCase().startsWith(query)) - Number(a.serial_no.toUpperCase().startsWith(query)) ||
      a.serial_no.localeCompare(b.serial_no)

    // โหมดกรองตามรุ่น: ค้นเฉพาะในชุดที่ส่งมา ไม่ถอยไปคลังทั้งหมด (รุ่นที่เลือกไม่มีซีรีย์ = ไม่แนะนำอะไรเลย)
    if (suggested) {
      if (query.length === 0) {
        // ยังไม่พิมพ์ = โชว์ทั้งชุด (เรียงตามที่ส่งมา: ใหม่ก่อน ดอกยางมากก่อน)
        return { matches: suggested.slice(0, SERIAL_SUGGEST_LIMIT * 3), fromSuggested: true }
      }
      const hit = suggested.filter((t) => t.serial_no.toUpperCase().includes(query))
      return { matches: [...hit].sort(byPrefixThenName).slice(0, SERIAL_SUGGEST_LIMIT), fromSuggested: true }
    }

    if (query.length < SERIAL_SUGGEST_MIN) return { matches: [] as TireLite[], fromSuggested: false }
    const hit = stockTires.filter((t) => t.serial_no.toUpperCase().includes(query))
    // ว่างในคลังขึ้นก่อน (ใหม่ก่อนเคยใช้) แล้วค่อยเส้นที่ติดรถอยู่ — ซีรีย์ที่ขึ้นต้นตรงกันมาก่อน
    const rank = (t: TireLite) =>
      (isAvailableStock(t) ? 0 : t.status === 'mounted' ? 2 : 3) + (isAvailableStock(t) && !isFreshTire(t) ? 0.5 : 0)
    return {
      matches: hit.sort((a, b) => rank(a) - rank(b) || byPrefixThenName(a, b)).slice(0, SERIAL_SUGGEST_LIMIT),
      fromSuggested: false,
    }
  }, [stockTires, query, suggested])

  const showList = open && matches.length > 0

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (pressingRef.current) return
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <Input
        value={value}
        // กรองให้เหลือ A-Z 0-9 ขีด และแปลงเป็นตัวพิมพ์ใหญ่ทันที เพื่อให้ค้นเจอกันไม่ว่าจะพิมพ์เล็ก/ใหญ่
        onChange={(e) => {
          onInput(sanitizeSerial(e.target.value))
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter') e.preventDefault()
        }}
        placeholder="111111"
        maxLength={SERIAL_MAX}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showList}
        className="h-14 text-lg uppercase"
      />

      {showList && (
        <div
          // กัน input หลุดโฟกัสตอนแตะรายการ — Safari ปิด dropdown ก่อน click ถ้าไม่กัน
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={() => { pressingRef.current = true }}
          onPointerUp={() => { pressingRef.current = false }}
          onPointerCancel={() => { pressingRef.current = false }}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto overscroll-contain rounded-xl border border-line bg-white py-1 shadow-lg"
        >
          <p className="px-4 pb-1 pt-2 text-xs font-medium text-ink-400">
            {fromSuggested ? suggestedTitle : 'ซีรีย์ในคลังที่ตรงกับที่พิมพ์'}
          </p>
          {matches.map((tire) => {
            const available = isAvailableStock(tire)
            const spec = [tire.size ?? 'ไม่ระบุขนาด', tire.brand_name || null, tire.model_name || null]
              .filter(Boolean)
              .join(' · ')
            return (
              <button
                key={tire.id}
                type="button"
                disabled={!available}
                onClick={() => {
                  onPickStock(tire)
                  setOpen(false)
                }}
                className={cn(
                  'flex min-h-14 w-full items-center gap-2 px-4 py-3 text-left',
                  available
                    ? 'hover:bg-brand-50 active:bg-brand-100'
                    : 'cursor-not-allowed opacity-60',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold uppercase text-ink-900">{tire.serial_no}</span>
                    {available ? (
                      <StockBadge tire={tire} />
                    ) : (
                      <Badge tone="rose">{tire.status === 'mounted' ? 'ติดรถอยู่' : 'ส่งหล่อดอก'}</Badge>
                    )}
                  </span>
                  <span className="block truncate text-sm text-ink-500">{spec}</span>
                  {!available && tire.status === 'mounted' && (
                    <span className="block truncate text-sm text-rose-600">
                      {mountedText
                        ? mountedText(tire)
                        : `ติดอยู่ที่ ${vehicleLabel(tire, 'รถคันอื่น')} — ต้องถอดก่อน`}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
