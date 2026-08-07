import { Building2, CircleDot, GitBranch, LayoutDashboard, SlidersHorizontal } from 'lucide-react'
import { AppShell, type NavItem } from '@/components/app-shell'
import { requireSession } from '@/lib/auth'

const ICON = 'size-5'

const SUPER_NAV: NavItem[] = [
  { href: '/superadmin',           label: 'ภาพรวมระบบ',      icon: <LayoutDashboard className={ICON} />, exact: true },
  { href: '/superadmin/companies', label: 'ข้อมูลลูกค้า',     icon: <Building2 className={ICON} /> },
  { href: '/superadmin/catalog',   label: 'ข้อมูลยาง',    icon: <CircleDot className={ICON} /> },
  { href: '/superadmin/axle-types', label: 'ประเภทเพลา',      icon: <GitBranch className={ICON} /> },
  { href: '/superadmin/reasons',   label: 'สาเหตุการถอดยาง', icon: <SlidersHorizontal className={ICON} /> },
]

/** Layout ฝั่ง Dreammaker (super admin) — ออกแบบสำหรับเดสก์ท็อป */
export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSession(['super_admin'])

  return (
    <AppShell nav={SUPER_NAV} userName={profile.full_name} role={profile.role} companyName="Dreammaker">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
    </AppShell>
  )
}
