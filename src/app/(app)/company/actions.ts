'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ActionResult, fail, optionalNumber, optionalText, zodFail } from '@/lib/action-result'

/** ตัวเลขจำนวนเต็มบวกที่เว้นว่างได้ — ว่าง = null (ปิดใช้งาน / สืบทอดค่าอื่น) */
const optionalPositiveInt = (max: number, maxMessage: string) =>
  optionalNumber.refine(
    (v) => v === null || (Number.isInteger(v) && v > 0 && v <= max),
    maxMessage,
  )

const companySchema = z.object({
  name: z.string().trim().min(1, 'กรุณากรอกชื่อบริษัท'),
  tax_id: optionalText,
  phone: optionalText,
  email: optionalText,
  address: optionalText,
  contact_name: optionalText,
  alert_km: z.number().int().min(1, 'ต้องมากกว่า 0'),
  alert_tread_mm: z.number().min(0, 'ต้องไม่ติดลบ'),
  /** รถ "เปลี่ยนยางบ่อย" = ถอดยางตั้งแต่เท่านี้ครั้ง ภายในช่วงวันด้านล่าง */
  alert_change_count: z.number().int().min(1, 'ต้องมากกว่า 0').max(999, 'มากเกินไป'),
  alert_change_days: z.number().int().min(1, 'ต้องมากกว่า 0').max(3650, 'ไม่เกิน 10 ปี'),
  /** ระยะสะสมตลอดอายุยาง — ว่าง = ปิดการเตือนข้อนี้ */
  alert_lifetime_km: optionalPositiveInt(9_999_999, 'ต้องเป็นจำนวนเต็มบวก ไม่เกิน 9,999,999'),
  /** ค่าเฉลี่ยกลางของฟลีต — ว่าง = ไม่ประมาณการให้รถที่ไม่ได้กรอกค่าของตัวเอง */
  avg_km_per_month: optionalPositiveInt(999_999, 'ต้องเป็นจำนวนเต็มบวก ไม่เกิน 999,999'),
  estimate_max_days: z.number().int().min(1, 'ต้องมากกว่า 0').max(3650, 'ไม่เกิน 10 ปี'),
})

export type CompanyInput = z.input<typeof companySchema>

/**
 * แก้ไขข้อมูลบริษัทของตัวเอง รวมถึงเกณฑ์แจ้งเตือนการใช้งานยาง
 * @param input ข้อมูลบริษัทจากฟอร์ม
 */
export async function updateOwnCompany(input: CompanyInput): Promise<ActionResult> {
  const { profile } = await requireSession(['admin'])
  const parsed = companySchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase
    .from('companies')
    .update(parsed.data)
    .eq('id', profile.company_id!)

  if (error) return fail(error)
  revalidatePath('/company')
  revalidatePath('/dashboard')
  revalidatePath('/vehicles')
  revalidatePath('/tires')
  return { ok: true }
}

/**
 * นับยางที่จะเข้าเกณฑ์ทันทีถ้าตั้งระยะสะสมเท่านี้
 *
 * ใช้แสดงตัวอย่างก่อนกดบันทึก เพราะถ้าตั้งเกณฑ์ต่ำเกินไป ยางเก่าทั้งฟลีต
 * จะเด้งพร้อมกันเป็นพรวดโดยไม่ทันตั้งตัว
 *
 * @param lifetimeKm เกณฑ์ระยะสะสมที่กำลังจะตั้ง (กม.)
 */
export async function previewLifetimeAlertCount(
  lifetimeKm: number,
): Promise<ActionResult<{ count: number }>> {
  const { profile } = await requireSession(['admin'])
  if (!Number.isInteger(lifetimeKm) || lifetimeKm <= 0) {
    return { ok: false, error: 'เกณฑ์ต้องเป็นจำนวนเต็มบวก' }
  }

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('tire_overview')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', profile.company_id!)
    .neq('status', 'scrapped')
    .gte('estimated_lifetime_km', lifetimeKm)

  if (error) return fail(error)
  return { ok: true, data: { count: count ?? 0 } }
}
