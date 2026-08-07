'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, GitBranch, Pencil, Plus, Power, PowerOff, Trash2, X,
} from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, Field, Input, Select, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { ConfirmDialog, Modal } from '@/components/ui/modal'
import { WheelDiagram } from '@/components/wheel-diagram'
import { getLayout } from '@/lib/axle-layouts'
import { VEHICLE_IMAGES } from '@/lib/vehicle-images'
import { cn } from '@/lib/utils'
import {
  createAxleType,
  deleteAxleType,
  setAxleTypeActive,
  updateAxleType,
  type AxleTypeInput,
} from '../actions'
import type { AxleCategory, AxleKind, AxleType } from '@/lib/database.types'

export interface AxleTypeRow extends AxleType {
  usage_count: number
}

const EMPTY: AxleTypeInput = {
  code: '',
  name: '',
  axle_kinds: ['single', 'dual', 'dual'],
  category: 'head',
  image_url: '',
  sort_order: 0,
}

const KIND_LABEL: Record<AxleKind, string> = {
  single: 'ล้อเดี่ยว (2 ล้อ)',
  dual: 'ล้อคู่ (4 ล้อ)',
}

const CATEGORY_LABEL: Record<AxleCategory, string> = {
  head: 'หัว',
  trailer: 'หาง',
}

