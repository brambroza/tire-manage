'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CircleDot, ImagePlus, Pencil, Plus, Power, PowerOff, X } from 'lucide-react'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select,
  Table, TableWrap, Td, Th,
} from '@/components/ui'
import { Modal } from '@/components/ui/modal'
import { TireThumb } from '@/components/tire-thumb'
import {
  createBrand, createModel, deleteTireImage, setBrandActive, setModelActive, updateModel,
  uploadTireImage, type ModelInput,
} from '../actions'
import type { TireBrand } from '@/lib/database.types'

export interface CatalogModel {
  id: string
  brand_id: string
  brand_name: string
  name: string
  size: string | null
  pattern_code: string | null
  image_url: string | null
  is_active: boolean
  created_by_company: string | null
  company_name: string | null
  /** จำนวนยางจริงที่ผูกกับรุ่นนี้ */
  tire_count: number
}

const EMPTY_MODEL: ModelInput = {
  brand_id: '', name: '', size: '', pattern_code: '', image_url: '',
}

/** จัดการข้อมูลยางกลาง: ยี่ห้อ / รุ่น / ขนาด / รหัสดอกยาง */
export function CatalogClient({
  brands,
  models,
}: {
  brands: TireBrand[]
  models: CatalogModel[]
}) {
  const router = useRouter()

  const [brandOpen, setBrandOpen] = React.useState(false)
  const [brandName, setBrandName] = React.useState('')
  const [modelOpen, setModelOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CatalogModel | null>(null)
  const [form, setForm] = React.useState<ModelInput>(EMPTY_MODEL)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [filterBrand, setFilterBrand] = React.useState('')
  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const filteredModels = filterBrand ? models.filter((m) => m.brand_id === filterBrand) : models

  async function handleCreateBrand(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await createBrand(brandName)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setBrandOpen(false)
    setBrandName('')
    router.refresh()
  }

  function openCreateModel() {
    setEditing(null)
    setForm({ ...EMPTY_MODEL, brand_id: brands[0]?.id ?? '' })
    setError(null)
    setFieldErrors({})
    setModelOpen(true)
  }

  function openEditModel(m: CatalogModel) {
    setEditing(m)
    setForm({
      brand_id: m.brand_id,
      name: m.name,
      size: m.size ?? '',
      pattern_code: m.pattern_code ?? '',
      image_url: m.image_url ?? '',
    })
    setError(null)
    setFieldErrors({})
    setModelOpen(true)
  }

  /** อัปโหลดรูปทันทีที่เลือกไฟล์ แล้วเก็บ URL ไว้ในฟอร์ม */
  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    const result = await uploadTireImage(formData)

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (!result.ok) {
      setError(result.error)
      return
    }
    set('image_url', result.data!.url)
  }

  /** เอารูปออกจากรุ่นนี้ (ลบไฟล์ใน storage ด้วยถ้าเป็นรูปที่เพิ่งอัปโหลด) */
  async function handleRemoveImage() {
    const url = form.image_url
    set('image_url', '')
    if (url) await deleteTireImage(url)
  }

  async function handleSubmitModel(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

    const result = editing ? await updateModel(editing.id, form) : await createModel(form)
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    setModelOpen(false)
    router.refresh()
  }

  async function toggleModel(m: CatalogModel) {
    await setModelActive(m.id, !m.is_active)
    router.refresh()
  }

  async function toggleBrand(b: TireBrand) {
    await setBrandActive(b.id, !b.is_active)
    router.refresh()
  }

  const set = <K extends keyof ModelInput>(key: K, value: ModelInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  return (
    <div className="grid gap-4 xl:grid-cols-4">
      {/* ยี่ห้อ */}
      <Card className="xl:col-span-1">
        <CardHeader
          title="ยี่ห้อยาง"
          description={`${brands.length} ยี่ห้อ`}
          action={
            <Button size="sm" variant="secondary" onClick={() => setBrandOpen(true)}>
              <Plus className="size-4" />
              เพิ่ม
            </Button>
          }
        />
        <CardBody className="space-y-1.5">
          <button
            type="button"
            onClick={() => setFilterBrand('')}
            className={`tap-target flex w-full items-center justify-between rounded-xl px-3 text-left text-[15px] transition-colors ${
              filterBrand === '' ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-brand-50'
            }`}
          >
            ทั้งหมด
            <span className="text-sm opacity-80">{models.length}</span>
          </button>
          {brands.map((b) => {
            const count = models.filter((m) => m.brand_id === b.id).length
            return (
              <div key={b.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFilterBrand(b.id)}
                  className={`tap-target flex flex-1 items-center justify-between rounded-xl px-3 text-left text-[15px] transition-colors ${
                    filterBrand === b.id ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-brand-50'
                  }`}
                >
                  <span className="truncate">
                    {b.name}
                    {!b.is_active && <span className="ml-1.5 text-xs opacity-60">(ปิด)</span>}
                  </span>
                  <span className="text-sm opacity-80">{count}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleBrand(b)}
                  aria-label={b.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  {b.is_active ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                </button>
              </div>
            )
          })}
        </CardBody>
      </Card>

      {/* รุ่น */}
      <Card className="xl:col-span-3">
        <CardHeader
          title="รุ่นยาง / ซีรีส์ / รหัสดอกยาง"
          description="ข้อมูลกลางที่นำไปกำหนดสิทธิ์ให้ลูกค้าแต่ละราย"
          action={
            <Button size="sm" onClick={openCreateModel} disabled={brands.length === 0}>
              <Plus className="size-4" />
              เพิ่มรุ่นยาง
            </Button>
          }
        />
        {filteredModels.length === 0 ? (
          <EmptyState
            icon={<CircleDot className="size-6" />}
            title="ยังไม่มีรุ่นยางในแคตตาล็อก"
            description="เพิ่มยี่ห้อก่อน แล้วจึงเพิ่มรุ่นยางในแต่ละยี่ห้อ"
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[760px]">
              <thead>
                <tr>
                  <Th className="w-16">รูป</Th>
                  <Th>ยี่ห้อ</Th>
                  <Th>รุ่น</Th>
                  <Th>ขนาด</Th>
                  <Th>รหัสดอกยาง</Th>
                  <Th className="text-right">ยางในระบบ</Th>
                  <Th>ที่มา</Th>
                  <Th>สถานะ</Th>
                  <Th className="text-right">จัดการ</Th>
                </tr>
              </thead>
              <tbody>
                {filteredModels.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-brand-50/40">
                    <Td>
                      <TireThumb src={m.image_url} alt={`${m.brand_name} ${m.name}`} />
                    </Td>
                    <Td className="font-medium text-ink-900">{m.brand_name}</Td>
                    <Td>{m.name}</Td>
                    <Td>{m.size ?? '-'}</Td>
                    <Td>{m.pattern_code ?? '-'}</Td>
                    <Td className="text-right">{m.tire_count}</Td>
                    <Td>
                      {m.created_by_company
                        ? <Badge tone="amber">ลูกค้าเพิ่มเอง{m.company_name ? ` · ${m.company_name}` : ''}</Badge>
                        : <Badge tone="brand">แคตตาล็อกกลาง</Badge>}
                    </Td>
                    <Td>
                      <Badge tone={m.is_active ? 'emerald' : 'slate'}>
                        {m.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button" onClick={() => openEditModel(m)} aria-label="แก้ไข"
                          className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                        >
                          <Pencil className="size-4.5" />
                        </button>
                        <button
                          type="button" onClick={() => toggleModel(m)}
                          aria-label={m.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-rose-50 hover:text-rose-600"
                        >
                          {m.is_active ? <PowerOff className="size-4.5" /> : <Power className="size-4.5" />}
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {/* modal: ยี่ห้อ */}
      <Modal
        open={brandOpen}
        onClose={() => setBrandOpen(false)}
        title="เพิ่มยี่ห้อยาง"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBrandOpen(false)}>ยกเลิก</Button>
            <Button type="submit" form="brand-form" loading={loading}>เพิ่มยี่ห้อ</Button>
          </>
        }
      >
        <form id="brand-form" onSubmit={handleCreateBrand} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Field label="ชื่อยี่ห้อ" required hint="ระบบจะบันทึกเป็นตัวพิมพ์ใหญ่">
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="MICHELIN" autoFocus />
          </Field>
        </form>
      </Modal>

      {/* modal: รุ่น */}
      <Modal
        open={modelOpen}
        onClose={() => setModelOpen(false)}
        title={editing ? 'แก้ไขรุ่นยาง' : 'เพิ่มรุ่นยาง'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModelOpen(false)}>ยกเลิก</Button>
            <Button type="submit" form="model-form" loading={loading}>
              {editing ? 'บันทึกการแก้ไข' : 'เพิ่มรุ่นยาง'}
            </Button>
          </>
        }
      >
        <form id="model-form" onSubmit={handleSubmitModel} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Field label="ยี่ห้อ" required error={fieldErrors.brand_id}>
            <Select value={form.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="ชื่อรุ่น / ซีรีส์" required error={fieldErrors.name}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="X MULTI Z" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="ขนาด">
              <Input value={form.size ?? ''} onChange={(e) => set('size', e.target.value)} placeholder="295/80R22.5" />
            </Field>
            <Field label="รหัสดอกยาง">
              <Input
                value={form.pattern_code ?? ''}
                onChange={(e) => set('pattern_code', e.target.value)}
                placeholder="MZ-295"
              />
            </Field>
          </div>

          <Field
            label="รูปยาง"
            hint="รองรับ JPG, PNG, WebP, AVIF ขนาดไม่เกิน 3 MB — รูปนี้จะแสดงตอนช่างเลือกยางและในแดชบอร์ด"
          >
            <div className="flex items-center gap-4">
              <TireThumb src={form.image_url} alt="ตัวอย่างรูปยาง" size="xl" />
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  onChange={handlePickImage}
                  className="hidden"
                  id="tire-image-input"
                />
                <Button
                  type="button"
                  variant="secondary"
                  loading={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="size-4.5" />
                  {form.image_url ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
                </Button>
                {form.image_url && (
                  <Button type="button" variant="ghost" onClick={handleRemoveImage}>
                    <X className="size-4.5" />
                    เอารูปออก
                  </Button>
                )}
              </div>
            </div>
          </Field>
        </form>
      </Modal>
    </div>
  )
}
