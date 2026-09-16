'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { resolveCompanyScope } from '@/lib/company-scope'
import { createClient } from '@/lib/supabase/server'
import { ActionResult, fail, optionalNumber, optionalText, zodFail } from '@/lib/action-result'
import { HISTORY_LIMIT, VEHICLE_EVENT_SELECT, type VehicleEventRow } from '@/lib/tire-events'
import { ODOMETER_MAX, ODOMETER_MAX_MESSAGE, PLATE_PATTERN, PLATE_PATTERN_MESSAGE } from '@/lib/utils'

const vehicleSchema = z.object({
  plate_no: z.string().trim().min(1, 'กรุณากรอกทะเบียนรถ').max(20),
  province: z.string().trim().min(1, 'กรุณาเลือกจังหวัด'),
  brand: optionalText,
  model: optionalText,
  axle_type: z.string().trim().min(1, 'กรุณาเลือกประเภทเพลา').max(30),
  current_mileage: z
    .number()
    .int()
    .min(0, 'เลขไมล์ต้องไม่ติดลบ')
    .max(ODOMETER_MAX, ODOMETER_MAX_MESSAGE),
  /** ค่าเฉลี่ยที่รถคันนี้วิ่งต่อเดือน — เว้นว่าง = ใช้ค่ากลางของบริษัท */
  avg_km_per_month: optionalNumber.refine(
    (v) => v === null || (Number.isInteger(v) && v > 0 && v <= ODOMETER_MAX),
    'ต้องเป็นจำนวนเต็มบวก ไม่เกิน 999,999',
  ),
  note: optionalText,
})

/** รถใหม่ต้องใช้ทะเบียนตามรูปแบบมาตรฐาน (รถเดิมที่บันทึกไว้ก่อนกฎนี้ยังแก้ข้อมูลอื่นได้) */
const newVehicleSchema = vehicleSchema.extend({
  plate_no: vehicleSchema.shape.plate_no.regex(PLATE_PATTERN, PLATE_PATTERN_MESSAGE),
})

export type VehicleInput = z.input<typeof vehicleSchema>

/** revalidate ทั้งหน้าฝั่งลูกค้าและหน้าที่ super admin ใช้ดูแลลูกค้ารายนั้น */
function revalidateVehicle(companyId: string, vehicleId?: string) {
  revalidatePath('/vehicles')
  revalidatePath('/service')
  if (vehicleId) revalidatePath(`/vehicles/${vehicleId}`)
  revalidatePath(`/superadmin/companies/${companyId}`)
  revalidatePath(`/superadmin/companies/${companyId}/vehicles`)
}

/**
 * ตรวจว่าบริษัทนั้นได้รับสิทธิ์ใช้ประเภทเพลานี้จาก super admin หรือไม่
 * (จำเป็นสำหรับกรณี super admin ทำแทนลูกค้า เพราะ RLS ไม่ได้กรองให้)
 * @param companyId รหัสบริษัทเจ้าของรถ
 * @param axleTypeCode รหัสประเภทเพลาที่เลือก
 */
async function isAxleTypeAllowed(companyId: string, axleTypeCode: string): Promise<boolean> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('company_axle_types')
    .select('axle_type_id, axle_types!inner(code)', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('axle_types.code', axleTypeCode)
  return (count ?? 0) > 0
}

const AXLE_TYPE_DENIED: ActionResult<never> = {
  ok: false,
  error: 'บริษัทนี้ยังไม่ได้รับสิทธิ์ใช้ประเภทเพลาดังกล่าว',
  fieldErrors: { axle_type: 'กรุณาเลือกประเภทเพลาที่บริษัทได้รับสิทธิ์' },
}

/**
 * เพิ่มรถใหม่
 * @param input ข้อมูลรถจากฟอร์ม
 * @param companyId บริษัทเป้าหมาย (ระบุเมื่อ super admin ทำแทนลูกค้า)
 */
export async function createVehicle(
  input: VehicleInput,
  companyId?: string,
): Promise<ActionResult<{ id: string }>> {
  const scope = await resolveCompanyScope(['admin'], companyId)
  if (!scope.ok) return scope

  const parsed = newVehicleSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { data: axleType, error: axleTypeError } = await supabase
    .from('axle_types')
    .select('code, is_active')
    .eq('code', parsed.data.axle_type)
    .maybeSingle()

  if (axleTypeError) return fail(axleTypeError)
  if (!axleType?.is_active) {
    return {
      ok: false,
      error: 'ประเภทเพลานี้ไม่มีในระบบหรือถูกปิดใช้งาน',
      fieldErrors: { axle_type: 'กรุณาเลือกประเภทเพลาที่เปิดใช้งาน' },
    }
  }

  if (!(await isAxleTypeAllowed(scope.companyId, parsed.data.axle_type))) return AXLE_TYPE_DENIED

  const { data, error } = await supabase
    .from('vehicles')
    .insert({ ...parsed.data, company_id: scope.companyId })
    .select('id')
    .single()

  if (error) return fail(error)
  revalidateVehicle(scope.companyId, data.id)
  return { ok: true, data: { id: data.id } }
}

