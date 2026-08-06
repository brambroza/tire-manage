'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ActionResult, fail, optionalText, zodFail } from '@/lib/action-result'

const companySchema = z.object({
  name: z.string().trim().min(1, 'กรุณากรอกชื่อบริษัท'),
  tax_id: optionalText,
  phone: optionalText,
  email: optionalText,
  address: optionalText,
  contact_name: optionalText,
  alert_km: z.number().int().min(1, 'ต้องมากกว่า 0'),
  alert_tread_mm: z.number().min(0, 'ต้องไม่ติดลบ'),
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
  return { ok: true }
}
