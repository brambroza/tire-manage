'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { resolveCompanyScope } from '@/lib/company-scope'
import { createClient } from '@/lib/supabase/server'
import { ActionResult, fail, optionalText, zodFail } from '@/lib/action-result'

const vehicleSchema = z.object({
  plate_no: z.string().trim().min(1, 'กรุณากรอกทะเบียนรถ').max(20),
  province: z.string().trim().min(1, 'กรุณาเลือกจังหวัด'),
  brand: optionalText,
  model: optionalText,
  axle_type: z.string().trim().min(1, 'กรุณาเลือกประเภทเพลา').max(30),
  current_mileage: z.number().int().min(0, 'เลขไมล์ต้องไม่ติดลบ'),
  note: optionalText,
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

  const parsed = vehicleSchema.safeParse(input)
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
    supabase.from('vehicles').select('company_id, axle_type').eq('id', id).maybeSingle(),
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

/**
 * อัปเดตเลขไมล์ล่าสุดของรถ
 * @param id รหัสรถ
 * @param mileage เลขไมล์ล่าสุด
 */
export async function updateMileage(id: string, mileage: number): Promise<ActionResult> {
  await requireSession(['admin', 'technician', 'super_admin'])
  if (!Number.isFinite(mileage) || mileage < 0) {
    return { ok: false, error: 'เลขไมล์ไม่ถูกต้อง' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vehicles')
    .update({ current_mileage: Math.round(mileage) })
    .eq('id', id)
    .select('company_id')
    .maybeSingle()

  if (error) return fail(error)
  if (data) revalidateVehicle(data.company_id, id)
  return { ok: true }
}
