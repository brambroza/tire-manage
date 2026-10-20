'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CircleDot, ImagePlus, Lock, Pencil, Plus, Power, PowerOff, X } from 'lucide-react'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select,
  Table, TableWrap, Td, Th,
} from '@/components/ui'
import { Modal } from '@/components/ui/modal'
import { TireThumb } from '@/components/tire-thumb'
import { TireSpec } from '@/components/tire-spec'
import { cn, toUpperText } from '@/lib/utils'
import { tireSizeLabel } from '@/lib/tire-display'
import {
  createOwnBrand, createOwnModel, deleteOwnTireImage, setOwnBrandActive, setOwnModelActive,
  updateOwnModel, uploadOwnTireImage, type OwnModelInput,
} from './actions'
import type { TireBrand } from '@/lib/database.types'

export interface CompanyCatalogModel {
  id: string
  brand_id: string
  brand_name: string
  name: string
  size: string | null
  pattern_code: string | null
  image_url: string | null
  is_active: boolean
  /** true = บริษัทนี้สร้างเอง (แก้ไขได้) / false = จากแคตตาล็อกกลาง (ดูได้อย่างเดียว) */
  is_own: boolean
  /** จำนวนยางของบริษัทที่ผูกกับรุ่นนี้ */
  tire_count: number
}

const EMPTY_MODEL: OwnModelInput = { brand_id: '', name: '', size: '', image_url: '' }

/**
 * รวมขนาดยางกับชื่อรุ่นไว้ในบรรทัดเดียวสำหรับแสดงเป็นข้อมูลหลัก
 * @param model รุ่นยาง
 * @returns ข้อความเช่น "295/80R22.5 X MULTI Z"
 */
const sizeWithModel = (model: CompanyCatalogModel) =>
  [tireSizeLabel(model.size), model.name.trim()].filter(Boolean).join(' ')

/**
 * ข้อมูลยางฝั่งแอดมินบริษัท: ยี่ห้อ / รุ่น / ขนาด / รูป (ไม่มีดอกยางตอนใหม่ — super admin กำหนด)
 * รายการจากแคตตาล็อกกลางแสดงอย่างเดียว ปุ่มแก้ไข/ปิดใช้งานขึ้นเฉพาะรายการที่บริษัทสร้างเอง
 */
