'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Pencil, Plus, Power, PowerOff, SlidersHorizontal } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, Field, Input, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { Modal } from '@/components/ui/modal'
import { createReason, setReasonActive, updateReason, type ReasonInput } from '../actions'
import type { RemovalReason } from '@/lib/database.types'

const EMPTY: ReasonInput = { code: '', name: '', is_scrap: false, sort_order: 0 }

/** ตั้งค่าสาเหตุการถอดยางที่ช่างจะเลือกได้หน้างาน */
export function ReasonsClient({ reasons }: { reasons: RemovalReason[] }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<RemovalReason | null>(null)
  const [form, setForm] = React.useState<ReasonInput>(EMPTY)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY, sort_order: reasons.length + 1 })
    setError(null)
    setFieldErrors({})
    setOpen(true)
  }

  function openEdit(r: RemovalReason) {
    setEditing(r)
    setForm({ code: r.code, name: r.name, is_scrap: r.is_scrap, sort_order: r.sort_order })
    setError(null)
    setFieldErrors({})
    setOpen(true)
  }

  const set = <K extends keyof ReasonInput>(key: K, value: ReasonInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

    const result = editing ? await updateReason(editing.id, form) : await createReason(form)
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    setOpen(false)
    router.refresh()
  }

  async function toggle(r: RemovalReason) {
    await setReasonActive(r.id, !r.is_active)
    router.refresh()
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4.5" />
          เพิ่มสาเหตุ
        </Button>
      </div>

      <Card>
        {reasons.length === 0 ? (
          <EmptyState
            icon={<SlidersHorizontal className="size-6" />}
            title="ยังไม่มีสาเหตุการถอดยาง"
            action={<Button onClick={openCreate}><Plus className="size-4.5" />เพิ่มสาเหตุ</Button>}
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[640px]">
              <thead>
                <tr>
                  <Th className="w-20 text-center">ลำดับ</Th>
                  <Th>รหัส</Th>
                  <Th>ชื่อสาเหตุ</Th>
                  <Th>ผลต่อยาง</Th>
                  <Th>สถานะ</Th>
                  <Th className="text-right">จัดการ</Th>
                </tr>
              </thead>
              <tbody>
                {reasons.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-brand-50/40">
                    <Td className="text-center text-ink-400">{r.sort_order}</Td>
                    <Td><Badge tone="slate">{r.code}</Badge></Td>
                    <Td className="font-medium text-ink-900">{r.name}</Td>
                    <Td>
                      {r.is_scrap
                        ? <Badge tone="rose">ตัดจำหน่ายอัตโนมัติ</Badge>
                        : <Badge tone="emerald">กลับเข้าคลัง</Badge>}
                    </Td>
                    <Td>
                      <Badge tone={r.is_active ? 'emerald' : 'slate'}>
                        {r.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button" onClick={() => openEdit(r)} aria-label="แก้ไข"
                          className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                        >
                          <Pencil className="size-4.5" />
                        </button>
                        <button
                          type="button" onClick={() => toggle(r)}
                          aria-label={r.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-rose-50 hover:text-rose-600"
                        >
                          {r.is_active ? <PowerOff className="size-4.5" /> : <Power className="size-4.5" />}
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'แก้ไขสาเหตุการถอดยาง' : 'เพิ่มสาเหตุการถอดยาง'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button type="submit" form="reason-form" loading={loading}>
              {editing ? 'บันทึกการแก้ไข' : 'เพิ่มสาเหตุ'}
            </Button>
          </>
        }
      >
        <form id="reason-form" onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="รหัส" required error={fieldErrors.code}>
              <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="WORN_OUT" />
            </Field>
            <Field label="ชื่อสาเหตุ" required error={fieldErrors.name} className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="หมดดอกยาง" />
            </Field>
          </div>

          <Field label="ลำดับการแสดงผล" required>
            <Input
              type="number" min={0} value={form.sort_order}
              onChange={(e) => set('sort_order', Number(e.target.value))}
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 hover:bg-brand-50/50">
            <input
              type="checkbox"
              checked={Boolean(form.is_scrap)}
              onChange={(e) => set('is_scrap', e.target.checked)}
              className="mt-0.5 size-5 accent-brand-600"
            />
            <span>
              <span className="block text-[15px] font-medium text-ink-900">ตัดจำหน่ายยางอัตโนมัติ</span>
              <span className="block text-sm text-ink-500">
                เมื่อช่างเลือกสาเหตุนี้ ยางจะถูกตั้งสถานะเป็น “ตัดจำหน่าย” แทนการกลับเข้าคลัง
                (เช่น หมดดอกยาง หรือ ระเบิด/บวม)
              </span>
            </span>
          </label>
        </form>
      </Modal>
    </>
  )
}
