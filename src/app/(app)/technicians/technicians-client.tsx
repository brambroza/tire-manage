'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, KeyRound, Pencil, Plus, Power, PowerOff, Trash2, Users,
} from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, Field, Input, Select, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { ConfirmDialog, Modal } from '@/components/ui/modal'
import { formatThaiDate } from '@/lib/utils'
import {
  createTeamMember, deleteTeamMember, resetMemberPassword, setMemberActive, updateTeamMember,
  type CreateUserInput,
} from './actions'
import type { Profile } from '@/lib/database.types'

const EMPTY: CreateUserInput = {
  email: '',
  password: '',
  full_name: '',
  phone: '',
  employee_no: '',
  role: 'technician',
}

const ROLE_LABEL: Record<string, string> = { admin: 'แอดมิน', technician: 'ช่าง' }

/** จัดการผู้ใช้งานในบริษัท (ช่างและแอดมิน) */
export function TechniciansClient({
  members,
  currentUserId,
  companyId,
}: {
  members: Profile[]
  currentUserId: string
  /** ระบุเมื่อ super admin จัดการผู้ใช้แทนลูกค้า */
  companyId?: string
}) {
  const router = useRouter()
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Profile | null>(null)
  const [form, setForm] = React.useState<CreateUserInput>(EMPTY)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  const [confirm, setConfirm] = React.useState<Profile | null>(null)
  const [deleting, setDeleting] = React.useState<Profile | null>(null)
  const [pwTarget, setPwTarget] = React.useState<Profile | null>(null)
  const [newPassword, setNewPassword] = React.useState('')
  const [notice, setNotice] = React.useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setError(null)
    setFieldErrors({})
    setFormOpen(true)
  }

  function openEdit(m: Profile) {
    setEditing(m)
    setForm({
      email: '',
      password: '',
      full_name: m.full_name,
      phone: m.phone ?? '',
      employee_no: m.employee_no ?? '',
      role: m.role === 'admin' ? 'admin' : 'technician',
    })
    setError(null)
    setFieldErrors({})
    setFormOpen(true)
  }

  const set = <K extends keyof CreateUserInput>(key: K, value: CreateUserInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

    const result = editing
      ? await updateTeamMember(editing.id, {
          full_name: form.full_name,
          phone: form.phone,
          employee_no: form.employee_no,
          role: form.role,
        })
      : await createTeamMember(form, companyId)

    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    setFormOpen(false)
    router.refresh()
  }

  async function toggleActive(m: Profile) {
    setLoading(true)
    const result = await setMemberActive(m.id, !m.is_active)
    setLoading(false)
    setConfirm(null)
    if (!result.ok) setNotice(result.error)
    else router.refresh()
  }

  async function handleDelete() {
    if (!deleting) return
    setLoading(true)
    const result = await deleteTeamMember(deleting.id)
    setLoading(false)
    setDeleting(null)
    if (!result.ok) setNotice(result.error)
    else {
      setNotice(`ลบบัญชี ${deleting.full_name} เรียบร้อยแล้ว`)
      router.refresh()
    }
  }

  async function handleResetPassword() {
    if (!pwTarget) return
    setLoading(true)
    const result = await resetMemberPassword(pwTarget.id, newPassword)
    setLoading(false)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setPwTarget(null)
    setNewPassword('')
    setNotice('ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว')
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4.5" />
          เพิ่มผู้ใช้งาน
        </Button>
      </div>

      {notice && (
        <div className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-inset ring-brand-100">
          {notice}
        </div>
      )}

      <Card>
        {members.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="ยังไม่มีผู้ใช้งานในบริษัท"
            action={<Button onClick={openCreate}><Plus className="size-4.5" />เพิ่มผู้ใช้งาน</Button>}
          />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>ชื่อ-นามสกุล</Th>
                  <Th>รหัสพนักงาน</Th>
                  <Th>เบอร์โทร</Th>
                  <Th>สิทธิ์</Th>
                  <Th>สถานะ</Th>
                  <Th>เพิ่มเมื่อ</Th>
                  <Th className="text-right">จัดการ</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-brand-50/40">
                    <Td className="font-medium text-ink-900">
                      {m.full_name}
                      {m.id === currentUserId && <span className="ml-2 text-xs text-ink-400">(คุณ)</span>}
                    </Td>
                    <Td>{m.employee_no ?? '-'}</Td>
                    <Td>{m.phone ?? '-'}</Td>
                    <Td><Badge tone={m.role === 'admin' ? 'brand' : 'sky'}>{ROLE_LABEL[m.role]}</Badge></Td>
                    <Td>
                      <Badge tone={m.is_active ? 'emerald' : 'slate'}>
                        {m.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-500">{formatThaiDate(m.created_at)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button" onClick={() => openEdit(m)} aria-label="แก้ไข"
                          className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                        >
                          <Pencil className="size-4.5" />
                        </button>
                        <button
                          type="button" onClick={() => { setPwTarget(m); setNewPassword('') }}
                          aria-label="ตั้งรหัสผ่านใหม่"
                          className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-brand-600"
                        >
                          <KeyRound className="size-4.5" />
                        </button>
                        <button
                          type="button" onClick={() => setConfirm(m)}
                          aria-label={m.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          disabled={m.id === currentUserId}
                          className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-30"
                        >
                          {m.is_active ? <PowerOff className="size-4.5" /> : <Power className="size-4.5" />}
                        </button>
                        <button
                          type="button" onClick={() => setDeleting(m)}
                          aria-label="ลบบัญชี"
                          disabled={m.id === currentUserId || m.role === 'super_admin'}
                          className="flex size-11 items-center justify-center rounded-lg text-ink-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                        >
                          <Trash2 className="size-4.5" />
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

      {/* ฟอร์มเพิ่ม/แก้ไข */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'แก้ไขข้อมูลผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}
        description={editing ? editing.full_name : 'ระบบจะสร้างบัญชีเข้าใช้งานให้ทันที'}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
            <Button type="submit" form="member-form" loading={loading}>
              {editing ? 'บันทึกการแก้ไข' : 'สร้างบัญชี'}
            </Button>
          </>
        }
      >
        <form id="member-form" onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!editing && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="อีเมล (ใช้เข้าสู่ระบบ)" required error={fieldErrors.email}>
                <Input
                  type="email" value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="tech@company.co.th"
                />
              </Field>
              <Field label="รหัสผ่านเริ่มต้น" required error={fieldErrors.password}
                hint="อย่างน้อย 6 ตัวอักษร">
                <Input
                  type="text" value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                />
              </Field>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="ชื่อ-นามสกุล" required error={fieldErrors.full_name}>
              <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
            </Field>
            <Field label="สิทธิ์การใช้งาน" required>
              <Select
                value={form.role}
                onChange={(e) => set('role', e.target.value as CreateUserInput['role'])}
              >
                <option value="technician">ช่าง — บันทึกถอด-ใส่ยาง</option>
                <option value="admin">แอดมิน — จัดการข้อมูลทั้งหมดของบริษัท</option>
              </Select>
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

      {/* ตั้งรหัสผ่านใหม่ */}
      <Modal
        open={Boolean(pwTarget)}
        onClose={() => setPwTarget(null)}
        title="ตั้งรหัสผ่านใหม่"
        description={pwTarget?.full_name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPwTarget(null)}>ยกเลิก</Button>
            <Button onClick={handleResetPassword} loading={loading}>ตั้งรหัสผ่าน</Button>
          </>
        }
      >
        <Field label="รหัสผ่านใหม่" required hint="อย่างน้อย 6 ตัวอักษร">
          <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={loading}
        title="ลบบัญชีนี้ถาวร?"
        confirmLabel="ลบบัญชี"
        message={
          <>
            บัญชีของ <strong>{deleting?.full_name}</strong> จะถูกลบออกจากระบบถาวรและเข้าสู่ระบบไม่ได้อีก
            <br />
            ประวัติการบันทึกงานยังอยู่ครบ แต่ช่อง “ผู้บันทึก” ของรายการเก่าจะกลายเป็นค่าว่าง
            <br />
            หากต้องการเก็บชื่อผู้บันทึกไว้ ให้ใช้ “ปิดใช้งาน” แทน
          </>
        }
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && toggleActive(confirm)}
        loading={loading}
        title={confirm?.is_active ? 'ปิดใช้งานบัญชีนี้?' : 'เปิดใช้งานบัญชีนี้?'}
        confirmLabel={confirm?.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        message={
          confirm?.is_active
            ? `${confirm?.full_name} จะไม่สามารถเข้าสู่ระบบได้ แต่ประวัติการบันทึกยังคงอยู่`
            : `${confirm?.full_name} จะกลับมาเข้าสู่ระบบได้ตามปกติ`
        }
      />
    </>
  )
}
