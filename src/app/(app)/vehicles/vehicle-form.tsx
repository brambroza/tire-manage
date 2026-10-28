'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ImagePlus, Trash2, Truck } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { getLayout } from '@/lib/axle-layouts'
import { PROVINCES } from '@/lib/provinces'
import {
  ODOMETER_HINT, ODOMETER_MAX, PLATE_NUMBER_MAX, PLATE_PREFIX_MAX,
  formatNumber, formatThaiDate, sanitizePlateNumber, sanitizePlatePrefix,
} from '@/lib/utils'
import { vehicleLabel } from '@/lib/vehicle-display'
import { VEHICLE_IDENTITY_MESSAGE } from '@/lib/vehicle-schema'
import { resizePhoto } from '@/lib/resize-photo'
import {
  createVehicle, getObservedMonthlyKm, removeVehiclePhoto, updateVehicle, uploadVehiclePhoto,
  type VehicleInput,
} from './actions'
import type { AxleType, Vehicle } from '@/lib/database.types'

/** ค่าเฉลี่ยที่คำนวณได้จากประวัติถอด-ใส่ยาง ใช้แนะนำตอนกรอกฟอร์ม */
type ObservedAverage = { kmPerMonth: number; sampleEvents: number; lastDate: string }

const EMPTY: VehicleInput = {
  plate_no: '',
  nickname: '',
  province: 'กรุงเทพมหานคร',
  brand: '',
  model: '',
  axle_type: '10W',
  current_mileage: 0,
  avg_km_per_month: '',
  branch: '',
  note: '',
}

/**
 * แยกทะเบียนเต็มเป็นสองส่วนตามขีดกลางตัวแรก เช่น "70-12345" → ["70", "12345"]
 * @param plateNo ทะเบียนเต็ม
 */
function splitPlate(plateNo: string): [string, string] {
  const i = plateNo.indexOf('-')
  return i === -1 ? [plateNo, ''] : [plateNo.slice(0, i), plateNo.slice(i + 1)]
}

/**
 * รวมสองช่องกลับเป็นทะเบียนเต็ม (ใส่ขีดกลางเฉพาะเมื่อกรอกครบทั้งสองช่อง)
 * @param head หมวดทะเบียน เช่น 70 หรือ 1ฒข
 * @param tail เลขทะเบียน เช่น 12345
 */
function joinPlate(head: string, tail: string): string {
  const h = head.trim()
  const t = tail.trim()
  if (h && t) return `${h}-${t}`
  return h || t
}

