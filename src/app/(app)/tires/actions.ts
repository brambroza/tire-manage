'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { resolveCompanyScope } from '@/lib/company-scope'
import { createClient } from '@/lib/supabase/server'
import { ActionResult, fail, zodFail } from '@/lib/action-result'
import { HISTORY_LIMIT, TIRE_EVENT_SELECT, type TireEventRow } from '@/lib/tire-events'
import { featureLockedMessage, hasFeature } from '@/lib/plan'
import { ensureBrandModelFor, insertStockTire, resolveModelSnapshot, tireSchema, type TireInput } from '@/lib/tire-stock'

export type { TireInput } from '@/lib/tire-stock'

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
 * เพิ่มยางเส้นใหม่เข้าคลังจากฟอร์มคลังยาง (คีย์ทีละเส้น)
 * ลูกค้าใช้ได้เฉพาะแพ็กเกจ Premium — super admin ทำแทนได้ทุกแพ็กเกจ
 * (หน้าช่างสร้างยางผ่าน insertStockTire โดยตรง ไม่ผ่านด่านนี้ จึงใช้ได้ทุกแพ็กเกจ)
 * @param input ข้อมูลยางจากฟอร์ม
 * @param companyId บริษัทเป้าหมาย (ระบุเมื่อ super admin ทำแทนลูกค้า)
 */
export async function createTire(
  input: TireInput,
  companyId?: string,
): Promise<ActionResult<{ id: string }>> {
  const scope = await resolveCompanyScope(['admin'], companyId)
  if (!scope.ok) return scope
  if (
    scope.session.profile.role !== 'super_admin' &&
    !hasFeature(scope.session.company, 'tire_manual_add')
  ) {
    return { ok: false, error: featureLockedMessage('tire_manual_add') }
  }

  const supabase = await createClient()
  const created = await insertStockTire(supabase, scope.companyId, input)
  if (!created.ok) return created

  revalidateTire(scope.companyId, created.data!.id)
  return created
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
 * หา (หรือสร้าง) ยี่ห้อ/รุ่นยางกรณีพิมพ์ชื่อใหม่ที่ยังไม่มีในระบบ (เรียกจากฟอร์มคลังยาง)
 * - super admin → เข้าแคตตาล็อกกลาง (ทุกบริษัทใช้ร่วมกันได้)
 * - แอดมินบริษัท → ต้องแพ็กเกจ Premium และรายการใหม่เป็นของบริษัทนั้นเท่านั้น
 * - ช่างสร้างจากฟอร์มนี้ไม่ได้ (หน้าช่างใช้ helper ภายในผ่าน service action แทน)
 * @param brandName ชื่อยี่ห้อ
 * @param modelName ชื่อรุ่น (ไม่บังคับ)
 * @param size ขนาดยาง (ไม่บังคับ)
 * @param companyId บริษัทเป้าหมาย (ระบุเมื่อ super admin ทำแทนลูกค้า — รายการจะเป็นของกลาง)
 * @returns tire_model_id ถ้าสร้าง/พบรุ่น มิฉะนั้น null
 */
export async function ensureBrandModel(
  brandName: string,
  modelName?: string | null,
  size?: string | null,
  companyId?: string,
): Promise<ActionResult<{ brandId: string; modelId: string | null }>> {
  void companyId
  const session = await requireSession(['admin', 'super_admin'])
  const isSuper = session.profile.role === 'super_admin'
  if (!isSuper && !hasFeature(session.company, 'tire_catalog_own')) {
    return { ok: false, error: featureLockedMessage('tire_catalog_own') }
  }
  // super admin เพิ่มเข้าแคตตาล็อกกลาง (created_by_company = null) ให้ทุกบริษัทใช้ร่วมกันได้
  const ownerCompany = isSuper ? null : session.profile.company_id

  const supabase = await createClient()
  const ensured = await ensureBrandModelFor(supabase, ownerCompany, brandName, modelName, size)
  if (!ensured.ok) return ensured
  revalidatePath('/tires')
  revalidatePath('/service')
  return { ok: true, data: { brandId: ensured.data!.brandId, modelId: ensured.data!.modelId } }
}
