'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { ActionResult, fail, optionalText, zodFail } from '@/lib/action-result'

const createSchema = z.object({
  email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร'),
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล'),
  phone: optionalText,
  employee_no: optionalText,
})

const updateSchema = createSchema.pick({ full_name: true, phone: true, employee_no: true })

export type CreateGlobalTechInput = z.input<typeof createSchema>
export type UpdateGlobalTechInput = z.input<typeof updateSchema>

/**
 * สร้างบัญชีช่างส่วนกลาง (เข้าได้ทุกลูกค้า ใช้เมนูถอด-ใส่ยางอย่างเดียว) — เฉพาะ super admin
 * @param input ข้อมูลบัญชี
 */
export async function createGlobalTechnician(input: CreateGlobalTechInput): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงสร้างผู้ใช้ใหม่ไม่ได้' }
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  })
  if (authError || !created.user) return fail(authError ?? 'สร้างผู้ใช้ไม่สำเร็จ')

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    company_id: null,
    role: 'technician',
    all_companies: true,
    full_name: parsed.data.full_name,
    phone: parsed.data.phone,
    employee_no: parsed.data.employee_no,
  })
  if (profileError) {
    // rollback auth user กันค้างโดยไม่มี profile (เช่น ยังไม่ได้รัน migration 020)
    await admin.auth.admin.deleteUser(created.user.id)
    return fail(profileError)
  }

  revalidatePath('/superadmin/technicians')
  return { ok: true }
}

/**
 * แก้ชื่อ/เบอร์/รหัสพนักงานของช่างส่วนกลาง — เฉพาะ super admin
 * @param id รหัสผู้ใช้
 * @param input ข้อมูลที่แก้ไข
 */
export async function updateGlobalTechnician(
  id: string,
  input: UpdateGlobalTechInput,
): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { data, error } = await createAdminClient()
    .from('profiles')
    .update(parsed.data)
    .eq('id', id)
    .eq('all_companies', true)
    .select('id')
    .maybeSingle()

  if (error) return fail(error)
  if (!data) return { ok: false, error: 'ไม่พบช่างส่วนกลางที่ต้องการแก้ไข' }
  revalidatePath('/superadmin/technicians')
  return { ok: true }
}
