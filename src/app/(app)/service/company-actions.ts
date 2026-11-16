'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { ActionResult, fail } from '@/lib/action-result'

/**
 * ช่างส่วนกลางเลือก/สลับบริษัทลูกค้าที่จะทำงานด้วย
 * เก็บใน profiles.company_id ทำให้ RLS ทุกตารางมองช่างเป็นช่างของบริษัทนั้นทันที
 *
 * @param companyId รหัสบริษัทที่ต้องการทำงานด้วย
 */
export async function selectWorkCompanyAction(companyId: string): Promise<ActionResult> {
  const session = await requireSession(['technician'])
  if (!session.profile.all_companies) {
    return { ok: false, error: 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงหลายบริษัท' }
  }

  const parsed = z.string().uuid().safeParse(companyId)
  if (!parsed.success) return { ok: false, error: 'รหัสบริษัทไม่ถูกต้อง' }

  try {
    const admin = createAdminClient()
    const { data: company } = await admin
      .from('companies')
      .select('id, is_active')
      .eq('id', parsed.data)
      .maybeSingle()
    if (!company || !company.is_active) {
      return { ok: false, error: 'ไม่พบบริษัท หรือบริษัทนี้ปิดใช้งานอยู่' }
    }

    const { error } = await admin
      .from('profiles')
      .update({ company_id: company.id })
      .eq('id', session.userId)
      .eq('all_companies', true)
    if (error) return fail(error)
  } catch (e) {
    return fail(e)
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
