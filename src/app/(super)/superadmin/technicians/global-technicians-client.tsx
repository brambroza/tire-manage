'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, KeyRound, Pencil, Plus, Power, PowerOff, Trash2, Users } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, Field, Input, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { ConfirmDialog, Modal } from '@/components/ui/modal'
import { formatThaiDate } from '@/lib/utils'
import { deleteTeamMember, resetMemberPassword, setMemberActive } from '@/app/(app)/technicians/actions'
import { createGlobalTechnician, updateGlobalTechnician, type CreateGlobalTechInput } from './actions'
import type { Profile } from '@/lib/database.types'

export type GlobalTechRow = Profile & { email?: string | null }

const EMPTY: CreateGlobalTechInput = { email: '', password: '', full_name: '', phone: '', employee_no: '' }

/** ตารางจัดการช่างส่วนกลาง: เพิ่ม แก้ไข ตั้งรหัสผ่าน เปิด/ปิดใช้งาน ลบ */
export function GlobalTechniciansClient({
  rows,
  currentUserId,
}: {
  rows: GlobalTechRow[]
  currentUserId: string
}) {
  const router = useRouter()
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<GlobalTechRow | null>(null)
  const [form, setForm] = React.useState<CreateGlobalTechInput>(EMPTY)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [toggling, setToggling] = React.useState<GlobalTechRow | null>(null)
  const [deleting, setDeleting] = React.useState<GlobalTechRow | null>(null)
  const [pwTarget, setPwTarget] = React.useState<GlobalTechRow | null>(null)
  const [newPassword, setNewPassword] = React.useState('')
  const [notice, setNotice] = React.useState<string | null>(null)

  const set = <K extends keyof CreateGlobalTechInput>(key: K, value: CreateGlobalTechInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setError(null)
    setFieldErrors({})
    setFormOpen(true)
  }

  function openEdit(m: GlobalTechRow) {
    setEditing(m)
    setForm({ email: '', password: '', full_name: m.full_name, phone: m.phone ?? '', employee_no: m.employee_no ?? '' })
    setError(null)
    setFieldErrors({})
    setFormOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})
    const result = editing
      ? await updateGlobalTechnician(editing.id, {
          full_name: form.full_name, phone: form.phone, employee_no: form.employee_no,
        })
      : await createGlobalTechnician(form)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }
    setFormOpen(false)
    router.refresh()
  }

  /** รันงานที่ต้อง refresh หน้า แล้วแสดงข้อความถ้าล้มเหลว */
  async function run(task: () => Promise<{ ok: boolean; error?: string }>, done: () => void) {
    setLoading(true)
    const result = await task()
    setLoading(false)
    done()
    if (!result.ok) setNotice(result.error ?? 'ทำรายการไม่สำเร็จ')
    else router.refresh()
  }

  const iconBtn = 'flex size-11 items-center justify-center rounded-lg text-ink-500 disabled:opacity-30'

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}><Plus className="size-4.5" />เพิ่มช่างส่วนกลาง</Button>
      </div>

      {notice && (
        <div className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-inset ring-brand-100">
          {notice}
        </div>
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="ยังไม่มีช่างส่วนกลาง"
            action={<Button onClick={openCreate}><Plus className="size-4.5" />เพิ่มช่างส่วนกลาง</Button>}
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>ชื่อ-นามสกุล</Th><Th>อีเมล</Th><Th>รหัสพนักงาน</Th><Th>เบอร์โทร</Th>
                  <Th>กำลังทำงานกับ</Th><Th>สถานะ</Th><Th>เพิ่มเมื่อ</Th><Th className="text-right">จัดการ</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-brand-50/40">
                    <Td className="font-medium text-ink-900">{m.full_name}</Td>
                    <Td className="text-ink-600">{m.email ?? '-'}</Td>
                    <Td>{m.employee_no ?? '-'}</Td>
                    <Td>{m.phone ?? '-'}</Td>
                    <Td><Badge tone={m.company_id ? 'sky' : 'slate'}>{m.company_id ? 'เลือกลูกค้าแล้ว' : 'ยังไม่เลือก'}</Badge></Td>
                    <Td><Badge tone={m.is_active ? 'emerald' : 'slate'}>{m.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}</Badge></Td>
                    <Td className="whitespace-nowrap text-ink-500">{formatThaiDate(m.created_at)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" aria-label="แก้ไข" onClick={() => openEdit(m)}
                          className={`${iconBtn} hover:bg-brand-50 hover:text-brand-600`}><Pencil className="size-4.5" /></button>
                        <button type="button" aria-label="ตั้งรหัสผ่านใหม่" onClick={() => { setPwTarget(m); setNewPassword('') }}
                          className={`${iconBtn} hover:bg-brand-50 hover:text-brand-600`}><KeyRound className="size-4.5" /></button>
                        <button type="button" aria-label={m.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          disabled={m.id === currentUserId} onClick={() => setToggling(m)}
                          className={`${iconBtn} hover:bg-amber-50 hover:text-amber-600`}>
                          {m.is_active ? <PowerOff className="size-4.5" /> : <Power className="size-4.5" />}
                        </button>
                        <button type="button" aria-label="ลบบัญชี" disabled={m.id === currentUserId}
                          onClick={() => setDeleting(m)}
                          className={`${iconBtn} hover:bg-rose-50 hover:text-rose-600`}><Trash2 className="size-4.5" /></button>
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
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'แก้ไขช่างส่วนกลาง' : 'เพิ่มช่างส่วนกลาง'}
        description={editing ? editing.full_name : 'ช่างคนนี้จะเข้าได้ทุกลูกค้า และใช้ได้เฉพาะเมนูบันทึกถอด-ใส่ยาง'}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
            <Button type="submit" form="global-tech-form" loading={loading}>
              {editing ? 'บันทึกการแก้ไข' : 'สร้างบัญชี'}
            </Button>
          </>
        }
      >
        <form id="global-tech-form" onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{error}</span>
            </div>
          )}
          {!editing && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="อีเมล (ใช้เข้าสู่ระบบ)" required error={fieldErrors.email}>
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="รหัสผ่านเริ่มต้น" required error={fieldErrors.password} hint="อย่างน้อย 6 ตัวอักษร">
                <Input value={form.password} onChange={(e) => set('password', e.target.value)} />
              </Field>
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="ชื่อ-นามสกุล" required error={fieldErrors.full_name}>
              <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
            </Field>
            <Field label="รหัสพนักงาน">
              <Input value={form.employee_no ?? ''} onChange={(e) => set('employee_no', e.target.value)} />
            </Field>
            <Field label="เบอร์โทร">
              <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
            </Field>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(pwTarget)}
        onClose={() => setPwTarget(null)}
        title="ตั้งรหัสผ่านใหม่"
        description={pwTarget?.full_name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPwTarget(null)}>ยกเลิก</Button>
            <Button loading={loading}
              onClick={() => pwTarget && run(() => resetMemberPassword(pwTarget.id, newPassword), () => setPwTarget(null))}>
              ตั้งรหัสผ่าน
            </Button>
          </>
        }
      >
        <Field label="รหัสผ่านใหม่" required hint="อย่างน้อย 6 ตัวอักษร">
          <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        loading={loading}
        onConfirm={() => toggling && run(() => setMemberActive(toggling.id, !toggling.is_active), () => setToggling(null))}
        title={toggling?.is_active ? 'ปิดใช้งานบัญชีนี้?' : 'เปิดใช้งานบัญชีนี้?'}
        confirmLabel={toggling?.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        message={toggling?.is_active
          ? `${toggling?.full_name} จะเข้าสู่ระบบไม่ได้ แต่ประวัติการบันทึกยังอยู่`
          : `${toggling?.full_name} จะกลับมาเข้าสู่ระบบได้ตามปกติ`}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        loading={loading}
        onConfirm={() => deleting && run(() => deleteTeamMember(deleting.id), () => setDeleting(null))}
        title="ลบบัญชีนี้ถาวร?"
        confirmLabel="ลบบัญชี"
        message={<>บัญชีของ <strong>{deleting?.full_name}</strong> จะถูกลบถาวร ประวัติการบันทึกยังอยู่แต่ช่อง “ผู้บันทึก” จะว่าง — แนะนำให้ “ปิดใช้งาน” แทน</>}
      />
    </>
  )
}
