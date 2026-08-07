'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { getLayout } from '@/lib/axle-layouts'
import { PROVINCES } from '@/lib/provinces'
import { createVehicle, updateVehicle, type VehicleInput } from './actions'
import type { AxleType, Vehicle } from '@/lib/database.types'

const EMPTY: VehicleInput = {
  plate_no: '',
  province: 'กรุงเทพมหานคร',
  brand: '',
  model: '',
  axle_type: '10W',
  current_mileage: 0,
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
}: {
  open: boolean
  onClose: () => void
  vehicle?: Vehicle | null
  /** ระบุเมื่อ super admin เพิ่มรถแทนลูกค้า */
  companyId?: string
  /** ประเภทเพลาจาก Supabase */
  axleTypes: AxleType[]
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

  // รีเซ็ตค่าในฟอร์มเมื่อเปิด modal ใหม่ (ปรับ state ระหว่าง render ตามแนวทางของ React)
  const formKey = open ? vehicle?.id ?? 'new' : null
  const [activeKey, setActiveKey] = React.useState<string | null>(null)
  if (formKey !== activeKey) {
    setActiveKey(formKey)
    setError(null)
    setFieldErrors({})
    setPlate(vehicle ? splitPlate(vehicle.plate_no) : ['', ''])
    setForm(
      vehicle
        ? {
            plate_no: vehicle.plate_no,
            province: vehicle.province,
            brand: vehicle.brand ?? '',
            model: vehicle.model ?? '',
            axle_type: vehicle.axle_type,
            current_mileage: vehicle.current_mileage,
            note: vehicle.note ?? '',
          }
        : { ...EMPTY, axle_type: defaultAxleType },
    )
  }

  const set = <K extends keyof VehicleInput>(key: K, value: VehicleInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  /**
   * อัปเดตช่องทะเบียน แล้วรวมกลับเป็น plate_no
   * @param part ช่องที่แก้ (0 = หมวด, 1 = เลข)
   * @param value ค่าที่พิมพ์
   */
  function setPlatePart(part: 0 | 1, value: string) {
    let next: [string, string] = part === 0 ? [value, plate[1]] : [plate[0], value]
    // พิมพ์ขีดกลางในช่องแรก = ข้ามไปช่องเลขทะเบียนให้เลย
    if (part === 0 && value.includes('-')) {
      const [head, tail] = splitPlate(value)
      next = [head, tail || plate[1]]
      plateTailRef.current?.focus()
    }
    setPlate(next)
    set('plate_no', joinPlate(next[0], next[1]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

    const result = vehicle
      ? await updateVehicle(vehicle.id, form)
      : await createVehicle(form, companyId)

    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    onClose()
    router.refresh()
  }

  const layout = getLayout(form.axle_type, axleTypes)
  const availableAxleTypes = axleTypes.filter(
    (type) => type.is_active || type.code === vehicle?.axle_type,
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={vehicle ? 'แก้ไขข้อมูลรถ' : 'เพิ่มรถใหม่'}
      description={vehicle ? `${vehicle.plate_no} ${vehicle.province}` : 'กรอกข้อมูลทะเบียนและประเภทเพลาของรถ'}
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
          <Field label="ทะเบียนรถ" required error={fieldErrors.plate_no}>
            <div className="flex items-center gap-2">
              <Input
                value={plate[0]}
                onChange={(e) => setPlatePart(0, e.target.value)}
                placeholder="70"
                aria-label="หมวดทะเบียน"
                className="w-24 text-center"
                autoFocus
              />
              <span className="text-ink-400">-</span>
              <Input
                ref={plateTailRef}
                value={plate[1]}
                onChange={(e) => setPlatePart(1, e.target.value)}
                placeholder="12345"
                aria-label="เลขทะเบียน"
                className="flex-1"
              />
            </div>
          </Field>

          <Field label="จังหวัด" required error={fieldErrors.province}>
            <Select value={form.province} onChange={(e) => set('province', e.target.value)}>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>

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

          <Field label="เลขไมล์ล่าสุด (กม.)" required error={fieldErrors.current_mileage}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={form.current_mileage}
              onChange={(e) => set('current_mileage', Number(e.target.value))}
            />
          </Field>
        </div>

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
