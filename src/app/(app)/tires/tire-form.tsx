'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { TireThumb } from '@/components/tire-thumb'
import { tireSpecLabel } from '@/lib/tire-display'
import { cn, SERIAL_MAX, sanitizeSerial } from '@/lib/utils'
import { createTire, ensureBrandModel, updateTire, type TireInput } from './actions'
import type { Tire } from '@/lib/database.types'

export interface ModelOption {
  id: string
  brand: string
  model: string
  size: string | null
  pattern_code: string | null
  new_tread_mm: number | null
  image_url: string | null
}

const EMPTY: TireInput = {
  serial_no: '',
  tire_model_id: '',
  brand_name: '',
  model_name: '',
  size: '',
  dot: '',
  new_tread_mm: 16,
  tread_mm: null,
  purchase_price: null,
  note: '',
}

/**
 * ฟอร์มเพิ่ม/แก้ไขยาง
 * รองรับทั้งเลือกรุ่นจากแคตตาล็อกที่ super admin กำหนดให้ และพิมพ์ยี่ห้อ/รุ่นเองกรณียังไม่มีในระบบ
 */
export function TireFormModal({
  open,
  onClose,
  tire,
  models,
  onCreated,
  companyId,
}: {
  open: boolean
  onClose: () => void
  tire?: Tire | null
  models: ModelOption[]
  onCreated?: (tireId: string) => void
  /** ระบุเมื่อ super admin เพิ่มยางแทนลูกค้า */
  companyId?: string
}) {
  const router = useRouter()
  const [form, setForm] = React.useState<TireInput>(EMPTY)
  const [manual, setManual] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const isSuperAdmin = companyId !== undefined

  // รีเซ็ตค่าในฟอร์มเมื่อเปิด modal ใหม่ (ปรับ state ระหว่าง render ตามแนวทางของ React)
  const formKey = open ? tire?.id ?? 'new' : null
  const [activeKey, setActiveKey] = React.useState<string | null>(null)
  if (formKey !== activeKey) {
    setActiveKey(formKey)
    setError(null)
    setFieldErrors({})
    // โหมดพิมพ์เองเปิดให้เฉพาะ super admin — ลูกค้าเลือกได้จากแคตตาล็อกที่เปิดสิทธิ์เท่านั้น
    setManual(isSuperAdmin && Boolean(tire && !tire.tire_model_id))
    setForm(
      tire
        ? {
            serial_no: tire.serial_no,
            tire_model_id: tire.tire_model_id ?? '',
            brand_name: tire.brand_name ?? '',
            model_name: tire.model_name ?? '',
            size: tire.size ?? '',
            dot: tire.dot ?? '',
            new_tread_mm: tire.new_tread_mm,
            tread_mm: tire.tread_mm,
            purchase_price: tire.purchase_price,
            note: tire.note ?? '',
          }
        : EMPTY,
    )
  }

  const set = <K extends keyof TireInput>(key: K, value: TireInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const selectedModel = models.find((m) => m.id === form.tire_model_id) ?? null

  function pickModel(id: string) {
    const m = models.find((x) => x.id === id)
    setForm((f) => ({
      ...f,
      tire_model_id: id,
      brand_name: m?.brand ?? '',
      model_name: m?.model ?? '',
      size: m?.size ?? '',
      new_tread_mm: m?.new_tread_mm ?? EMPTY.new_tread_mm,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

    let payload = { ...form }

    // พิมพ์ยี่ห้อเอง → สร้างยี่ห้อ/รุ่นใหม่ให้อัตโนมัติ แล้วผูก tire_model_id
    if (manual && payload.brand_name?.trim()) {
      const ensured = await ensureBrandModel(
        payload.brand_name,
        payload.model_name || null,
        payload.size || null,
        companyId,
      )
      if (!ensured.ok) {
        setLoading(false)
        setError(ensured.error)
        return
      }
      payload = { ...payload, tire_model_id: ensured.data?.modelId ?? '' }
    }

    const result = tire
      ? await updateTire(tire.id, payload)
      : await createTire(payload, companyId)
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    if (!tire && result.data?.id) onCreated?.(result.data.id)
    onClose()
    router.refresh()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={tire ? 'แก้ไขข้อมูลยาง' : 'เพิ่มยางเข้าคลัง'}
      description={tire ? `เลขยาง ${tire.serial_no}` : 'ยางที่เพิ่มใหม่จะอยู่ในสถานะ “อยู่ในคลัง”'}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" form="tire-form" loading={loading}>
            {tire ? 'บันทึกการแก้ไข' : 'เพิ่มยาง'}
          </Button>
        </>
      }
    >
      <form id="tire-form" onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Field
          label="เลขยาง (ซีเรียล)"
          required
          hint="ตัวเลขและตัวอักษรภาษาอังกฤษเท่านั้น (ระบบแปลงเป็นตัวพิมพ์ใหญ่ให้)"
          error={fieldErrors.serial_no}
        >
          <Input
            value={form.serial_no}
            onChange={(e) => set('serial_no', sanitizeSerial(e.target.value))}
            placeholder="T29580R225010"
            maxLength={SERIAL_MAX}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="uppercase"
            autoFocus
          />
        </Field>

        {/* สลับโหมดเลือกจากแคตตาล็อก / พิมพ์เอง — เฉพาะ super admin เพื่อกันลูกค้าสร้างยี่ห้อ/รุ่นลงฐานข้อมูลเอง */}
        {isSuperAdmin && (
          <div className="inline-flex rounded-xl bg-brand-50 p-1">
            {[
              { key: false, label: 'เลือกจากแคตตาล็อก' },
              { key: true, label: 'พิมพ์ยี่ห้อ/รุ่นเอง' },
            ].map((tab) => (
              <button
                key={String(tab.key)}
                type="button"
                onClick={() => setManual(tab.key)}
                className={cn(
                  'tap-target rounded-lg px-4 text-sm font-medium transition-colors',
                  manual === tab.key ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ยางเดิมที่บันทึกยี่ห้อ/รุ่นแบบพิมพ์เองไว้ก่อนปิดโหมดนี้ — โชว์ค่าเดิมให้ลูกค้าเห็นว่าเป็นอะไร */}
        {!isSuperAdmin && tire && !tire.tire_model_id && !form.tire_model_id && (
          <p className="rounded-xl bg-surface-alt px-4 py-3 text-sm text-ink-600 ring-1 ring-inset ring-line">
            ข้อมูลเดิม: {tireSpecLabel({ size: tire.size, brandName: tire.brand_name, modelName: tire.model_name })}
            {' '}— เลือกรุ่นจากแคตตาล็อกด้านล่างเพื่อเปลี่ยน หรือเว้นไว้เพื่อคงค่าเดิม
          </p>
        )}

        {manual ? (
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="ขนาด">
              <Input
                value={form.size ?? ''}
                onChange={(e) => set('size', e.target.value)}
                placeholder="295/80R22.5"
              />
            </Field>
            <Field label="ยี่ห้อ" required error={fieldErrors.brand_name}>
              <Input
                value={form.brand_name ?? ''}
                onChange={(e) => set('brand_name', e.target.value)}
                placeholder="MICHELIN"
              />
            </Field>
            <Field label="รุ่น">
              <Input
                value={form.model_name ?? ''}
                onChange={(e) => set('model_name', e.target.value)}
                placeholder="X MULTI Z"
              />
            </Field>
          </div>
        ) : (
          <div className="flex items-end gap-4">
            <Field
              label="ขนาด / ยี่ห้อ รุ่น"
              hint={
                models.length === 0
                  ? isSuperAdmin
                    ? 'ยังไม่มีรุ่นยางที่เปิดสิทธิ์ให้บริษัทนี้ — ใช้โหมดพิมพ์เองได้'
                    : 'ยังไม่มีรุ่นยางที่เปิดสิทธิ์ให้บริษัทนี้ — แจ้งผู้ดูแลระบบให้เปิดสิทธิ์'
                  : selectedModel
                    ? `ดอกยางตอนใหม่จากแคตตาล็อก: ${selectedModel.new_tread_mm ?? EMPTY.new_tread_mm} มม.`
                    : undefined
              }
              className="flex-1"
            >
              <Select value={form.tire_model_id ?? ''} onChange={(e) => pickModel(e.target.value)}>
                <option value="">— เลือกรุ่นยาง —</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {tireSpecLabel({ size: m.size, brandName: m.brand, modelName: m.model })}
                    {m.pattern_code ? ` · ${m.pattern_code}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <TireThumb
              src={selectedModel?.image_url}
              alt={selectedModel ? `${selectedModel.brand} ${selectedModel.model}` : undefined}
              size="lg"
              className="mb-0.5"
            />
          </div>
        )}

        <div className={cn('grid gap-5 sm:grid-cols-2', isSuperAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
          <Field label="DOT">
            <Input value={form.dot ?? ''} onChange={(e) => set('dot', e.target.value)} placeholder="2323" />
          </Field>
          {isSuperAdmin ? (
            <Field label="ดอกยางตอนใหม่ (มม.)">
              <Input
                type="number" inputMode="decimal" step="0.1" min={0}
                value={form.new_tread_mm ?? ''}
                onChange={(e) => set('new_tread_mm', e.target.value === '' ? null : Number(e.target.value))}
              />
            </Field>
          ) : null}
          <Field label="ดอกยางปัจจุบัน (มม.)">
            <Input
              type="number" inputMode="decimal" step="0.1" min={0}
              value={form.tread_mm ?? ''}
              onChange={(e) => set('tread_mm', e.target.value === '' ? null : Number(e.target.value))}
            />
          </Field>
          <Field label="ราคาซื้อ (บาท)">
            <Input
              type="number" inputMode="decimal" step="0.01" min={0}
              value={form.purchase_price ?? ''}
              onChange={(e) => set('purchase_price', e.target.value === '' ? null : Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="หมายเหตุ">
          <Textarea value={form.note ?? ''} onChange={(e) => set('note', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
