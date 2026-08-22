'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { resolveCompanyScope } from '@/lib/company-scope'
import { createClient } from '@/lib/supabase/server'
import { ActionResult, fail, optionalNumber, optionalText, zodFail } from '@/lib/action-result'
import { HISTORY_LIMIT, TIRE_EVENT_SELECT, type TireEventRow } from '@/lib/tire-events'

const tireSchema = z.object({
  serial_no: z.string().trim().min(1, 'กรุณากรอกเลขยาง (ซีเรียล)').max(50),
  /** เลือกจากแคตตาล็อกที่ super admin กำหนดให้ (ถ้ามี) */
  tire_model_id: optionalText,
  /** กรณีช่างพิมพ์ยี่ห้อ/รุ่นเองเพราะยังไม่มีในระบบ */
  brand_name: optionalText,
  model_name: optionalText,
  size: optionalText,
  dot: optionalText,
  new_tread_mm: optionalNumber,
  tread_mm: optionalNumber,
  purchase_price: optionalNumber,
  note: optionalText,
})

export type TireInput = z.input<typeof tireSchema>

/** revalidate ทั้งหน้าฝั่งลูกค้าและหน้าที่ super admin ใช้ดูแลลูกค้ารายนั้น */
function revalidateTire(companyId: string, tireId?: string) {
  revalidatePath('/tires')
  revalidatePath('/service')
  revalidatePath('/dashboard')
  if (tireId) revalidatePath(`/tires/${tireId}`)
  revalidatePath(`/superadmin/companies/${companyId}`)
  revalidatePath(`/superadmin/companies/${companyId}/tires`)
}

/**
 * เติมชื่อยี่ห้อ/รุ่น/ขนาด จาก tire_model_id ที่เลือกไว้
 * เพื่อเก็บ snapshot ไว้กับยางเส้นนั้น
 */
async function resolveModelSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  modelId: string | null,
) {
  if (!modelId) return {}
  const { data } = await supabase
    .from('tire_models')
    .select('name, size, tire_brands(name)')
    .eq('id', modelId)
    .single()
  if (!data) return {}
  const brand = (data as unknown as { tire_brands: { name: string } | null }).tire_brands
  return { brand_name: brand?.name ?? null, model_name: data.name, size: data.size }
}

/**
 * เพิ่มยางเส้นใหม่เข้าคลัง
 * @param input ข้อมูลยางจากฟอร์ม
 * @param companyId บริษัทเป้าหมาย (ระบุเมื่อ super admin ทำแทนลูกค้า)
 */
export async function createTire(
  input: TireInput,
  companyId?: string,
): Promise<ActionResult<{ id: string }>> {
  const scope = await resolveCompanyScope(['admin', 'technician'], companyId)
  if (!scope.ok) return scope

  const parsed = tireSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const snapshot = await resolveModelSnapshot(supabase, parsed.data.tire_model_id)

  const { data, error } = await supabase
    .from('tires')
    .insert({
      ...parsed.data,
      // ถ้าเลือกรุ่นจากแคตตาล็อกให้ใช้ค่าจากแคตตาล็อกก่อน มิฉะนั้นใช้ที่พิมพ์เอง
      brand_name: snapshot.brand_name ?? parsed.data.brand_name,
      model_name: snapshot.model_name ?? parsed.data.model_name,
      size: snapshot.size ?? parsed.data.size,
      company_id: scope.companyId,
      status: 'in_stock',
    })
    .select('id')
    .single()

  if (error) return fail(error)
  revalidateTire(scope.companyId, data.id)
  return { ok: true, data: { id: data.id } }
}

/**
 * แก้ไขข้อมูลยาง (ไม่รวมสถานะ/ตำแหน่ง ซึ่งเปลี่ยนผ่านการถอด-ใส่เท่านั้น)
 * @param id รหัสยาง
 * @param input ข้อมูลที่แก้ไข
 */
export async function updateTire(id: string, input: TireInput): Promise<ActionResult> {
  await requireSession(['admin', 'super_admin'])
  const parsed = tireSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const snapshot = await resolveModelSnapshot(supabase, parsed.data.tire_model_id)

  const { data, error } = await supabase
    .from('tires')
    .update({
      ...parsed.data,
      brand_name: snapshot.brand_name ?? parsed.data.brand_name,
      model_name: snapshot.model_name ?? parsed.data.model_name,
      size: snapshot.size ?? parsed.data.size,
    })
    .eq('id', id)
    .select('company_id')
    .maybeSingle()

  if (error) return fail(error)
  if (!data) return { ok: false, error: 'ไม่พบยางที่ต้องการแก้ไข หรือคุณไม่มีสิทธิ์' }

  revalidateTire(data.company_id, id)
  return { ok: true }
}