/**
 * แก้ไขข้อมูลรถ
 * @param id รหัสรถ
 * @param input ข้อมูลที่แก้ไข
 */
export async function updateVehicle(id: string, input: VehicleInput): Promise<ActionResult> {
  await requireSession(['admin', 'super_admin'])
  const parsed = vehicleSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const [currentResult, axleTypeResult] = await Promise.all([
    supabase.from('vehicles').select('company_id, axle_type, plate_no').eq('id', id).maybeSingle(),
    supabase
      .from('axle_types')
      .select('code, is_active')
      .eq('code', parsed.data.axle_type)
      .maybeSingle(),
  ])

  if (currentResult.error) return fail(currentResult.error)
  if (!currentResult.data) {
    return { ok: false, error: 'ไม่พบรถที่ต้องการแก้ไข หรือคุณไม่มีสิทธิ์' }
  }
  if (axleTypeResult.error) return fail(axleTypeResult.error)

  // ทะเบียนที่เปลี่ยนใหม่ต้องเป็นรูปแบบมาตรฐาน (ทะเบียนเดิมที่บันทึกไว้ก่อนกฎนี้คงไว้ได้)
  if (
    currentResult.data.plate_no !== parsed.data.plate_no &&
    !PLATE_PATTERN.test(parsed.data.plate_no)
  ) {
    return { ok: false, error: PLATE_PATTERN_MESSAGE, fieldErrors: { plate_no: PLATE_PATTERN_MESSAGE } }
  }

  if (
    !axleTypeResult.data ||
    (!axleTypeResult.data.is_active && currentResult.data.axle_type !== parsed.data.axle_type)
  ) {
    return {
      ok: false,
      error: 'ประเภทเพลานี้ไม่มีในระบบหรือถูกปิดใช้งาน',
      fieldErrors: { axle_type: 'กรุณาเลือกประเภทเพลาที่เปิดใช้งาน' },
    }
  }

  // เปลี่ยนประเภทเพลาได้เฉพาะแบบที่บริษัทได้รับสิทธิ์ (ของเดิมคงไว้ได้เสมอ)
  if (
    currentResult.data.axle_type !== parsed.data.axle_type &&
    !(await isAxleTypeAllowed(currentResult.data.company_id, parsed.data.axle_type))
  ) {
    return AXLE_TYPE_DENIED
  }

  const { data, error } = await supabase
    .from('vehicles')
    .update(parsed.data)
    .eq('id', id)
    .select('company_id')
    .maybeSingle()

  if (error) return fail(error)
  if (!data) return { ok: false, error: 'ไม่พบรถที่ต้องการแก้ไข หรือคุณไม่มีสิทธิ์' }

  revalidateVehicle(data.company_id, id)
  return { ok: true }
}

/**
 * ปิดใช้งานรถ (soft delete) — ถ้ายังมียางติดตั้งอยู่จะไม่อนุญาต
 * @param id รหัสรถ
 */
export async function deactivateVehicle(id: string): Promise<ActionResult> {
  await requireSession(['admin', 'super_admin'])
  const supabase = await createClient()

  const { count } = await supabase
    .from('tires')
    .select('id', { count: 'exact', head: true })
    .eq('vehicle_id', id)
    .eq('status', 'mounted')

  if ((count ?? 0) > 0) {
    return { ok: false, error: `รถคันนี้ยังมียางติดตั้งอยู่ ${count} เส้น กรุณาถอดยางออกก่อน` }
  }

  const { data, error } = await supabase
    .from('vehicles')
    .update({ is_active: false })
    .eq('id', id)
    .select('company_id')
    .maybeSingle()

  if (error) return fail(error)
  if (data) revalidateVehicle(data.company_id, id)
  return { ok: true }
}

/**
 * เปิดใช้งานรถอีกครั้ง
 * @param id รหัสรถ
 */
export async function reactivateVehicle(id: string): Promise<ActionResult> {
  await requireSession(['admin', 'super_admin'])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vehicles')
    .update({ is_active: true })
    .eq('id', id)
    .select('company_id')
    .maybeSingle()

  if (error) return fail(error)
  if (data) revalidateVehicle(data.company_id, id)
  return { ok: true }
}

const mileageSchema = z.object({
  vehicle_id: z.string().uuid(),
  mileage: z
    .number()
    .int('เลขไมล์ต้องเป็นจำนวนเต็ม')
    .min(0, 'เลขไมล์ต้องไม่ติดลบ')
    .max(ODOMETER_MAX, ODOMETER_MAX_MESSAGE),
})

export interface UpdateMileageResult {
  plate_no: string
  previous_mileage: number
  current_mileage: number
}

