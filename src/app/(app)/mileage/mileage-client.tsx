'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, Check, Gauge, Truck } from 'lucide-react'
import { Button, Field, Input } from '@/components/ui'
import {
  ODOMETER_MAX, PLATE_NUMBER_MAX, PLATE_PATTERN, PLATE_PATTERN_MESSAGE, PLATE_PREFIX_MAX,
  formatKm, groupDigits, sanitizeOdometer, sanitizePlateNumber, sanitizePlatePrefix,
} from '@/lib/utils'
import { updateMileage } from '../vehicles/actions'

export interface MileageVehicle {
  id: string
  plate_no: string
  province: string
  brand: string | null
  model: string | null
  current_mileage: number
  /** จำนวนยางที่ติดตั้งอยู่ — บอกว่าการบันทึกไมล์กระทบยางกี่เส้น */
  mounted_count: number
}

type Step = 'plate' | 'odometer'

/**
 * หน้าบันทึกเลขไมล์แบบ 2 ขั้น (ทะเบียน → เลขไมล์) ออกแบบให้ใช้บนมือถือหน้างานเหมือนหน้าช่าง
 * ค้นทะเบียนแบบไม่สนตัวพิมพ์/ขีดกลาง เพื่อให้เจอทะเบียนเก่าที่บันทึกไว้ต่างรูปแบบ
 */
export function MileageClient({
  vehicles,
  initialVehicleId,
}: {
  vehicles: MileageVehicle[]
  /** เปิดมาจากหน้ารถ — ข้ามขั้นทะเบียนไปกรอกไมล์ได้เลย */
  initialVehicleId?: string
}) {
  const router = useRouter()
  const initialVehicle = vehicles.find((v) => v.id === initialVehicleId) ?? null

  const [step, setStep] = React.useState<Step>(initialVehicle ? 'odometer' : 'plate')
  const [vehicle, setVehicle] = React.useState<MileageVehicle | null>(initialVehicle)
  const [platePrefix, setPlatePrefix] = React.useState('')
  const [plateNumber, setPlateNumber] = React.useState('')
  const [odometer, setOdometer] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)

  const platePrefixRef = React.useRef<HTMLInputElement>(null)
  const plateNumberRef = React.useRef<HTMLInputElement>(null)

  /** ซ่อน snackbar เองหลัง 3 วินาที */
  React.useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const plateNo = `${platePrefix.trim()}-${plateNumber.trim()}`
  const mileageValue = Number(odometer)
  const odometerValid =
    odometer.trim() !== '' && mileageValue >= 0 && mileageValue <= ODOMETER_MAX
  /** true เมื่อไมล์ที่กรอกน้อยกว่าค่าเดิม — บล็อกไว้ก่อนถึง server */
  const belowCurrent = Boolean(vehicle) && odometerValid && mileageValue < vehicle!.current_mileage
  const delta = vehicle && odometerValid ? mileageValue - vehicle.current_mileage : null

  /** ยืนยันทะเบียน — บันทึกไมล์ได้เฉพาะรถที่มีในระบบ */
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
    const found =
      vehicles.find((v) => v.plate_no.toLowerCase() === key) ??
      vehicles.find((v) => v.plate_no.replace(/[\s-]/g, '').toLowerCase() === key.replace(/-/g, '')) ??
      null

    if (!found) {
      setError(`ไม่พบทะเบียน ${plateNo} ในระบบ — บันทึกไมล์ได้เฉพาะรถที่มีอยู่แล้ว (เพิ่มรถได้จากหน้าบันทึกถอด-ใส่ยาง)`)
      return
    }

    setVehicle(found)
    setOdometer('')
    setStep('odometer')
  }

  /** กลับไปขั้นทะเบียนเพื่อทำรถคันถัดไป */
  function reset() {
    setStep('plate')
    setVehicle(null)
    setPlatePrefix('')
    setPlateNumber('')
    setOdometer('')
    setError(null)
  }

  async function save() {
    if (!vehicle || !odometerValid || belowCurrent) return
    setError(null)
    setSaving(true)
    const result = await updateMileage(vehicle.id, mileageValue)
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setToast(`บันทึก ${result.data!.plate_no} เป็น ${formatKm(result.data!.current_mileage)} แล้ว`)
    reset()
    router.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ------------------------------------------------ ขั้นที่ 1: ทะเบียน */}
      {step === 'plate' && (
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <header className="mb-4">
            <p className="text-xl font-semibold text-ink-900">ใส่ทะเบียนรถ</p>
            <p className="mt-0.5 text-sm text-ink-500">เฉพาะรถที่มีในระบบแล้ว</p>
          </header>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                ref={platePrefixRef}
                value={platePrefix}
                onChange={(e) => {
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
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submitPlate()
                    return
                  }
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
            <Button className="h-14 w-full text-lg" size="lg" onClick={submitPlate}>
              ตกลง
            </Button>
          </div>
        </section>
      )}

      {/* ------------------------------------------------ ขั้นที่ 2: เลขไมล์ */}
      {step === 'odometer' && vehicle && (
        <>
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3">
            <button
              type="button"
              onClick={reset}
              aria-label="กลับไปใส่ทะเบียน"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-500 hover:bg-brand-50 hover:text-brand-600"
            >
              <ArrowLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
                <Truck className="size-4.5 text-brand-600" />
                {vehicle.plate_no}
                <span className="font-normal text-ink-400">{vehicle.province}</span>
              </p>
              <p className="truncate text-sm text-ink-500">
                {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'ไม่ระบุยี่ห้อ/รุ่น'}
                {' · '}ยางบนรถ {vehicle.mounted_count} เส้น
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <header className="mb-4">
              <p className="text-xl font-semibold text-ink-900">ใส่เลขไมล์ปัจจุบัน</p>
              <p className="mt-0.5 text-sm text-ink-500">
                ไมล์ล่าสุดในระบบ <span className="font-semibold text-ink-700">{formatKm(vehicle.current_mileage)}</span>
              </p>
            </header>
            <div className="space-y-4">
              <Field
                label="เลขไมล์ (กม.)"
                required
                hint={
                  belowCurrent
                    ? undefined
                    : delta !== null && delta > 0
                      ? `วิ่งเพิ่มจากครั้งก่อน ${formatKm(delta)} · ระยะรอบนี้ของยางทุกเส้นบนรถจะเพิ่มเท่านี้`
                      : 'กรอกได้ไม่เกิน 6 หลัก · ต้องไม่น้อยกว่าไมล์ล่าสุดในระบบ'
                }
                error={belowCurrent ? `ต้องไม่น้อยกว่า ${formatKm(vehicle.current_mileage)}` : undefined}
              >
                <div className="relative">
                  <Gauge className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-400" />
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={groupDigits(odometer)}
                    onChange={(e) => setOdometer(sanitizeOdometer(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void save()
                      }
                    }}
                    maxLength={7}
                    autoFocus
                    className="h-16 pl-12 text-2xl font-semibold"
                  />
                </div>
              </Field>

              <Button
                className="h-14 w-full text-lg"
                size="lg"
                disabled={!odometerValid || belowCurrent}
                loading={saving}
                onClick={save}
              >
                <Check className="size-5" />
                บันทึกเลขไมล์
              </Button>
            </div>
          </section>
        </>
      )}

      {/* snackbar ยืนยันบันทึกสำเร็จ */}
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
              <span className="block text-xs text-ink-500">ใส่ทะเบียนรถคันถัดไปได้เลย</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