/**
 * ตัดจำหน่ายยาง (เฉพาะยางที่ไม่ได้ติดตั้งอยู่กับรถ)
 * @param id รหัสยาง
 */
export async function scrapTire(id: string): Promise<ActionResult> {
  await requireSession(['admin', 'super_admin'])
  const supabase = await createClient()

  const { data: tire } = await supabase.from('tires').select('status').eq('id', id).maybeSingle()
  if (tire?.status === 'mounted') {
    return { ok: false, error: 'ยางเส้นนี้ติดตั้งอยู่กับรถ กรุณาถอดออกก่อน' }
  }

  const { data, error } = await supabase
    .from('tires')
    .update({ status: 'scrapped' })
    .eq('id', id)
    .select('company_id')
    .maybeSingle()

  if (error) return fail(error)
  if (data) revalidateTire(data.company_id, id)
  return { ok: true }
}

/**
 * นำยางที่ตัดจำหน่ายกลับเข้าคลัง
 * @param id รหัสยาง
 */
export async function restoreTire(id: string): Promise<ActionResult> {
  await requireSession(['admin', 'super_admin'])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('tires')
    .update({ status: 'in_stock' })
    .eq('id', id)
    .select('company_id')
    .maybeSingle()

  if (error) return fail(error)
  if (data) revalidateTire(data.company_id, id)
  return { ok: true }
}

/**
 * ดึงประวัติการถอด-ใส่ของยาง 1 เส้น (ล่าสุดขึ้นก่อน)
 *
 * ใช้กับ modal ประวัติที่โหลดตอนกดเปิดเท่านั้น จึงไม่ถ่วงเวลาโหลดตาราง
 * RLS คัดกรองให้อยู่แล้ว — super admin เห็นทุกบริษัท ลูกค้าเห็นเฉพาะของตัวเอง
 *
 * @param tireId รหัสยาง
 */
export async function getTireHistoryAction(
  tireId: string,
): Promise<ActionResult<TireEventRow[]>> {
  await requireSession(['admin', 'technician', 'super_admin'])

  const parsed = z.string().uuid('รหัสยางไม่ถูกต้อง').safeParse(tireId)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tire_events')
    .select(TIRE_EVENT_SELECT)
    .eq('tire_id', parsed.data)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  if (error) return fail(error)
  return { ok: true, data: (data ?? []) as unknown as TireEventRow[] }
}

/**
 * หา (หรือสร้าง) ยี่ห้อ/รุ่นยางกรณีพิมพ์ชื่อใหม่ที่ยังไม่มีในระบบ
 * @param brandName ชื่อยี่ห้อ
 * @param modelName ชื่อรุ่น (ไม่บังคับ)
 * @param size ขนาดยาง (ไม่บังคับ)
 * @param companyId บริษัทเป้าหมาย (ระบุเมื่อ super admin ทำแทนลูกค้า)
 * @returns tire_model_id ถ้าสร้าง/พบรุ่น มิฉะนั้น null
 */
export async function ensureBrandModel(
  brandName: string,
  modelName?: string | null,
  size?: string | null,
  companyId?: string,
): Promise<ActionResult<{ brandId: string; modelId: string | null }>> {
  const session = await requireSession(['admin', 'technician', 'super_admin'])
  // super admin เพิ่มเข้าแคตตาล็อกกลาง (created_by_company = null) ให้ทุกบริษัทใช้ร่วมกันได้
  const ownerCompany =
    session.profile.role === 'super_admin' ? null : session.profile.company_id ?? companyId ?? null

  const name = brandName.trim().toUpperCase()
  if (!name) return { ok: false, error: 'กรุณาระบุยี่ห้อยาง' }

  const supabase = await createClient()

  const { data: existingBrand } = await supabase
    .from('tire_brands')
    .select('id')
    .ilike('name', name)
    .maybeSingle()

  let brandId = existingBrand?.id ?? null
  if (!brandId) {
    const { data, error } = await supabase
      .from('tire_brands')
      .insert({ name, created_by_company: ownerCompany })
      .select('id')
      .single()
    if (error) return fail(error)
    brandId = data.id
  }

  if (!modelName?.trim()) return { ok: true, data: { brandId, modelId: null } }

  const { data: existingModel } = await supabase
    .from('tire_models')
    .select('id')
    .eq('brand_id', brandId)
    .ilike('name', modelName.trim())
    .maybeSingle()

  if (existingModel) return { ok: true, data: { brandId, modelId: existingModel.id } }

  const { data: created, error: modelError } = await supabase
    .from('tire_models')
    .insert({
      brand_id: brandId,
      name: modelName.trim(),
      size: size?.trim() || null,
      created_by_company: ownerCompany,
    })
    .select('id')
    .single()

  if (modelError) return fail(modelError)
  return { ok: true, data: { brandId, modelId: created.id } }
}