export function CompanyCatalogClient({
  brands,
  models,
  companyId,
  canManage,
  lockedMessage,
  readOnly = false,
}: {
  brands: TireBrand[]
  models: CompanyCatalogModel[]
  companyId: string
  /** แพ็กเกจเปิดสิทธิ์เพิ่ม/แก้รายการของบริษัทเอง */
  canManage: boolean
  /** ข้อความแจ้งเมื่อแพ็กเกจยังไม่เปิด */
  lockedMessage: string
  /** true = แสดงอย่างเดียว ซ่อนปุ่มเพิ่ม/แก้ และแถบแจ้งแพ็กเกจ (หน้าข้อมูลยางของลูกค้าตอนนี้) */
  readOnly?: boolean
}) {
  const router = useRouter()

  const [brandOpen, setBrandOpen] = React.useState(false)
  const [brandName, setBrandName] = React.useState('')
  const [modelOpen, setModelOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CompanyCatalogModel | null>(null)
  const [form, setForm] = React.useState<OwnModelInput>(EMPTY_MODEL)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [filterBrand, setFilterBrand] = React.useState('')
  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  /** ยี่ห้อที่ให้เลือกตอนเพิ่มรุ่น — เฉพาะที่ยังเปิดใช้งาน */
  const activeBrands = brands.filter((b) => b.is_active)
  const filteredModels = filterBrand ? models.filter((m) => m.brand_id === filterBrand) : models
  const ownCount = models.filter((m) => m.is_own).length

  const set = <K extends keyof OwnModelInput>(key: K, value: OwnModelInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleCreateBrand(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await createOwnBrand(brandName)
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
    setForm({ ...EMPTY_MODEL, brand_id: activeBrands[0]?.id ?? '' })
    setError(null)
    setFieldErrors({})
    setModelOpen(true)
  }

  function openEditModel(m: CompanyCatalogModel) {
    setEditing(m)
    setForm({ brand_id: m.brand_id, name: m.name, size: m.size ?? '', image_url: m.image_url ?? '' })
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
    const result = await uploadOwnTireImage(formData)

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (!result.ok) {
      setError(result.error)
      return
    }
    set('image_url', result.data!.url)
  }

  /** เอารูปออกจากรุ่นนี้ (ลบไฟล์ใน storage ด้วยถ้าเป็นรูปของบริษัทเอง) */
  async function handleRemoveImage() {
    const url = form.image_url
    set('image_url', '')
    if (url) await deleteOwnTireImage(url)
  }

  async function handleSubmitModel(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

    const result = editing ? await updateOwnModel(editing.id, form) : await createOwnModel(form)
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    setModelOpen(false)
    router.refresh()
  }

  async function toggleModel(m: CompanyCatalogModel) {
    setActionError(null)
    const result = await setOwnModelActive(m.id, !m.is_active)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    router.refresh()
  }

  async function toggleBrand(b: TireBrand) {
    setActionError(null)
    const result = await setOwnBrandActive(b.id, !b.is_active)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    router.refresh()
  }

  const isOwnBrand = (b: TireBrand) => b.created_by_company === companyId

  return (
    <div className="space-y-4">
      {!canManage && !readOnly && (
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>{lockedMessage}</span>
        </div>
      )}
      {actionError && (
        <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-4">
        {/* ยี่ห้อ */}
        <Card className="xl:col-span-1">
          <CardHeader
            title="ยี่ห้อยาง"
            description={`${brands.length} ยี่ห้อ`}
            action={
              readOnly ? undefined : (
                <Button size="sm" variant="secondary" onClick={() => setBrandOpen(true)} disabled={!canManage}>
                  <Plus className="size-4" />
                  เพิ่ม
                </Button>
              )
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
                  {/* ปิด/เปิดได้เฉพาะยี่ห้อที่บริษัทสร้างเอง */}
                  {canManage && isOwnBrand(b) && (
                    <button
                      type="button"
                      onClick={() => toggleBrand(b)}
                      aria-label={b.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      {b.is_active ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                    </button>
                  )}
                </div>
              )
            })}
          </CardBody>
        </Card>

        {/* รุ่น */}
        <Card className="xl:col-span-3">
          <CardHeader
            title="รุ่นยาง / ซีรีส์"
            description={
              ownCount > 0
                ? `${models.length} รุ่นที่ใช้ได้ · บริษัทเพิ่มเอง ${ownCount} รุ่น`
                : `${models.length} รุ่นที่ใช้ได้จากแคตตาล็อกกลาง`
            }
            action={
              readOnly ? undefined : (
                <Button size="sm" onClick={openCreateModel} disabled={!canManage || activeBrands.length === 0}>
                  <Plus className="size-4" />
                  เพิ่มรุ่นยาง
                </Button>
              )
            }
          />
          {filteredModels.length === 0 ? (
            <EmptyState
              icon={<CircleDot className="size-6" />}
              title="ยังไม่มีรุ่นยางที่ใช้ได้"
              description={
                canManage && !readOnly
                  ? 'เพิ่มรุ่นยางของบริษัทได้เลย หรือแจ้ง Dreammaker เปิดสิทธิ์รุ่นจากแคตตาล็อกกลาง'
                  : 'แจ้ง Dreammaker เปิดสิทธิ์รุ่นยางจากแคตตาล็อกกลางให้บริษัท'
              }
            />
          ) : (
            <TableWrap>
              <Table className="min-w-[760px]">
                <thead>
                  <tr>
                    <Th className="w-16">รูป</Th>
                    <Th>ขนาด รุ่น / ยี่ห้อ</Th>
                    {!readOnly && <Th>ที่มา</Th>}
                    <Th className="text-right">ยางในคลัง</Th>
                    {!readOnly && <Th>สถานะ</Th>}
                    {!readOnly && <Th className="text-right">จัดการ</Th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredModels.map((m) => (
                    <tr key={m.id} className="transition-colors hover:bg-brand-50/40">
                      <Td>
                        <TireThumb src={m.image_url} alt={`${m.brand_name} ${m.name}`} />
                      </Td>
                      <Td>
                        <TireSpec size={sizeWithModel(m)} brandName={m.brand_name} />
                      </Td>
                      {!readOnly && (
                        <Td>
                          {m.is_own
                            ? <Badge tone="slate">ของบริษัท</Badge>
                            : <Badge tone="brand">แคตตาล็อกกลาง</Badge>}
                        </Td>
                      )}
                      <Td className="text-right">{m.tire_count}</Td>
                      {!readOnly && (
                        <>
                          <Td>
                            <Badge tone={m.is_active ? 'emerald' : 'slate'}>
                              {m.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                            </Badge>
                          </Td>
                          <Td>
                            {canManage && m.is_own ? (
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
                            ) : (
                              <span className={cn('block text-right text-xs text-ink-400')}>
                                {m.is_own ? '—' : 'ดูอย่างเดียว'}
                              </span>
                            )}
                          </Td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>

      {/* modal: ยี่ห้อ */}
      <Modal
        open={brandOpen}
        onClose={() => setBrandOpen(false)}
        title="เพิ่มยี่ห้อยางของบริษัท"
        description="ยี่ห้อที่เพิ่มเองจะเห็นเฉพาะบริษัทคุณ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBrandOpen(false)}>ยกเลิก</Button>
            <Button type="submit" form="own-brand-form" loading={loading}>เพิ่มยี่ห้อ</Button>
          </>
        }
      >
        <form id="own-brand-form" onSubmit={handleCreateBrand} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Field label="ชื่อยี่ห้อ" required hint="บันทึกเป็นตัวพิมพ์ใหญ่ทั้งหมด">
            <Input
              value={brandName}
              onChange={(e) => setBrandName(toUpperText(e.target.value))}
              placeholder="MICHELIN"
              autoCapitalize="characters"
              className="uppercase"
              autoFocus
            />
          </Field>
        </form>
      </Modal>

      {/* modal: รุ่น */}
      <Modal
        open={modelOpen}
        onClose={() => setModelOpen(false)}
        size="lg"
        title={editing ? 'แก้ไขรุ่นยาง' : 'เพิ่มรุ่นยางของบริษัท'}
        description={editing ? undefined : 'รุ่นที่เพิ่มเองจะขึ้นให้เลือกในคลังยาง หน้าช่าง และไฟล์นำเข้า'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModelOpen(false)}>ยกเลิก</Button>
            <Button type="submit" form="own-model-form" loading={loading}>
              {editing ? 'บันทึกการแก้ไข' : 'เพิ่มรุ่นยาง'}
            </Button>
          </>
        }
      >
        <form id="own-model-form" onSubmit={handleSubmitModel} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Field label="ขนาด">
            <Input
              value={form.size ?? ''}
              onChange={(e) => set('size', e.target.value)}
              placeholder="295/80R22.5"
            />
          </Field>
          <Field label="ยี่ห้อ" required error={fieldErrors.brand_id}>
            <Select value={form.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
              {activeBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="ชื่อรุ่น / ซีรีส์" required error={fieldErrors.name}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="X MULTI Z" />
          </Field>

          <Field
            label="รูปยาง"
            hint="JPG, PNG, WebP หรือ AVIF ไม่เกิน 3 MB ช่างจะเห็นรูปนี้ตอนเลือกยาง"
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
                  id="own-tire-image-input"
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