/** CRUD ประเภทเพลา พร้อมตัวแก้ผังแบบเรียงเพลาหน้าไปหลัง */
export function AxleTypesClient({ axleTypes }: { axleTypes: AxleTypeRow[] }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AxleTypeRow | null>(null)
  const [deleting, setDeleting] = React.useState<AxleTypeRow | null>(null)
  const [form, setForm] = React.useState<AxleTypeInput>(EMPTY)
  const [loading, setLoading] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pageError, setPageError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  const layoutLocked = Boolean(editing?.usage_count)
  const previewCode = form.code.trim().toUpperCase() || 'PREVIEW'
  const previewSource = [{
    code: previewCode,
    name: form.name.trim() || 'ตัวอย่างประเภทเพลา',
    axle_kinds: form.axle_kinds,
  }]
  const previewLayout = getLayout(previewCode, previewSource)

  function openCreate() {
    const nextOrder = axleTypes.reduce((max, type) => Math.max(max, type.sort_order), 0) + 1
    setEditing(null)
    setForm({ ...EMPTY, axle_kinds: [...EMPTY.axle_kinds], sort_order: nextOrder })
    setError(null)
    setFieldErrors({})
    setOpen(true)
  }

  function openEdit(type: AxleTypeRow) {
    setEditing(type)
    setForm({
      code: type.code,
      name: type.name,
      axle_kinds: [...type.axle_kinds],
      category: type.category,
      image_url: type.image_url ?? '',
      sort_order: type.sort_order,
    })
    setError(null)
    setFieldErrors({})
    setOpen(true)
  }

  const set = <K extends keyof AxleTypeInput>(key: K, value: AxleTypeInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  function setAxleKind(index: number, value: AxleKind) {
    setForm((current) => ({
      ...current,
      axle_kinds: current.axle_kinds.map((kind, i) => (i === index ? value : kind)),
    }))
  }

  function addAxle() {
    setForm((current) => ({
      ...current,
      axle_kinds: [...current.axle_kinds, 'dual'],
    }))
  }

  function removeAxle(index: number) {
    setForm((current) => ({
      ...current,
      axle_kinds: current.axle_kinds.filter((_, i) => i !== index),
    }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

    const result = editing
      ? await updateAxleType(editing.id, form)
      : await createAxleType(form)
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    setOpen(false)
    router.refresh()
  }

  async function toggleActive(type: AxleTypeRow) {
    setBusyId(type.id)
    setPageError(null)
    const result = await setAxleTypeActive(type.id, !type.is_active)
    setBusyId(null)

    if (!result.ok) setPageError(result.error)
    else router.refresh()
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusyId(deleting.id)
    setPageError(null)
    const result = await deleteAxleType(deleting.id)
    setBusyId(null)
    setDeleting(null)

    if (!result.ok) setPageError(result.error)
    else router.refresh()
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4.5" />
          เพิ่มประเภทเพลา
        </Button>
      </div>

      {pageError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{pageError}</span>
        </div>
      )}

      <Card>
        {axleTypes.length === 0 ? (
          <EmptyState
            icon={<GitBranch className="size-6" />}
            title="ยังไม่มีประเภทเพลา"
            description="เพิ่มประเภทเพลาเพื่อให้แอดมินเลือกใช้ตอนเพิ่มรถ"
            action={<Button onClick={openCreate}><Plus className="size-4.5" />เพิ่มประเภทเพลา</Button>}
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[820px]">
              <thead>
                <tr>
                  <Th className="w-20 text-center">ลำดับ</Th>
                  <Th>รหัส</Th>
                  <Th>ประเภท</Th>
                  <Th>ชื่อประเภทเพลา</Th>
                  <Th className="w-24">รูป</Th>
                  <Th>รูปแบบเพลา</Th>
                  <Th className="text-center">จำนวนล้อ</Th>
                  <Th className="text-center">รถที่ใช้</Th>
                  <Th>สถานะ</Th>
                  <Th className="text-right">จัดการ</Th>
                </tr>
              </thead>
              <tbody>
                {axleTypes.map((type) => {
                  const layout = getLayout(type.code, axleTypes)
                  return (
                    <tr key={type.id} className="transition-colors hover:bg-brand-50/40">
                      <Td className="text-center text-ink-400">{type.sort_order}</Td>
                      <Td><Badge tone="brand">{type.code}</Badge></Td>
                      <Td>
                        <Badge tone={type.category === 'trailer' ? 'amber' : 'slate'}>
                          {CATEGORY_LABEL[type.category]}
                        </Badge>
                      </Td>
                      <Td className="font-medium text-ink-900">{type.name}</Td>
                      <Td>
                        {type.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={type.image_url}
                            alt={type.name}
                            className="h-10 w-20 rounded-lg object-contain"
                          />
                        ) : (
                          <span className="text-xs text-ink-400">ไม่มีรูป</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-sm text-ink-500">
                        {type.axle_kinds.map((kind) => kind === 'single' ? 'เดี่ยว' : 'คู่').join(' · ')}
                      </Td>
                      <Td className="text-center">{layout.wheelCount}</Td>
                      <Td className="text-center">{type.usage_count}</Td>
                      <Td>
                        <Badge tone={type.is_active ? 'emerald' : 'slate'}>
                          {type.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(type)}
                            aria-label={`แก้ไข ${type.name}`}
                            className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                          >
                            <Pencil className="size-4.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(type)}
                            disabled={busyId === type.id}
                            aria-label={type.is_active ? `ปิดใช้งาน ${type.name}` : `เปิดใช้งาน ${type.name}`}
                            className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50"
                          >
                            {type.is_active ? <PowerOff className="size-4.5" /> : <Power className="size-4.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(type)}
                            disabled={type.usage_count > 0 || busyId === type.id}
                            title={type.usage_count > 0 ? 'มีรถใช้งานอยู่ จึงลบไม่ได้' : 'ลบประเภทเพลา'}
                            aria-label={`ลบ ${type.name}`}
                            className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Trash2 className="size-4.5" />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? 'แก้ไขประเภทเพลา' : 'เพิ่มประเภทเพลา'}
        description="เรียงรูปแบบเพลาจากหน้ารถไปหลังรถ"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button type="submit" form="axle-type-form" loading={loading}>
              {editing ? 'บันทึกการแก้ไข' : 'เพิ่มประเภทเพลา'}
            </Button>
          </>
        }
      >
        <form id="axle-type-form" onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="รหัส" required error={fieldErrors.code}>
              <Input
                value={form.code}
                onChange={(event) => set('code', event.target.value.toUpperCase())}
                placeholder="10W"
                maxLength={30}
              />
            </Field>
            <Field label="ชื่อประเภทเพลา" required error={fieldErrors.name} className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder="รถ 10 ล้อ (หน้าเดี่ยว หลังคู่ 2 เพลา)"
              />
            </Field>
          </div>

          <Field
            label="ประเภทรถ"
            required
            error={fieldErrors.category}
            hint="ช่างจะเลือกหมวดนี้ก่อน แล้วจึงเห็นเฉพาะประเภทเพลาในหมวดที่เลือก"
          >
            <div className="flex gap-2">
              {(Object.keys(CATEGORY_LABEL) as AxleCategory[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('category', value)}
                  className={cn(
                    'h-12 flex-1 rounded-xl border text-base font-semibold transition-all active:scale-[0.98]',
                    form.category === value
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-line bg-white text-ink-700 hover:border-brand-300 hover:bg-brand-50',
                  )}
                >
                  {CATEGORY_LABEL[value]}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="รูปผังล้อสำหรับช่าง"
            error={fieldErrors.image_url}
            hint="ช่างเห็นรูปนี้ตอนเลือกตำแหน่งล้อ — เว้นว่างได้ถ้ายังไม่มีรูป"
          >
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => set('image_url', '')}
                className={cn(
                  'flex h-24 items-center justify-center rounded-xl border text-sm font-medium transition-all',
                  !form.image_url
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-line bg-white text-ink-500 hover:border-brand-300',
                )}
              >
                ไม่ใช้รูป
              </button>
              {VEHICLE_IMAGES.map((image) => (
                <button
                  key={image.url}
                  type="button"
                  onClick={() => set('image_url', image.url)}
                  className={cn(
                    'overflow-hidden rounded-xl border bg-white transition-all',
                    form.image_url === image.url
                      ? 'border-brand-600 ring-2 ring-brand-200'
                      : 'border-line hover:border-brand-300',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.label} className="h-20 w-full object-contain" />
                  <span className="block truncate px-2 pb-1.5 text-xs text-ink-500">{image.label}</span>
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink-700">
                    รูปแบบเพลา <span className="text-rose-500">*</span>
                  </p>
                  <p className="text-xs text-ink-400">เพลา 1 คือเพลาหน้าสุด</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={addAxle}
                  disabled={layoutLocked || form.axle_kinds.length >= 8}
                >
                  <Plus className="size-4" /> เพิ่มเพลา
                </Button>
              </div>

              <div className="space-y-2">
                {form.axle_kinds.map((kind, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-xl border border-line bg-slate-50/60 p-2.5">
                    <span className="w-16 shrink-0 text-sm font-medium text-ink-600">เพลา {index + 1}</span>
                    <Select
                      value={kind}
                      onChange={(event) => setAxleKind(index, event.target.value as AxleKind)}
                      disabled={layoutLocked}
                      className="bg-white"
                    >
                      {Object.entries(KIND_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => removeAxle(index)}
                      disabled={layoutLocked || form.axle_kinds.length === 1}
                      aria-label={`ลบเพลา ${index + 1}`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                    >
                      <X className="size-4.5" />
                    </button>
                  </div>
                ))}
              </div>
              {fieldErrors.axle_kinds && <p className="mt-1.5 text-sm text-rose-600">{fieldErrors.axle_kinds}</p>}
              {layoutLocked && (
                <p className="mt-2 text-sm text-amber-700">
                  มีรถใช้งานประเภทนี้ {editing?.usage_count} คัน จึงล็อกรูปแบบเพลาเพื่อรักษาตำแหน่งยางเดิม
                </p>
              )}
            </div>

            <Field label="ลำดับแสดงผล" required error={fieldErrors.sort_order}>
              <Input
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(event) => set('sort_order', Number(event.target.value))}
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink-700">ตัวอย่างผังล้อ</p>
              <Badge tone="brand">{previewLayout.wheelCount} ล้อ · {form.axle_kinds.length} เพลา</Badge>
            </div>
            <WheelDiagram axleType={previewCode} axleTypes={previewSource} slots={{}} mode="view" />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={Boolean(deleting && busyId === deleting.id)}
        title="ลบประเภทเพลานี้?"
        confirmLabel="ลบประเภทเพลา"
        message={
          <>ประเภท “{deleting?.name}” จะถูกลบถาวร และจะไม่แสดงเป็นตัวเลือกตอนเพิ่มรถ</>
        }
      />
    </>
  )
}
