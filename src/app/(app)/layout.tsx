import {
  LayoutDashboard, Truck, CircleDot, Users, Building2, Wrench,
} from 'lucide-react'
import { AppShell, type NavItem } from '@/components/app-shell'
import { NotificationBell } from '@/components/notification-bell'
import { requireSession } from '@/lib/auth'
import { getTireAlerts } from '@/lib/notifications'
import type { UserRole } from '@/lib/database.types'

const ICON = 'size-5'

const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard',   label: 'ภาพรวม',            icon: <LayoutDashboard className={ICON} />, exact: true },
  { href: '/vehicles',    label: 'จัดการรถ',           icon: <Truck className={ICON} /> },
  { href: '/tires',       label: 'คลังยาง',            icon: <CircleDot className={ICON} /> },
  { href: '/service',     label: 'บันทึกถอด-ใส่ยาง',   icon: <Wrench className={ICON} /> },
  { href: '/technicians', label: 'ช่างของบริษัท',       icon: <Users className={ICON} /> },
  { href: '/company',     label: 'ข้อมูลบริษัท',        icon: <Building2 className={ICON} /> },
]

// ช่างเห็นเฉพาะหน้าทำงานหน้างาน — ไม่มีเมนูค้นหายาง/รถตามสเปคหน้าช่าง
const TECH_NAV: NavItem[] = [
  { href: '/service', label: 'บันทึกถอด-ใส่ยาง', icon: <Wrench className={ICON} />, exact: true },
]

function navFor(role: UserRole): NavItem[] {
  return role === 'admin' ? ADMIN_NAV : TECH_NAV
}

/** Layout ฝั่งลูกค้า (แอดมินบริษัท + ช่าง) */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, company } = await requireSession(['admin', 'technician'])

  // แจ้งเตือนยางถึงเกณฑ์ — เฉพาะแอดมินบริษัทที่ดูแลภาพรวม
  const feed = profile.role === 'admin' ? await getTireAlerts(company) : null

  return (
    <AppShell
      nav={navFor(profile.role)}
      userName={profile.full_name}
      role={profile.role}
      companyName={company?.name}
      topbarActions={feed ? <NotificationBell feed={feed} /> : null}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
    </AppShell>
  )
}
