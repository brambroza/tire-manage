'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { ActionResult, fail, optionalText, zodFail } from '@/lib/action-result'

/* ============================================================ ลูกค้า */

const companySchema = z.object({
  code: z.string().trim().min(2, 'รหัสบริษัทอย่างน้อย 2 ตัวอักษร').max(20),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อบริษัท'),
  tax_id: optionalText,
  phone: optionalText,
  email: optionalText,
  address: optionalText,
  contact_name: optionalText,
  alert_km: z.number().int().min(1).default(10000),
  alert_tread_mm: z.number().min(0).default(3),
})

export type SuperCompanyInput = z.input<typeof companySchema>

/**
 * เพิ่มบริษัทลูกค้าใหม่
 * @param input ข้อมูลบริษัท
 */
export async function createCompany(input: SuperCompanyInput): Promise<ActionResult<{ id: string }>> {
  await requireSession(['super_admin'])
  const parsed = companySchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('companies')
    .insert({ ...parsed.data, code: parsed.data.code.toUpperCase() })
    .select('id')
    .single()

  if (error) return fail(error)
  revalidatePath('/superadmin/companies')
  return { ok: true, data: { id: data.id } }
}

/**
 * แก้ไขข้อมูลบริษัทลูกค้า
 * @param id รหัสบริษัท
 * @param input ข้อมูลที่แก้ไข
 */
export async function updateCompany(id: string, input: SuperCompanyInput): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const parsed = companySchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase
    .from('companies')
    .update({ ...parsed.data, code: parsed.data.code.toUpperCase() })
    .eq('id', id)

  if (error) return fail(error)
  revalidatePath('/superadmin/companies')
  revalidatePath(`/superadmin/companies/${id}`)
  return { ok: true }
}

/**
 * เปิด/ปิดการใช้งานบริษัทลูกค้า
 * @param id รหัสบริษัท
 * @param isActive สถานะที่ต้องการ
 */
export async function setCompanyActive(id: string, isActive: boolean): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const supabase = await createClient()
  const { error } = await supabase.from('companies').update({ is_active: isActive }).eq('id', id)
  if (error) return fail(error)
  revalidatePath('/superadmin/companies')
  return { ok: true }
}

/* ================================================== ผู้ใช้ของลูกค้า */

const companyAdminSchema = z.object({
  company_id: z.string().uuid(),
  email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(8, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร'),
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-นามสกุล'),
  role: z.enum(['admin', 'technician']),
})

export type CompanyAdminInput = z.input<typeof companyAdminSchema>

/**
 * สร้างบัญชีผู้ใช้ให้บริษัทลูกค้า (มักใช้สร้างแอดมินคนแรก)
 * @param input ข้อมูลผู้ใช้
 */
export async function createCompanyUser(input: CompanyAdminInput): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const parsed = companyAdminSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงสร้างผู้ใช้ไม่ได้' }
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  })
  if (authError || !created.user) return fail(authError ?? 'สร้างผู้ใช้ไม่สำเร็จ')

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    company_id: parsed.data.company_id,
    role: parsed.data.role,
    full_name: parsed.data.full_name,
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return fail(profileError)
  }

  revalidatePath(`/superadmin/companies/${parsed.data.company_id}`)
  return { ok: true }
}

/* ======================================== ข้อมูลยาง (ยี่ห้อ/รุ่น) */

/**
 * เพิ่มยี่ห้อยางในแคตตาล็อกกลาง
 * @param name ชื่อยี่ห้อ
 */
export async function createBrand(name: string): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const value = name.trim().toUpperCase()
  if (!value) return { ok: false, error: 'กรุณากรอกชื่อยี่ห้อ' }

  const supabase = await createClient()
  const { error } = await supabase.from('tire_brands').insert({ name: value })
  if (error) return fail(error)

  revalidatePath('/superadmin/catalog')
  return { ok: true }
}

/**
 * เปิด/ปิดการใช้งานยี่ห้อยาง
 * @param id รหัสยี่ห้อ
 * @param isActive สถานะที่ต้องการ
 */
export async function setBrandActive(id: string, isActive: boolean): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const supabase = await createClient()
  const { error } = await supabase.from('tire_brands').update({ is_active: isActive }).eq('id', id)
  if (error) return fail(error)
  revalidatePath('/superadmin/catalog')
  return { ok: true }
}

const modelSchema = z.object({
  brand_id: z.string().uuid('กรุณาเลือกยี่ห้อ'),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อรุ่น'),
  size: optionalText,
  pattern_code: optionalText,
  image_url: optionalText,
})

/** ชนิดไฟล์รูปที่รับได้ และขนาดสูงสุด 3 MB */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const TIRE_IMAGE_BUCKET = 'tire-images'

/**
 * อัปโหลดรูปยางขึ้น Supabase Storage แล้วคืน public URL
 * ใช้ service role เพื่อไม่ต้องเปิดสิทธิ์เขียน storage ให้ผู้ใช้ทั่วไป
 *
 * @param formData ต้องมี field ชื่อ "file"
 */
