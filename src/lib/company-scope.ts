import { requireSession, type SessionContext } from '@/lib/auth'
import type { ActionResult } from '@/lib/action-result'
import type { UserRole } from '@/lib/database.types'

/**
 * ตรวจสิทธิ์แล้วหาว่า action นี้ทำงานกับบริษัทไหน
 *
 * - แอดมิน/ช่างของลูกค้า → ทำได้เฉพาะบริษัทตัวเอง (ค่า companyId ที่ส่งมาถูกละเว้น)
 * - super admin → ต้องระบุ companyId เสมอ เพราะไม่ได้สังกัดบริษัทใด
 *
 * @param allowed role ที่เข้าถึง action นี้ได้ (super_admin จะถูกเติมให้อัตโนมัติ)
 * @param companyId บริษัทเป้าหมาย ใช้เฉพาะกรณี super admin
 */
export async function resolveCompanyScope(
  allowed: UserRole[],
  companyId?: string,
): Promise<
  { ok: true; session: SessionContext; companyId: string } | (ActionResult<never> & { ok: false })
> {
  const session = await requireSession([...allowed, 'super_admin'])

  if (session.profile.role === 'super_admin') {
    if (!companyId) {
      return { ok: false, error: 'กรุณาระบุบริษัทที่ต้องการจัดการ' }
    }
    return { ok: true, session, companyId }
  }

  if (!session.profile.company_id) {
    return { ok: false, error: 'บัญชีนี้ยังไม่ได้ผูกกับบริษัท' }
  }

  return { ok: true, session, companyId: session.profile.company_id }
}
