'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { resolveCompanyScope } from '@/lib/company-scope'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { ActionResult, fail, optionalText, zodFail } from '@/lib/action-result'

const createSchema = z.object({
  email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร'),
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล'),
  phone: optionalText,
  employee_no: optionalText,
  role: z.enum(['admin', 'technician']),
})

const updateSchema = z.object({
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล'),
  phone: optionalText,
  employee_no: optionalText,
  role: z.enum(['admin', 'technician']),
})

export type CreateUserInput = z.input<typeof createSchema>
export type UpdateUserInput = z.input<typeof updateSchema>

function revalidateTeam(companyId: string) {
  revalidatePath('/technicians')
  revalidatePath(`/superadmin/companies/${companyId}`)
  revalidatePath(`/superadmin/companies/${companyId}/users`)
}

/**
 * สร้างผู้ใช้ใหม่ (ช่าง/แอดมิน) ให้บริษัท
 * ใช้ service role สร้าง auth user แล้วผูก profile กับบริษัท
 *
 * @param input ข้อมูลผู้ใช้
 * @param companyId บริษัทเป้าหมาย (ระบุเมื่อ super admin สร้างให้ลูกค้า)
 */
export async function createTeamMember(
  input: CreateUserInput,
  companyId?: string,
): Promise<ActionResult> {
  const scope = await resolveCompanyScope(['admin'], companyId)
  if (!scope.ok) return scope

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return {
      ok: false,
      error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงสร้างผู้ใช้ใหม่ไม่ได้',
    }
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  })

  if (authError || !created.user) return fail(authError ?? 'สร้างผู้ใช้ไม่สำเร็จ')

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    company_id: scope.companyId,
    role: parsed.data.role,
    full_name: parsed.data.full_name,
    phone: parsed.data.phone,
    employee_no: parsed.data.employee_no,
  })

  if (profileError) {
    // rollback auth user เพื่อไม่ให้เหลือ user ค้างที่ไม่มี profile
    await admin.auth.admin.deleteUser(created.user.id)
    return fail(profileError)
  }

  revalidateTeam(scope.companyId)
  return { ok: true }
}

/**
 * แก้ไขข้อมูลผู้ใช้
 * @param id รหัสผู้ใช้
 * @param input ข้อมูลที่แก้ไข
 */
export async function updateTeamMember(id: string, input: UpdateUserInput): Promise<ActionResult> {
  await requireSession(['admin', 'super_admin'])
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('id', id)
    .select('company_id')
    .maybeSingle()

  if (error) return fail(error)
  if (!data) return { ok: false, error: 'ไม่พบผู้ใช้ที่ต้องการแก้ไข หรือคุณไม่มีสิทธิ์' }

  revalidateTeam(data.company_id ?? '')
  return { ok: true }
}

/**
 * เปิด/ปิดการใช้งานบัญชีผู้ใช้
 * @param id รหัสผู้ใช้
 * @param isActive สถานะที่ต้องการ
 */
export async function setMemberActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { userId } = await requireSession(['admin', 'super_admin'])
  if (id === userId) return { ok: false, error: 'ไม่สามารถปิดใช้งานบัญชีของตัวเองได้' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('company_id')
    .maybeSingle()

  if (error) return fail(error)
  if (data) revalidateTeam(data.company_id ?? '')
  return { ok: true }
}

/**
 * ลบบัญชีผู้ใช้ถาวร (ลบทั้ง auth user และ profile)
 *
 * ประวัติการบันทึกงานยังคงอยู่ — คอลัมน์ผู้บันทึกใน tire_events ถูกตั้งเป็น null ให้อัตโนมัติ
 * แนะนำให้ใช้ "ปิดใช้งาน" แทนถ้าต้องการเก็บชื่อผู้บันทึกไว้
 *
 * @param id รหัสผู้ใช้ที่ต้องการลบ
 */
export async function deleteTeamMember(id: string): Promise<ActionResult> {
  const session = await requireSession(['admin', 'super_admin'])
  if (id === session.userId) return { ok: false, error: 'ไม่สามารถลบบัญชีของตัวเองได้' }

  const supabase = await createClient()
  const { data: target } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', id)
    .maybeSingle()

  if (!target) return { ok: false, error: 'ไม่พบผู้ใช้ที่ระบุ' }
  if (target.role === 'super_admin') {
    return { ok: false, error: 'ไม่สามารถลบบัญชีผู้ดูแลระบบได้' }
  }
  if (session.profile.role === 'admin' && target.company_id !== session.profile.company_id) {
    return { ok: false, error: 'ไม่พบผู้ใช้ในบริษัทของคุณ' }
  }

  try {
    const admin = createAdminClient()
    // ลบ auth user แล้ว profile จะถูกลบตาม (FK on delete cascade)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return fail(error)
  } catch {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงลบบัญชีไม่ได้' }
  }

  revalidateTeam(target.company_id ?? '')
  return { ok: true }
}

/**
 * ตั้งรหัสผ่านใหม่ให้ผู้ใช้
 * แอดมินทำได้เฉพาะคนในบริษัทตัวเอง, super admin ทำได้กับผู้ใช้ของลูกค้าทุกราย
 *
 * @param id รหัสผู้ใช้
 * @param password รหัสผ่านใหม่
 */
export async function resetMemberPassword(id: string, password: string): Promise<ActionResult> {
  const session = await requireSession(['admin', 'super_admin'])
  if (password.length < 6) return { ok: false, error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' }

  const supabase = await createClient()
  const { data: target } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', id)
    .maybeSingle()

  if (!target) return { ok: false, error: 'ไม่พบผู้ใช้ที่ระบุ' }

  if (session.profile.role === 'admin' && target.company_id !== session.profile.company_id) {
    return { ok: false, error: 'ไม่พบผู้ใช้ในบริษัทของคุณ' }
  }

  if (session.profile.role === 'super_admin' && target.role === 'super_admin') {
    return { ok: false, error: 'ไม่สามารถรีเซ็ตรหัสผ่านของผู้ดูแลระบบคนอื่นได้' }
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(id, { password })
    if (error) return fail(error)
    return { ok: true }
  } catch {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงรีเซ็ตรหัสผ่านไม่ได้' }
  }
}