export async function uploadTireImage(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  await requireSession(['super_admin'])

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'ไม่พบไฟล์รูปที่อัปโหลด' }
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: 'รองรับเฉพาะไฟล์ JPG, PNG, WebP หรือ AVIF' }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'ไฟล์ใหญ่เกิน 3 MB กรุณาย่อรูปก่อนอัปโหลด' }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงอัปโหลดรูปไม่ได้' }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `models/${crypto.randomUUID()}.${ext}`

  const { error } = await admin.storage
    .from(TIRE_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) {
    return {
      ok: false,
      error: error.message.includes('Bucket not found')
        ? 'ยังไม่ได้สร้าง bucket "tire-images" — กรุณารัน migration 002 ก่อน'
        : `อัปโหลดรูปไม่สำเร็จ: ${error.message}`,
    }
  }

  const { data } = admin.storage.from(TIRE_IMAGE_BUCKET).getPublicUrl(path)
  return { ok: true, data: { url: data.publicUrl } }
}

/**
 * ลบรูปยางออกจาก Storage (ใช้ตอนผู้ใช้กดเอารูปออก)
 * @param url public URL ของรูปที่ต้องการลบ
 */
export async function deleteTireImage(url: string): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const marker = `/${TIRE_IMAGE_BUCKET}/`
  const index = url.indexOf(marker)
  if (index === -1) return { ok: false, error: 'ลิงก์รูปไม่ถูกต้อง' }

  try {
    const admin = createAdminClient()
    const { error } = await admin.storage
      .from(TIRE_IMAGE_BUCKET)
      .remove([url.slice(index + marker.length)])
    if (error) return fail(error)
    revalidatePath('/superadmin/catalog')
    return { ok: true }
  } catch {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงลบรูปไม่ได้' }
  }
}

export type ModelInput = z.input<typeof modelSchema>

/**
 * เพิ่มรุ่นยางในแคตตาล็อกกลาง
 * @param input ข้อมูลรุ่นยาง
 */
export async function createModel(input: ModelInput): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const parsed = modelSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('tire_models').insert(parsed.data)
  if (error) return fail(error)

  revalidatePath('/superadmin/catalog')
  return { ok: true }
}

/**
 * แก้ไขรุ่นยาง
 * @param id รหัสรุ่นยาง
 * @param input ข้อมูลที่แก้ไข
 */
export async function updateModel(id: string, input: ModelInput): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const parsed = modelSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('tire_models').update(parsed.data).eq('id', id)
  if (error) return fail(error)

  revalidatePath('/superadmin/catalog')
  return { ok: true }
}

/**
 * เปิด/ปิดการใช้งานรุ่นยาง
 * @param id รหัสรุ่นยาง
 * @param isActive สถานะที่ต้องการ
 */
export async function setModelActive(id: string, isActive: boolean): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const supabase = await createClient()
  const { error } = await supabase.from('tire_models').update({ is_active: isActive }).eq('id', id)
  if (error) return fail(error)
  revalidatePath('/superadmin/catalog')
  return { ok: true }
}

/* ============================ สิทธิ์การมองเห็นยางของแต่ละบริษัท */

/**
 * กำหนดว่าบริษัทลูกค้าเห็นยางรุ่นใดได้บ้าง (แทนที่รายการเดิมทั้งหมด)
 * @param companyId รหัสบริษัท
 * @param modelIds รายการรุ่นยางที่อนุญาต
 */
export async function setCompanyTireModels(
  companyId: string,
  modelIds: string[],
): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const supabase = await createClient()

  const { error: deleteError } = await supabase
    .from('company_tire_models')
    .delete()
    .eq('company_id', companyId)
  if (deleteError) return fail(deleteError)

  if (modelIds.length > 0) {
    const { error } = await supabase
      .from('company_tire_models')
      .insert(modelIds.map((id) => ({ company_id: companyId, tire_model_id: id })))
    if (error) return fail(error)
  }

  revalidatePath(`/superadmin/companies/${companyId}`)
  return { ok: true }
}

/* ================================================ สาเหตุการถอดยาง */

const reasonSchema = z.object({
  code: z.string().trim().min(1, 'กรุณากรอกรหัส').max(30),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อสาเหตุ'),
  is_scrap: z.boolean().default(false),
  sort_order: z.number().int().default(0),
})

export type ReasonInput = z.input<typeof reasonSchema>

/**
 * เพิ่มสาเหตุการถอดยาง
 * @param input ข้อมูลสาเหตุ
 */
export async function createReason(input: ReasonInput): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const parsed = reasonSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase
    .from('removal_reasons')
    .insert({ ...parsed.data, code: parsed.data.code.toUpperCase() })
  if (error) return fail(error)

  revalidatePath('/superadmin/reasons')
  return { ok: true }
}

/**
 * แก้ไขสาเหตุการถอดยาง
 * @param id รหัสสาเหตุ
 * @param input ข้อมูลที่แก้ไข
 */
export async function updateReason(id: string, input: ReasonInput): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const parsed = reasonSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase
    .from('removal_reasons')
    .update({ ...parsed.data, code: parsed.data.code.toUpperCase() })
    .eq('id', id)
  if (error) return fail(error)

  revalidatePath('/superadmin/reasons')
  return { ok: true }
}

/**
 * เปิด/ปิดการใช้งานสาเหตุการถอดยาง
 * @param id รหัสสาเหตุ
 * @param isActive สถานะที่ต้องการ
 */
export async function setReasonActive(id: string, isActive: boolean): Promise<ActionResult> {
  await requireSession(['super_admin'])
  const supabase = await createClient()
  const { error } = await supabase.from('removal_reasons').update({ is_active: isActive }).eq('id', id)
  if (error) return fail(error)
  revalidatePath('/superadmin/reasons')
  return { ok: true }
}