/** ฟอร์มเพิ่ม/แก้ไขรถ (ใช้ร่วมกันทั้งสองโหมด) */
export function VehicleFormModal({
  open,
  onClose,
  vehicle,
  companyId,
  axleTypes,
  branches = [],
  onPhotoError,
}: {
  open: boolean
  onClose: () => void
  /** photo_url = signed URL ของรูปปัจจุบัน (สร้างฝั่ง server) */
  vehicle?: (Vehicle & { photo_url?: string | null }) | null
  /** ระบุเมื่อ super admin เพิ่มรถแทนลูกค้า */
  companyId?: string
  /** ประเภทเพลาจาก Supabase */
  axleTypes: AxleType[]
  /** รายชื่อสาขาของบริษัท (ตั้งที่หน้าข้อมูลบริษัท) */
  branches?: string[]
  /** แจ้งเมื่อบันทึกรถแล้วแต่รูปบันทึกไม่สำเร็จ (modal ปิดไปแล้ว) */
  onPhotoError?: (message: string) => void
}) {
  const router = useRouter()
  const [form, setForm] = React.useState<VehicleInput>(EMPTY)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  // ทะเบียนแยกเป็นสองช่อง (หมวด + เลข) แต่เก็บลง form.plate_no เป็นค่าเดียว
  const [plate, setPlate] = React.useState<[string, string]>(['', ''])
  const plateTailRef = React.useRef<HTMLInputElement>(null)
  const defaultAxleType =
    axleTypes.find((type) => type.is_active && type.code === '10W')?.code ??
    axleTypes.find((type) => type.is_active)?.code ??
    axleTypes[0]?.code ??
    EMPTY.axle_type

  // ค่าเฉลี่ยที่คำนวณได้จากประวัติถอด-ใส่ยาง ใช้แนะนำเท่านั้น ไม่เติมให้อัตโนมัติ
  const [observed, setObserved] = React.useState<ObservedAverage | null>(null)

  // รูปรถ: ไฟล์ใหม่ที่ย่อแล้ว (รออัปโหลดตอนกดบันทึก) และสถานะขอลบรูปเดิม
  const [photoFile, setPhotoFile] = React.useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = React.useState(false)
  const [photoBusy, setPhotoBusy] = React.useState(false)
  const photoInputRef = React.useRef<HTMLInputElement>(null)

  // รีเซ็ตค่าในฟอร์มเมื่อเปิด modal ใหม่ (ปรับ state ระหว่าง render ตามแนวทางของ React)
  const formKey = open ? vehicle?.id ?? 'new' : null
  const [activeKey, setActiveKey] = React.useState<string | null>(null)
  if (formKey !== activeKey) {
    setActiveKey(formKey)
    setError(null)
    setFieldErrors({})
    setPlate(vehicle ? splitPlate(vehicle.plate_no ?? '') : ['', ''])
    setForm(
      vehicle
        ? {
            plate_no: vehicle.plate_no ?? '',
            nickname: vehicle.nickname ?? '',
            province: vehicle.province ?? EMPTY.province,
            brand: vehicle.brand ?? '',
            model: vehicle.model ?? '',
            axle_type: vehicle.axle_type,
            current_mileage: vehicle.current_mileage,
            avg_km_per_month: vehicle.avg_km_per_month ?? '',
            branch: vehicle.branch ?? '',
            note: vehicle.note ?? '',
          }
        : { ...EMPTY, axle_type: defaultAxleType },
    )
    setObserved(null)
    setPhotoFile(null)
    setPhotoPreview(null)
    setRemovePhoto(false)
  }

  // คืนหน่วยความจำของ preview เมื่อเปลี่ยนรูปหรือปิดฟอร์ม
  React.useEffect(() => {
    if (!photoPreview) return
    return () => URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  const editingVehicleId = open ? vehicle?.id ?? null : null
  React.useEffect(() => {
    if (!editingVehicleId) return
    let cancelled = false
    void getObservedMonthlyKm(editingVehicleId).then((result) => {
      if (!cancelled && result.ok) setObserved(result.data ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [editingVehicleId])

  const set = <K extends keyof VehicleInput>(key: K, value: VehicleInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  /**
   * อัปเดตช่องทะเบียน แล้วรวมกลับเป็น plate_no
   * @param part ช่องที่แก้ (0 = หมวด, 1 = เลข)
   * @param value ค่าที่พิมพ์
   */
  function setPlatePart(part: 0 | 1, value: string) {
    let next: [string, string] =
      part === 0 ? [value, plate[1]] : [plate[0], sanitizePlateNumber(value)]
    // พิมพ์ขีดกลางในช่องแรก = ข้ามไปช่องเลขทะเบียนให้เลย
    if (part === 0 && value.includes('-')) {
      const [head, tail] = splitPlate(value)
      next = [head, sanitizePlateNumber(tail) || plate[1]]
      plateTailRef.current?.focus()
    }
    if (part === 0) {
      // หมวดทะเบียน: พยัญชนะไทย/ตัวเลข ไม่เกิน 2 ตัว ครบแล้วดีดไปช่องเลข
      next = [sanitizePlatePrefix(next[0]), next[1]]
      if (next[0].length === PLATE_PREFIX_MAX) plateTailRef.current?.focus()
    }
    setPlate(next)
    set('plate_no', joinPlate(next[0], next[1]))
  }

  /**
   * ย่อรูปที่เลือกแล้วแสดงตัวอย่าง — ยังไม่อัปโหลดจนกว่าจะกดบันทึก
   * @param e เหตุการณ์เลือกไฟล์
   */
  async function handlePickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    if (photoInputRef.current) photoInputRef.current.value = ''
    if (!picked) return
    setError(null)
    setPhotoBusy(true)
    try {
      const resized = await resizePhoto(picked)
      setPhotoFile(resized)
      setPhotoPreview(URL.createObjectURL(resized))
      setRemovePhoto(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อ่านไฟล์รูปไม่สำเร็จ')
    } finally {
      setPhotoBusy(false)
    }
  }

  /** เอารูปออก: ล้างรูปใหม่ที่เพิ่งเลือก หรือทำเครื่องหมายลบรูปเดิมตอนบันทึก */
  function handleClearPhoto() {
    if (photoFile) {
      setPhotoFile(null)
      setPhotoPreview(null)
      return
    }
    setRemovePhoto(true)
  }

  /**
   * บันทึกรูปหลังบันทึกข้อมูลรถสำเร็จ
   * @param vehicleId รหัสรถที่เพิ่งบันทึก
   * @returns ข้อความผิดพลาด หรือ null เมื่อสำเร็จ/ไม่มีอะไรเปลี่ยน
   */
  async function savePhoto(vehicleId: string): Promise<string | null> {
    if (photoFile) {
      const formData = new FormData()
      formData.append('file', photoFile)
      const result = await uploadVehiclePhoto(vehicleId, formData)
      return result.ok ? null : result.error
    }
    if (removePhoto && vehicle?.image_path) {
      const result = await removeVehiclePhoto(vehicleId)
      return result.ok ? null : result.error
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    // ตรวจฝั่ง client ก่อน: ต้องมีทะเบียนหรือชื่อเรียกอย่างน้อยหนึ่งอย่าง
    if (!hasPlate && !(form.nickname ?? '').trim()) {
      setError(VEHICLE_IDENTITY_MESSAGE)
      setFieldErrors({ plate_no: VEHICLE_IDENTITY_MESSAGE, nickname: VEHICLE_IDENTITY_MESSAGE })
      return
    }

    setLoading(true)

    const result = vehicle
      ? await updateVehicle(vehicle.id, form)
      : await createVehicle(form, companyId)

    if (!result.ok) {
      setLoading(false)
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    // ข้อมูลรถบันทึกแล้ว — รูปแยกบันทึกทีหลัง ถ้ารูปพังไม่ย้อนข้อมูลรถ แต่แจ้งให้ลองเพิ่มรูปใหม่
    const vehicleId = vehicle ? vehicle.id : (result.data as { id: string }).id
    const photoError = await savePhoto(vehicleId)
    setLoading(false)
    onClose()
    if (photoError) onPhotoError?.(`บันทึกข้อมูลรถแล้ว แต่บันทึกรูปไม่สำเร็จ: ${photoError}`)
    router.refresh()
  }

  /** รูปที่แสดงในฟอร์ม: รูปใหม่ที่เลือก > รูปเดิม (ถ้าไม่ได้ขอลบ) */
  const shownPhoto = photoPreview ?? (removePhoto ? null : vehicle?.photo_url ?? null)
  const hasStoredPhoto = Boolean(vehicle?.image_path) && !removePhoto

  /** กรอกทะเบียนอย่างน้อยหนึ่งช่อง — จังหวัดแสดงและบังคับเฉพาะเมื่อมีทะเบียน */
  const hasPlate = plate[0].trim() !== '' || plate[1].trim() !== ''
  /** รถเดิมเคยมีทะเบียนแล้วถูกลบออกในฟอร์ม — เตือนก่อนบันทึก */
  const clearingPlate = Boolean(vehicle?.plate_no) && !hasPlate
  const layout = getLayout(form.axle_type, axleTypes)
  const availableAxleTypes = axleTypes.filter(
    (type) => type.is_active || type.code === vehicle?.axle_type,
  )
  // สาขาเดิมของรถที่ถูกลบออกจากรายชื่อแล้ว ยังต้องเป็นตัวเลือกอยู่ ไม่งั้นการแก้ไขจะล้างค่าทิ้งเงียบ ๆ
  const branchOptions =
    vehicle?.branch && !branches.includes(vehicle.branch) ? [...branches, vehicle.branch] : branches

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={vehicle ? 'แก้ไขข้อมูลรถ' : 'เพิ่มรถใหม่'}
      description={
        vehicle
          ? [vehicleLabel(vehicle), vehicle.province].filter(Boolean).join(' ')
          : 'กรอกทะเบียนหรือชื่อเรียกรถอย่างน้อยหนึ่งอย่าง พร้อมประเภทเพลา'
      }
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" form="vehicle-form" loading={loading}>
            {vehicle ? 'บันทึกการแก้ไข' : 'เพิ่มรถ'}
          </Button>
        </>
      }
    >
      <form id="vehicle-form" onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="ทะเบียนรถ"
            hint="หมวด 1-2 ตัว · เลขไม่เกิน 4 หลัก · เว้นว่างได้ถ้ากรอกชื่อเรียก"
            error={fieldErrors.plate_no}
          >
            <div className="flex items-center gap-2">
              <Input
                value={plate[0]}
                onChange={(e) => setPlatePart(0, e.target.value)}
                placeholder="70"
                maxLength={PLATE_PREFIX_MAX}
                aria-label="หมวดทะเบียน"
                className="w-24 text-center"
                autoFocus
              />
              <span className="text-ink-400">-</span>
              <Input
                ref={plateTailRef}
                value={plate[1]}
                onChange={(e) => setPlatePart(1, e.target.value)}
                placeholder="1234"
                inputMode="numeric"
                maxLength={PLATE_NUMBER_MAX}
                aria-label="เลขทะเบียน"
                className="flex-1"
              />
            </div>
          </Field>

          {hasPlate ? (
            <Field label="จังหวัด" required error={fieldErrors.province}>
              <Select value={form.province ?? ''} onChange={(e) => set('province', e.target.value)}>
                {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          ) : (
            <Field label="จังหวัด" hint="แสดงเมื่อกรอกทะเบียน">
              <p className="flex h-10 items-center text-sm text-ink-500">ไม่มีทะเบียน · ไม่ต้องระบุจังหวัด</p>
            </Field>
          )}

          <Field label="ชื่อเรียกรถ" error={fieldErrors.nickname} hint="ใช้แทนทะเบียนได้ถ้ารถไม่มีทะเบียน">
            <Input aria-label="ชื่อเรียกรถ" value={form.nickname ?? ''}
              onChange={(e) => set('nickname', e.target.value)} maxLength={100}
              placeholder="เช่น 32-002-BFn หรือ 588-233-SG+" />
          </Field>

          {clearingPlate && (
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 sm:col-span-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>ทะเบียนถูกลบออก รถคันนี้จะเหลือเฉพาะชื่อเรียก ประวัติถอด–ใส่ยางยังอยู่กับรถคันเดิม</span>
            </div>
          )}

          <Field label="ยี่ห้อรถ" error={fieldErrors.brand}>
            <Input
              value={form.brand ?? ''}
              onChange={(e) => set('brand', e.target.value)}
              placeholder="HINO"
            />
          </Field>

          <Field label="รุ่น" error={fieldErrors.model}>
            <Input
              value={form.model ?? ''}
              onChange={(e) => set('model', e.target.value)}
              placeholder="VICTOR 500"
            />
          </Field>

          <Field
            label="ประเภทเพลา"
            required
            hint={`ตำแหน่งล้อทั้งหมด ${layout.wheelCount} ตำแหน่ง`}
            error={fieldErrors.axle_type}
          >
            <Select value={form.axle_type} onChange={(e) => set('axle_type', e.target.value)}>
              {availableAxleTypes.map((type) => {
                const optionLayout = getLayout(type.code, axleTypes)
                return (
                  <option key={type.id} value={type.code}>
                    {type.name} · {optionLayout.wheelCount} เส้น
                    {type.is_active ? '' : ' (ปิดใช้งาน)'}
                  </option>
                )
              })}
            </Select>
          </Field>

          <Field
            label="เลขไมล์ล่าสุด (กม.)"
            required
            hint={ODOMETER_HINT}
            error={fieldErrors.current_mileage}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={ODOMETER_MAX}
              value={form.current_mileage}
              onChange={(e) =>
                set('current_mileage', Math.min(ODOMETER_MAX, Math.max(0, Number(e.target.value) || 0)))
              }
            />
          </Field>
        </div>

        <Field
          label="ค่าเฉลี่ยที่วิ่งต่อเดือน (กม.)"
          hint="ใช้เดาระยะที่วิ่งไปตั้งแต่บันทึกไมล์ครั้งล่าสุด เว้นว่างถ้าจะใช้ค่ากลางของบริษัท"
          error={fieldErrors.avg_km_per_month}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={ODOMETER_MAX}
            placeholder="ใช้ค่ากลางของบริษัท"
            value={form.avg_km_per_month ?? ''}
            onChange={(e) => set('avg_km_per_month', e.target.value)}
          />
          {observed && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
              <span>
                จากประวัติ ~{formatNumber(observed.kmPerMonth)} กม./เดือน
                <span className="text-ink-400">
                  {' '}({formatNumber(observed.sampleEvents)} รายการ ถึง {formatThaiDate(observed.lastDate)})
                </span>
              </span>
              <button
                type="button"
                onClick={() => set('avg_km_per_month', String(observed.kmPerMonth))}
                className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
              >
                ใช้ค่านี้
              </button>
            </p>
          )}
        </Field>

        <Field
          label="สาขา / หน่วยงาน"
          hint="ตั้งรายชื่อสาขาได้ที่หน้าข้อมูลบริษัท"
          error={fieldErrors.branch}
        >
          <Select value={form.branch ?? ''} onChange={(e) => set('branch', e.target.value)}>
            <option value="">— ไม่ระบุสาขา —</option>
            {branchOptions.map((name) => (
              <option key={name} value={name}>
                {name}
                {branches.includes(name) ? '' : ' (ถูกลบออกจากรายชื่อแล้ว)'}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="รูปรถ"
          hint="ถ่ายหรือเลือกรูป 1 รูป ระบบย่อรูปให้อัตโนมัติ · ไม่บังคับ"
        >
          <div className="flex flex-wrap items-center gap-4">
            {shownPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shownPhoto}
                alt="รูปรถ"
                className="h-28 w-40 shrink-0 rounded-xl object-cover ring-1 ring-inset ring-line"
              />
            ) : (
              <span className="flex h-28 w-40 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-400 ring-1 ring-inset ring-brand-100">
                <Truck className="size-9" strokeWidth={1.5} />
              </span>
            )}
            <div className="flex flex-col gap-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePickPhoto}
                className="hidden"
                aria-label="เลือกรูปรถ"
              />
              <Button
                type="button"
                variant="secondary"
                loading={photoBusy}
                onClick={() => photoInputRef.current?.click()}
              >
                <ImagePlus className="size-4.5" />
                {shownPhoto ? 'เปลี่ยนรูป' : 'เพิ่มรูป'}
              </Button>
              {(photoFile || hasStoredPhoto) && (
                <Button type="button" variant="ghost" onClick={handleClearPhoto}>
                  <Trash2 className="size-4.5" />
                  เอารูปออก
                </Button>
              )}
              {removePhoto && !photoFile && (
                <p className="text-xs text-amber-700">รูปเดิมจะถูกลบเมื่อกดบันทึก</p>
              )}
            </div>
          </div>
        </Field>

        <Field label="หมายเหตุ" error={fieldErrors.note}>
          <Textarea
            value={form.note ?? ''}
            onChange={(e) => set('note', e.target.value)}
            placeholder="ระบุหมายเหตุ (ถ้ามี)"
          />
        </Field>
      </form>
    </Modal>
  )
}
