'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, Building2, Pencil, Plus, Power, PowerOff, UserPlus, Users } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, Field, Input, Table, TableWrap, Td, Textarea, Th,
} from '@/components/ui'
import { ConfirmDialog, Modal } from '@/components/ui/modal'
import { formatNumber } from '@/lib/utils'
import { createCompany, setCompanyActive, updateCompany, type SuperCompanyInput } from '../actions'
import type { Company } from '@/lib/database.types'

const EMPTY: SuperCompanyInput = {
  code: '',
  name: '',
  tax_id: '',
  phone: '',
  email: '',
  address: '',
  contact_name: '',
  alert_km: 10000,
  alert_tread_mm: 3,
}

export interface CompanyRow extends Company {
  vehicle_count: number
  tire_count: number
  user_count: number
}

/** ตารางลูกค้า + ฟอร์มเพิ่ม/แก้ไข (super admin) */
export function CompaniesClient({ companies }: { companies: CompanyRow[] }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Company | null>(null)
  const [form, setForm] = React.useState<SuperCompanyInput>(EMPTY)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [confirm, setConfirm] = React.useState<CompanyRow | null>(null)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setError(null)
    setFieldErrors({})
    setOpen(true)
  }

  function openEdit(c: Company) {
    setEditing(c)
    setForm({
      code: c.code,
      name: c.name,
      tax_id: c.tax_id ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      contact_name: c.contact_name ?? '',
      alert_km: c.alert_km,
      alert_tread_mm: c.alert_tread_mm,
    })
    setError(null)
    setFieldErrors({})
    setOpen(true)
  }

  const set = <K extends keyof SuperCompanyInput>(key: K, value: SuperCompanyInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

    const result = editing ? await updateCompany(editing.id, form) : await createCompany(form)
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    setOpen(false)
    router.refresh()
  }

  async function toggleActive(c: CompanyRow) {
    setLoading(true)
    await setCompanyActive(c.id, !c.is_active)
    setLoading(false)
    setConfirm(null)
    router.refresh()
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4.5" />
          เพิ่มลูกค้าใหม่
        </Button>
      </div>

      <Card>
        {companies.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="ยังไม่มีลูกค้าในระบบ"
            action={<Button onClick={openCreate}><Plus className="size-4.5" />เพิ่มลูกค้าใหม่</Button>}
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[900px]">
              <thead>
                <tr>
                  <Th>บริษัท</Th>
                  <Th>รหัส</Th>
                  <Th>ผู้ติดต่อ</Th>
                  <Th className="text-right">ผู้ใช้</Th>
                  <Th className="text-right">รถ</Th>
                  <Th className="text-right">ยาง</Th>
                  <Th className="text-right">เกณฑ์เตือน</Th>
                  <Th>สถานะ</Th>
                  <Th className="text-right">จัดการ</Th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-brand-50/40">
                    <Td>
                      <Link
                        href={`/superadmin/companies/${c.id}`}
                        className="font-medium text-ink-900 hover:text-brand-600"
                      >
                        {c.name}
                      </Link>
                      {c.phone && <p className="text-xs text-ink-400">{c.phone}</p>}
                    </Td>
                    <Td><Badge tone="brand">{c.code}</Badge></Td>
                    <Td>{c.contact_name ?? '-'}</Td>
                    <Td className="text-right">
                      <Link
                        href={`/superadmin/companies/${c.id}/users`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-brand-600 hover:bg-brand-50"
                      >
                        <Users className="size-4" />
                        {formatNumber(c.user_count)}
                      </Link>
                    </Td>
                    <Td className="text-right">{formatNumber(c.vehicle_count)}</Td>
                    <Td className="text-right">{formatNumber(c.tire_count)}</Td>
                    <Td className="whitespace-nowrap text-right">{formatNumber(c.alert_km)} กม.</Td>
                    <Td>
                      <Badge tone={c.is_active ? 'emerald' : 'slate'}>
                        {c.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/superadmin/companies/${c.id}/users`}
                          aria-label="จัดการผู้ใช้งาน"
                          title="จัดการผู้ใช้งาน (แอดมิน / ช่าง)"
                          className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                        >
                          <UserPlus className="size-4.5" />
                        </Link>
                        <button
                          type="button" onClick={() => openEdit(c)} aria-label="แก้ไข"
                          className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                        >
                          <Pencil className="size-4.5" />
                        </button>
                        <button
                          type="button" onClick={() => setConfirm(c)}
                          aria-label={c.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-rose-50 hover:text-rose-600"
                        >
                          {c.is_active ? <PowerOff className="size-4.5" /> : <Power className="size-4.5" />}
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
        size="lg"
        title={editing ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'}
        description={editing?.name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button type="submit" form="company-form" loading={loading}>
              {editing ? 'บันทึกการแก้ไข' : 'เพิ่มลูกค้า'}
            </Button>
          </>
        }
      >
        <form id="company-form" onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-3">
            <Field
              label="รหัสบริษัท"
              hint={editing ? 'รหัสบริษัทสร้างโดยระบบและแก้ไขไม่ได้' : 'ระบบจะสร้างรหัสให้อัตโนมัติเมื่อบันทึก'}
            >
              <Input
                value={editing ? form.code : ''}
                placeholder="อัตโนมัติ เช่น C0001"
                readOnly
                className="bg-slate-50 font-mono"
              />
            </Field>
            <Field label="ชื่อบริษัท" required error={fieldErrors.name} className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="ผู้ติดต่อ">
              <Input value={form.contact_name ?? ''} onChange={(e) => set('contact_name', e.target.value)} />
            </Field>
            <Field label="เลขประจำตัวผู้เสียภาษี">
              <Input value={form.tax_id ?? ''} onChange={(e) => set('tax_id', e.target.value)} />
            </Field>
            <Field label="เบอร์โทร">
              <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="อีเมล">
              <Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </Field>
          </div>

          <Field label="ที่อยู่">
            <Textarea value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="เกณฑ์แจ้งเตือนระยะใช้งาน (กม.)" required error={fieldErrors.alert_km}>
              <Input
                type="number" min={1} value={form.alert_km}
                onChange={(e) => set('alert_km', Number(e.target.value))}
              />
            </Field>
            <Field label="ดอกยางขั้นต่ำ (มม.)" required error={fieldErrors.alert_tread_mm}>
              <Input
                type="number" step="0.1" min={0} value={form.alert_tread_mm}
                onChange={(e) => set('alert_tread_mm', Number(e.target.value))}
              />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && toggleActive(confirm)}
        loading={loading}
        title={confirm?.is_active ? 'ปิดใช้งานบริษัทนี้?' : 'เปิดใช้งานบริษัทนี้?'}
        confirmLabel={confirm?.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        message={`${confirm?.name} — ข้อมูลทั้งหมดจะยังคงอยู่ในระบบ`}
      />
    </>
  )
}
