'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { featureLockedMessage, hasFeature } from '@/lib/plan'
import { removeTireImage, storeTireImage } from '@/lib/tire-images'
import { ActionResult, fail, optionalText, zodFail } from '@/lib/action-result'

/**
 * รุ่นยางที่แอดมินบริษัทสร้างเอง — ไม่มีช่องดอกยางตอนใหม่
 * (ค่านั้น super admin เป็นผู้กำหนดจากหน้าแคตตาล็อกกลาง ยางที่ผูกรุ่นนี้จะใช้ค่าเริ่มต้นของฟอร์มไปก่อน)
 */
const ownModelSchema = z.object({
  brand_id: z.string().uuid('กรุณาเลือกยี่ห้อ'),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อรุ่น'),
  size: optionalText,
  image_url: optionalText,
})

export type OwnModelInput = z.input<typeof ownModelSchema>

/** หน้าที่ต้อง revalidate หลังแก้แคตตาล็อกของบริษัท (ฟอร์มคลังยางและหน้าช่างใช้รายการนี้) */
const CATALOG_PATHS = ['/catalog', '/tires', '/service']

function revalidateCatalog() {
  for (const path of CATALOG_PATHS) revalidatePath(path)
}

/**
 * ตรวจ session แอดมินบริษัท + แพ็กเกจที่เปิดสิทธิ์จัดการแคตตาล็อกของตัวเอง
 * @returns รหัสบริษัท หรือ error ถ้าแพ็กเกจยังไม่เปิด
 */
async function requireCatalogAccess(): Promise<ActionResult<{ companyId: string }>> {
  const { company } = await requireSession(['admin'])
  if (!company) return { ok: false, error: 'ไม่พบข้อมูลบริษัทของคุณ' }
  if (!hasFeature(company, 'tire_catalog_own')) {
    return { ok: false, error: featureLockedMessage('tire_catalog_own') }
  }
  return { ok: true, data: { companyId: company.id } }
}

/**
 * เพิ่มยี่ห้อยางของบริษัท (เห็นเฉพาะบริษัทนี้ จนกว่า super admin จะย้ายเข้าแคตตาล็อกกลาง)
 * @param name ชื่อยี่ห้อ — บันทึกเป็นตัวพิมพ์ใหญ่
 */
export async function createOwnBrand(name: string): Promise<ActionResult> {
  const access = await requireCatalogAccess()
  if (!access.ok) return access
  const value = name.trim().toUpperCase()
  if (!value) return { ok: false, error: 'กรุณากรอกชื่อยี่ห้อ' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tire_brands')
    .insert({ name: value, created_by_company: access.data!.companyId })
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, error: `ยี่ห้อ ${value} มีในระบบแล้ว` }
    }
    return fail(error)
  }

  revalidateCatalog()
  return { ok: true }
}

/**
 * เปิด/ปิดการใช้งานยี่ห้อที่บริษัทสร้างเอง (ยี่ห้อจากแคตตาล็อกกลางแก้ไม่ได้)
 * @param id รหัสยี่ห้อ
 * @param isActive สถานะที่ต้องการ
 */
export async function setOwnBrandActive(id: string, isActive: boolean): Promise<ActionResult> {
  const access = await requireCatalogAccess()
  if (!access.ok) return access

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tire_brands')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('created_by_company', access.data!.companyId)
    .select('id')
    .maybeSingle()
  if (error) return fail(error)
  if (!data) return { ok: false, error: 'แก้ได้เฉพาะยี่ห้อที่บริษัทของคุณสร้างเอง' }

  revalidateCatalog()
  return { ok: true }
}

/**
 * เพิ่มรุ่นยางของบริษัท — เลือกยี่ห้อได้ทั้งจากแคตตาล็อกกลางและยี่ห้อที่บริษัทสร้างเอง
 * @param input ข้อมูลรุ่นยาง
 */
export async function createOwnModel(input: OwnModelInput): Promise<ActionResult> {
  const access = await requireCatalogAccess()
  if (!access.ok) return access
  const parsed = ownModelSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase
    .from('tire_models')
    .insert({ ...parsed.data, created_by_company: access.data!.companyId })
  if (error) {
    // unique (brand_id, name, size) ชน = รุ่นนี้มีในแคตตาล็อกกลางแล้วแต่บริษัทยังไม่ได้รับสิทธิ์ (RLS เลยมองไม่เห็น)
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, error: 'รุ่นนี้มีในแคตตาล็อกกลางแล้ว — แจ้ง Dreammaker เปิดสิทธิ์ให้บริษัท' }
    }
    return fail(error)
  }

  revalidateCatalog()
  return { ok: true }
}

/**
 * แก้ไขรุ่นยางที่บริษัทสร้างเอง
 * @param id รหัสรุ่นยาง
 * @param input ข้อมูลที่แก้ไข
 */
export async function updateOwnModel(id: string, input: OwnModelInput): Promise<ActionResult> {
  const access = await requireCatalogAccess()
  if (!access.ok) return access
  const parsed = ownModelSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tire_models')
    .update(parsed.data)
    .eq('id', id)
    .eq('created_by_company', access.data!.companyId)
    .select('id')
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, error: 'มีรุ่นชื่อนี้ (ขนาดเดียวกัน) ในยี่ห้อนี้แล้ว' }
    }
    return fail(error)
  }
  if (!data) return { ok: false, error: 'แก้ได้เฉพาะรุ่นที่บริษัทของคุณสร้างเอง' }

  revalidateCatalog()
  return { ok: true }
}

/**
 * เปิด/ปิดการใช้งานรุ่นยางที่บริษัทสร้างเอง
 * @param id รหัสรุ่นยาง
 * @param isActive สถานะที่ต้องการ
 */
export async function setOwnModelActive(id: string, isActive: boolean): Promise<ActionResult> {
  const access = await requireCatalogAccess()
  if (!access.ok) return access

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tire_models')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('created_by_company', access.data!.companyId)
    .select('id')
    .maybeSingle()
  if (error) return fail(error)
  if (!data) return { ok: false, error: 'แก้ได้เฉพาะรุ่นที่บริษัทของคุณสร้างเอง' }

  revalidateCatalog()
  return { ok: true }
}

/**
 * อัปโหลดรูปรุ่นยางของบริษัท — เก็บแยกโฟลเดอร์ตามบริษัท
 * @param formData ต้องมี field ชื่อ "file"
 */
export async function uploadOwnTireImage(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const access = await requireCatalogAccess()
  if (!access.ok) return access
  return storeTireImage(formData.get('file'), `models/${access.data!.companyId}`)
}

/**
 * ลบรูปรุ่นยางของบริษัท — ลบได้เฉพาะรูปในโฟลเดอร์ของบริษัทตัวเอง
 * @param url public URL ของรูป
 */
export async function deleteOwnTireImage(url: string): Promise<ActionResult> {
  const access = await requireCatalogAccess()
  if (!access.ok) return access
  const result = await removeTireImage(url, `models/${access.data!.companyId}/`)
  if (result.ok) revalidatePath('/catalog')
  return result
}
