import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fail, optionalNumber, optionalText, zodFail, type ActionResult } from '@/lib/action-result'
import { SERIAL_MAX, SERIAL_PATTERN, SERIAL_PATTERN_MESSAGE } from '@/lib/utils'
import type { Database } from '@/lib/database.types'

/**
 * ข้อมูลยาง 1 เส้นสำหรับเพิ่ม/แก้ไข — ใช้ร่วมกันระหว่างฟอร์มคลังยางและหน้าช่าง
 * (อยู่นอกไฟล์ 'use server' เพราะ schema/ค่าคงที่ export จากไฟล์ action ไม่ได้)
 */
export const tireSchema = z.object({
  /** ซีรีย์ยาง: แปลงเป็นตัวพิมพ์ใหญ่ก่อน แล้วรับเฉพาะ A-Z 0-9 ขีด (ให้พิมพ์เล็ก/ใหญ่หากันเจอ) */
  serial_no: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'กรุณากรอกเลขยาง (ซีเรียล)')
    .max(SERIAL_MAX, `ซีรีย์ยางยาวได้ไม่เกิน ${SERIAL_MAX} ตัว`)
    .regex(SERIAL_PATTERN, SERIAL_PATTERN_MESSAGE),
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

type Supabase = SupabaseClient<Database>

/**
 * เติมชื่อยี่ห้อ/รุ่น/ขนาด จาก tire_model_id ที่เลือกไว้ เพื่อเก็บ snapshot ไว้กับยางเส้นนั้น
 * (กันข้อมูลกลางถูกแก้ภายหลังแล้วประวัติเพี้ยน)
 * @param supabase client ของผู้ใช้ปัจจุบัน
 * @param modelId รุ่นที่เลือก (null = ไม่ได้เลือกจากแคตตาล็อก)
 */
export async function resolveModelSnapshot(
  supabase: Supabase,
  modelId: string | null,
): Promise<{ brand_name?: string | null; model_name?: string; size?: string | null }> {
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
 * หา (หรือสร้าง) ยี่ห้อ/รุ่นยางที่ยังไม่มีในระบบ — ไม่ตรวจสิทธิ์เอง ผู้เรียกต้องตรวจแพ็กเกจ/บทบาทมาก่อน
 *
 * ยี่ห้อ: ใช้ของเดิมถ้ามีชื่อตรงกัน (ไม่สนตัวพิมพ์) ไม่ว่าใครสร้าง มิฉะนั้นสร้างใหม่เป็นของ ownerCompany
 * รุ่น: เทียบทั้งชื่อและขนาด (รุ่นเดียวกันคนละขนาดถือเป็นคนละรายการ) ไม่พบจึงสร้างเป็นของ ownerCompany
 * รุ่นที่สร้างโดยบริษัทจะเห็นเฉพาะบริษัทนั้น (RLS: created_by_company) ไม่ปนกับลูกค้ารายอื่น
 *
 * @param supabase client ของผู้ใช้ปัจจุบัน
 * @param ownerCompany บริษัทเจ้าของรายการใหม่ — null = แคตตาล็อกกลางของ super admin
 * @param brandName ชื่อยี่ห้อ
 * @param modelName ชื่อรุ่น (ไม่บังคับ)
 * @param size ขนาดยาง (ไม่บังคับ)
 * @param newTreadMm ดอกยางตอนใหม่ของรุ่นที่สร้าง (ไม่บังคับ)
 */
export async function ensureBrandModelFor(
  supabase: Supabase,
  ownerCompany: string | null,
  brandName: string,
  modelName?: string | null,
  size?: string | null,
  newTreadMm?: number | null,
): Promise<ActionResult<{ brandId: string; modelId: string | null; created: boolean }>> {
  const name = brandName.trim().toUpperCase()
  if (!name) return { ok: false, error: 'กรุณาระบุยี่ห้อยาง' }

  const { data: existingBrand, error: brandLookupError } = await supabase
    .from('tire_brands')
    .select('id')
    .ilike('name', name)
    .maybeSingle()
  if (brandLookupError) return fail(brandLookupError)

  let brandId = existingBrand?.id ?? null
  let created = false
  if (!brandId) {
    const { data, error } = await supabase
      .from('tire_brands')
      .insert({ name, created_by_company: ownerCompany })
      .select('id')
      .single()
    if (error) return fail(error)
    brandId = data.id
    created = true
  }

  const model = modelName?.trim() ?? ''
  if (!model) return { ok: true, data: { brandId, modelId: null, created } }
  const sizeValue = size?.trim() || null

  let modelQuery = supabase.from('tire_models').select('id').eq('brand_id', brandId).ilike('name', model)
  modelQuery = sizeValue ? modelQuery.ilike('size', sizeValue) : modelQuery.is('size', null)
  const { data: existingModel, error: modelLookupError } = await modelQuery.maybeSingle()
  if (modelLookupError) return fail(modelLookupError)
  if (existingModel) return { ok: true, data: { brandId, modelId: existingModel.id, created } }

  const { data: createdModel, error: modelError } = await supabase
    .from('tire_models')
    .insert({
      brand_id: brandId,
      name: model,
      size: sizeValue,
      new_tread_mm: newTreadMm ?? null,
      created_by_company: ownerCompany,
    })
    .select('id')
    .single()
  if (modelError) {
    // unique (brand_id, name, size) ชน = มีรุ่นนี้ในแคตตาล็อกกลางแล้วแต่บริษัทยังไม่ได้รับสิทธิ์ (RLS เลยมองไม่เห็น)
    if ((modelError as { code?: string }).code === '23505') {
      return { ok: false, error: `รุ่น ${name} ${model}${sizeValue ? ` ${sizeValue}` : ''} มีในแคตตาล็อกกลางแล้ว — แจ้ง Dreammaker เปิดสิทธิ์ให้บริษัท` }
    }
    return fail(modelError)
  }
  return { ok: true, data: { brandId, modelId: createdModel.id, created: true } }
}

/**
 * เพิ่มยาง 1 เส้นเข้าคลังของบริษัท (สถานะ "อยู่ในคลัง") — ไม่ตรวจสิทธิ์เอง
 * ผู้เรียกต้องตรวจ session/แพ็กเกจมาก่อน (ฟอร์มคลังยางต้อง Premium, หน้าช่างใช้ได้ทุกแพ็กเกจ)
 * @param supabase client ของผู้ใช้ปัจจุบัน (RLS ยังคุม company_id อยู่)
 * @param companyId บริษัทเจ้าของยาง
 * @param input ข้อมูลยางจากฟอร์ม
 */
export async function insertStockTire(
  supabase: Supabase,
  companyId: string,
  input: TireInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = tireSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const snapshot = await resolveModelSnapshot(supabase, parsed.data.tire_model_id)

  const { data, error } = await supabase
    .from('tires')
    .insert({
      ...parsed.data,
      // ถ้าเลือกรุ่นจากแคตตาล็อกให้ใช้ค่าจากแคตตาล็อกก่อน มิฉะนั้นใช้ที่พิมพ์เอง
      brand_name: snapshot.brand_name ?? parsed.data.brand_name,
      model_name: snapshot.model_name ?? parsed.data.model_name,
      size: snapshot.size ?? parsed.data.size,
      company_id: companyId,
      status: 'in_stock',
    })
    .select('id')
    .single()

  if (error) return fail(error)
  return { ok: true, data: { id: data.id } }
}
