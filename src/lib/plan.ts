import type { Company, CompanyPlan } from '@/lib/database.types'

/** ชื่อแพ็กเกจสำหรับแสดงผล */
export const PLAN_LABEL: Record<CompanyPlan, string> = {
  standard: 'Standard',
  premium: 'Premium',
}

/** ฟีเจอร์ที่ถูกล็อกด้วยแพ็กเกจ — เพิ่ม key ใหม่ที่นี่เมื่อมีฟีเจอร์เสริมอื่น */
export type PremiumFeature = 'tire_import' | 'tire_manual_add' | 'tire_catalog_own'

/** คำอธิบายฟีเจอร์ ใช้ในข้อความ "ต้องใช้แพ็กเกจ Premium" */
export const FEATURE_LABEL: Record<PremiumFeature, string> = {
  tire_import: 'นำเข้าซีรีย์ยางจากไฟล์',
  tire_manual_add: 'คีย์ซีรีย์ยางเข้าคลังทีละเส้น',
  tire_catalog_own: 'เพิ่มยี่ห้อ/รุ่นยางของบริษัทเอง',
}

/**
 * แพ็กเกจที่มีผลจริง ณ วันนี้ — premium ที่เลยวันหมดอายุแล้วถือเป็น standard
 * @param company บริษัท (null = ไม่มีบริษัท เช่น super admin)
 * @param today วันที่ใช้เทียบ (ใส่ได้เพื่อทดสอบ)
 */
export function effectivePlan(
  company: Pick<Company, 'plan' | 'plan_expires_at'> | null,
  today = new Date(),
): CompanyPlan {
  if (!company) return 'standard'
  if (company.plan !== 'premium') return 'standard'
  if (!company.plan_expires_at) return 'premium'
  const todayISO = today.toISOString().slice(0, 10)
  return company.plan_expires_at >= todayISO ? 'premium' : 'standard'
}

/**
 * บริษัทนี้ใช้ฟีเจอร์เสริมได้ไหม
 * @param company บริษัทที่ตรวจ
 * @param feature ฟีเจอร์ที่ต้องการ
 */
export function hasFeature(
  company: Pick<Company, 'plan' | 'plan_expires_at'> | null,
  feature: PremiumFeature,
): boolean {
  void feature // ทุกฟีเจอร์ตอนนี้ผูกกับ premium ทั้งหมด — แยก map ภายหลังได้
  return effectivePlan(company) === 'premium'
}

/** ข้อความแจ้งเมื่อฟีเจอร์ถูกล็อก */
export function featureLockedMessage(feature: PremiumFeature): string {
  return `${FEATURE_LABEL[feature]} ใช้ได้เฉพาะแพ็กเกจ Premium — ติดต่อ Dreammaker เพื่อเปิดใช้งาน`
}
