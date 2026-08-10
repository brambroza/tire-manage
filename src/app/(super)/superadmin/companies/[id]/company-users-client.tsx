'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Plus, Users } from 'lucide-react'
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select,
  Table, TableWrap, Td, Th,
} from '@/components/ui'
import { Modal } from '@/components/ui/modal'
import { createCompanyUser, type CompanyAdminInput } from '../../actions'
import type { Profile } from '@/lib/database.types'

const ROLE_LABEL: Record<string, string> = { admin: 'แอดมิน', technician: 'ช่าง' }

/** รายชื่อผู้ใช้ของบริษัท + สร้างบัญชีใหม่ให้ลูกค้า */
export function CompanyUsersClient({
  companyId,
  users,
}: {
  companyId: string
  users: Profile[]
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [form, setForm] = React.useState<CompanyAdminInput>({
    company_id: companyId,
    email: '',
    password: '',
    full_name: '',
    role: 'admin',
  })

  const set = <K extends keyof CompanyAdminInput>(key: K, value: CompanyAdminInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

    const result = await createCompanyUser({ ...form, company_id: companyId })
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    setOpen(false)
    setForm({ company_id: companyId, email: '', password: '', full_name: '', role: 'admin' })
    router.refresh()
  }

  return (
    <>
      <Card>
        <CardHeader
          title="ผู้ใช้งานของบริษัท"
          description={`ทั้งหมด ${users.length} บัญชี`}
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              สร้างบัญชี
            </Button>
          }
        />
        {users.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="ยังไม่มีบัญชีผู้ใช้"
            description="สร้างบัญชีแอดมินคนแรกให้ลูกค้าเพื่อเริ่มใช้งาน"
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[520px]">
              <thead>
                <tr>
                  <Th>ชื่อ-นามสกุล</Th>
                  <Th>สิทธิ์</Th>
                  <Th>เบอร์โทร</Th>
                  <Th>สถานะ</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-brand-50/40">
                    <Td className="font-medium text-ink-900">{u.full_name}</Td>
                    <Td><Badge tone={u.role === 'admin' ? 'brand' : 'sky'}>{ROLE_LABEL[u.role]}</Badge></Td>
                    <Td>{u.phone ?? '-'}</Td>
                    <Td>
                      <Badge tone={u.is_active ? 'emerald' : 'slate'}>
                        {u.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </Badge>
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
        title="สร้างบัญชีผู้ใช้ให้ลูกค้า"
        description="ระบบจะยืนยันอีเมลให้อัตโนมัติ ผู้ใช้เข้าสู่ระบบได้ทันที"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button type="submit" form="company-user-form" loading={loading}>สร้างบัญชี</Button>
          </>
        }
      >
        <form id="company-user-form" onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Field label="ชื่อ-นามสกุล" required error={fieldErrors.full_name}>
            <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="อีเมล" required error={fieldErrors.email}>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="รหัสผ่านเริ่มต้น" required error={fieldErrors.password} hint="อย่างน้อย 6 ตัวอักษร">
              <Input value={form.password} onChange={(e) => set('password', e.target.value)} />
            </Field>
          </div>
          <Field label="สิทธิ์การใช้งาน" required>
            <Select
              value={form.role}
              onChange={(e) => set('role', e.target.value as CompanyAdminInput['role'])}
            >
              <option value="admin">แอดมินบริษัท</option>
              <option value="technician">ช่าง</option>
            </Select>
          </Field>
        </form>
      </Modal>
    </>
  )
}