/**
 * บันทึกเลขไมล์ล่าสุดของรถโดยไม่ต้องถอด-ใส่ยาง
 *
 * ใช้ให้ระยะรอบนี้ของยางทุกเส้นบนรถอัปเดตตามการวิ่งจริง (view tire_overview คำนวณสดจากค่านี้)
 * เลขไมล์ใหม่ต้องไม่น้อยกว่าค่าเดิม เพราะระยะรอบนี้ = ไมล์รถ − ไมล์ตอนใส่ยาง ห้ามถอยหลัง
 * RLS จำกัดให้เห็นเฉพาะรถของบริษัทตัวเองอยู่แล้ว (super admin เห็นทุกบริษัท)
 *
 * @param id รหัสรถ
 * @param mileage เลขไมล์ล่าสุด (ไม่เกิน 6 หลัก)
 */
export async function updateMileage(
  id: string,
  mileage: number,
): Promise<ActionResult<UpdateMileageResult>> {
  await requireSession(['admin', 'technician', 'super_admin'])
  const parsed = mileageSchema.safeParse({ vehicle_id: id, mileage })
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { data: current, error: findError } = await supabase
    .from('vehicles')
    .select('id, plate_no, current_mileage, is_active')
    .eq('id', id)
    .maybeSingle()
  if (findError) return fail(findError)
  if (!current) return { ok: false, error: 'ไม่พบรถคันนี้ หรือคุณไม่มีสิทธิ์' }
  if (!current.is_active) return { ok: false, error: 'รถคันนี้ถูกปิดใช้งานแล้ว — แจ้งแอดมินให้เปิดใช้งานก่อน' }

  if (parsed.data.mileage < current.current_mileage) {
    return {
      ok: false,
      error: `เลขไมล์ใหม่ต้องไม่น้อยกว่าเลขไมล์ล่าสุดในระบบ (${current.current_mileage.toLocaleString('th-TH')} กม.)`,
      fieldErrors: { mileage: 'ต้องไม่น้อยกว่าเลขไมล์ล่าสุด' },
    }
  }

  // ประทับเวลาด้วยเสมอ — แม้เลขเท่าเดิม ("วันนี้รถไม่ได้วิ่ง" ก็เป็นข้อมูลจริง)
  // ค่านี้เป็นจุดตั้งต้นของการประมาณระยะ ต้องขยับทุกครั้งที่มีคนยืนยันเลขไมล์
  const { data, error } = await supabase
    .from('vehicles')
    .update({
      current_mileage: parsed.data.mileage,
      mileage_updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('company_id')
    .maybeSingle()

  if (error) return fail(error)
  if (data) {
    revalidateVehicle(data.company_id, id)
    revalidatePath('/dashboard')
    revalidatePath('/tires')
    revalidatePath('/mileage')
    revalidatePath(`/superadmin/companies/${data.company_id}/tires`)
  }
  return {
    ok: true,
    data: {
      plate_no: current.plate_no,
      previous_mileage: current.current_mileage,
      current_mileage: parsed.data.mileage,
    },
  }
}

/**
 * ดึงประวัติการถอด-ใส่ยางของรถ 1 คัน (ล่าสุดขึ้นก่อน)
 *
 * ใช้กับ modal ประวัติที่โหลดตอนกดเปิดเท่านั้น จึงไม่ถ่วงเวลาโหลดตาราง
 * RLS คัดกรองให้อยู่แล้ว — super admin เห็นทุกบริษัท ลูกค้าเห็นเฉพาะของตัวเอง
 *
 * @param vehicleId รหัสรถ
 */
export async function getVehicleHistoryAction(
  vehicleId: string,
): Promise<ActionResult<VehicleEventRow[]>> {
  await requireSession(['admin', 'technician', 'super_admin'])

  const parsed = z.string().uuid('รหัสรถไม่ถูกต้อง').safeParse(vehicleId)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tire_events')
    .select(VEHICLE_EVENT_SELECT)
    .eq('vehicle_id', parsed.data)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  if (error) return fail(error)
  return { ok: true, data: (data ?? []) as unknown as VehicleEventRow[] }
}

/**
 * ค่าเฉลี่ย กม./เดือน ที่คำนวณได้จากประวัติถอด-ใส่ยางของรถคันนี้
 *
 * ใช้เป็นคำแนะนำใต้ช่องกรอกในฟอร์ม ไม่ได้นำไปใช้อัตโนมัติ — ค่านี้เป็นการตัดสินใจ
 * ของลูกค้า แต่ทำให้ตัวเลขเริ่มต้นไม่ใช่การเดาลอย ๆ
 *
 * @param vehicleId รถที่ต้องการดู
 * @returns null ถ้าประวัติน้อยเกินกว่าจะคำนวณได้อย่างมีความหมาย
 */
export async function getObservedMonthlyKm(
  vehicleId: string,
): Promise<ActionResult<{ kmPerMonth: number; sampleEvents: number; lastDate: string } | null>> {
  await requireSession(['admin', 'super_admin'])

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vehicle_observed_monthly_km')
    .select('observed_km_per_month, sample_events, last_date')
    .eq('vehicle_id', vehicleId)
    .maybeSingle()

  if (error) return fail(error)
  if (!data) return { ok: true, data: null }
  return {
    ok: true,
    data: {
      kmPerMonth: data.observed_km_per_month,
      sampleEvents: data.sample_events,
      lastDate: data.last_date,
    },
  }
}
