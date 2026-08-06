'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/** แท็บสลับหน้าจัดการข้อมูลของลูกค้ารายนั้น */
export function CompanyTabs({ companyId }: { companyId: string }) {
  const pathname = usePathname()
  const base = `/superadmin/companies/${companyId}`

  const tabs = [
    { href: base, label: 'ภาพรวม' },
    { href: `${base}/vehicles`, label: 'รถ' },
    { href: `${base}/tires`, label: 'คลังยาง' },
    { href: `${base}/users`, label: 'ผู้ใช้งาน' },
    { href: `${base}/access`, label: 'สิทธิ์ยาง' },
  ]

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-brand-50 p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'tap-target flex shrink-0 items-center rounded-lg px-4 text-[15px] font-medium transition-colors',
              active ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-700',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
