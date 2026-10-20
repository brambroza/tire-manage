import {
  LayoutDashboard, Truck, CircleDot, Users, Building2, Wrench, BarChart3, BookOpen, Upload,
} from 'lucide-react'
import { AppShell, type NavItem } from '@/components/app-shell'
import { NotificationBell } from '@/components/notification-bell'
import { requireSession } from '@/lib/auth'
import { getTireAlerts } from '@/lib/notifications'
import { hasFeature } from '@/lib/plan'
import type { Company, UserRole } from '@/lib/database.types'

const ICON = 'size-5'

const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard',   label: 'ภาพรวม',            icon: <LayoutDashboard className={ICON} />, exact: true },
  { href: '/reports/fleet', label: 'รายงานรถ',          icon: <BarChart3 className={ICON} /> },
  { href: '/vehicles',    label: 'จัดการรถ',           icon: <Truck className={ICON} /> },
  { href: '/tires',       label: 'คลังยาง',            icon: <CircleDot className={ICON} /> },
  { href: '/catalog',     label: 'ข้อมูลยาง',           icon: <BookOpen className={ICON} /> },
  { href: '/tires/import', label: 'ข้อมูลยางใหม่',      icon: <Upload className={ICON} /> },
  { href: '/service',     label: 'บันทึกถอด-ใส่ยาง',   icon: <Wrench className={ICON} /> },
  { href: '/technicians', label: 'ช่างของบริษัท',       icon: <Users className={ICON} /> },
  { href: '/company',     label: 'ข้อมูลบริษัท',        icon: <Building2 className={ICON} /> },
]

// ช่างเห็นเฉพาะหน้าทำงานหน้างาน — ไม่มีเมนูค้นหายาง/รถตามสเปคหน้าช่าง
// เมนู "บันทึกเลขไมล์" ถูกเอาออก (ลูกค้าให้เหลือ "บันทึกถอด-ใส่ยาง" อย่างเดียว) — หน้า /mileage ยังเข้าได้จากลิงก์
// "บันทึกไมล์" ในหน้าจัดการรถ และลิงก์เตือนไมล์เก่าในหน้ารายละเอียดยาง
const TECH_NAV: NavItem[] = [
  { href: '/service', label: 'บันทึกถอด-ใส่ยาง', icon: <Wrench className={ICON} />, exact: true },
]

/**
 * เมนูที่ซ่อนไว้เมื่อแพ็กเกจยังไม่เปิดฟีเจอร์ — มีเฉพาะลูกค้า Premium:
 * "ข้อมูลยาง" (แคตตาล็อกรุ่นที่ได้รับสิทธิ์) และ "ข้อมูลยางใหม่" (นำเข้า + ประวัตินำเข้า)
 */
const PREMIUM_ONLY_NAV = new Set(['/catalog', '/tires/import'])

/**
 * เมนูตามสิทธิ์และแพ็กเกจของบริษัท
 * @param role บทบาทผู้ใช้
 * @param company บริษัทของผู้ใช้ (ใช้ตรวจแพ็กเกจ)
 */
function navFor(role: UserRole, company: Company | null): NavItem[] {
  if (role !== 'admin') return TECH_NAV
  const premium = hasFeature(company, 'tire_import')
  return ADMIN_NAV.filter((item) => premium || !PREMIUM_ONLY_NAV.has(item.href))
}

/** Layout ฝั่งลูกค้า (แอดมินบริษัท + ช่าง) */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, company } = await requireSession(['admin', 'technician'])

  // แจ้งเตือนยางถึงเกณฑ์ — เฉพาะแอดมินบริษัทที่ดูแลภาพรวม
  const feed = profile.role === 'admin' ? await getTireAlerts(company) : null

  return (
    <AppShell
      nav={navFor(profile.role, company)}
      userName={profile.full_name}
      role={profile.role}
      companyName={company?.name}
      topbarActions={feed ? <NotificationBell feed={feed} /> : null}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
    </AppShell>
  )
}
