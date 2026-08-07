'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LogOut, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/database.types'

export interface NavItem {
  href: string
  label: string
  /** ชื่อ icon จาก lucide ที่ map ไว้ใน NAV_ICONS */
  icon: React.ReactNode
  exact?: boolean
}

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'ผู้ดูแลระบบ (Dreammaker)',
  admin: 'แอดมินบริษัท',
  technician: 'ช่าง',
}

/** key ที่เก็บสถานะย่อ/ขยาย sidebar ไว้ในเครื่องของผู้ใช้ */
const COLLAPSE_KEY = 'dream-tire:sidebar-collapsed'
/** จอที่แคบกว่านี้ (เช่น iPad) จะย่อ sidebar ให้อัตโนมัติถ้าผู้ใช้ยังไม่เคยตั้งค่า */
const AUTO_COLLAPSE_WIDTH = 1180

/* --- store เล็ก ๆ ของสถานะย่อ/ขยาย sidebar (อยู่นอก React เพื่อไม่ให้ hydration เพี้ยน) --- */

let collapsedState: boolean | null = null
const collapsedListeners = new Set<() => void>()

/** อ่านสถานะปัจจุบัน — ครั้งแรกจะอ่านจาก localStorage หรือเดาจากความกว้างจอ */
function readCollapsed(): boolean {
  if (collapsedState === null) {
    const stored = window.localStorage.getItem(COLLAPSE_KEY)
    collapsedState = stored === null ? window.innerWidth < AUTO_COLLAPSE_WIDTH : stored === '1'
  }
  return collapsedState
}

/** บันทึกสถานะใหม่พร้อมแจ้งทุก component ที่ subscribe อยู่ */
function writeCollapsed(value: boolean) {
  collapsedState = value
  window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0')
  collapsedListeners.forEach((listener) => listener())
}

function subscribeCollapsed(listener: () => void) {
  collapsedListeners.add(listener)
  return () => {
    collapsedListeners.delete(listener)
  }
}

/**
 * โครงหน้าจอหลัก — sidebar ถาวรตั้งแต่ iPad แนวตั้งขึ้นไป (ย่อเป็นรางไอคอนได้),
 * และเป็น drawer บนจอมือถือ
 */
export function AppShell({
  nav,
  userName,
  role,
  companyName,
  topbarActions,
  children,
}: {
  nav: NavItem[]
  userName: string
  role: UserRole
  companyName?: string | null
  /** ปุ่ม/วิดเจ็ตด้านขวาของ top bar เช่น กระดิ่งแจ้งเตือน */
  topbarActions?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  // ฝั่ง server render เป็นแบบขยายไว้ก่อน แล้วค่อยปรับตามค่าที่ผู้ใช้เคยเลือกหลัง hydrate
  const collapsed = React.useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false)
  const pathname = usePathname()

  /** ย่อ/ขยาย sidebar แล้วจำค่าไว้ให้ครั้งต่อไป */
  function toggleCollapsed() {
    writeCollapsed(!collapsed)
  }

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)

  /** เมนูที่กำลังเปิดอยู่ ใช้แสดงชื่อหน้าบน top bar */
  const currentSection = nav.find(isActive)

  /**
   * เนื้อหาใน sidebar
   * @param compact true = โหมดรางไอคอน (ซ่อนข้อความ) ใช้เฉพาะ sidebar ถาวร
   */
  const renderSidebar = (compact: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center gap-3 py-5', compact ? 'flex-col px-2' : 'px-5')}>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-[0_8px_20px_-8px_rgba(13,110,224,0.9)]">
          D
        </div>
        {!compact && (
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink-900">Dream Tire</p>
            <p className="truncate text-xs text-ink-400">ระบบจัดการยางรถบรรทุก</p>
          </div>
        )}

        {/* ปิด drawer (จอมือถือ) */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="ปิดเมนู"
          className="ml-auto flex size-10 items-center justify-center rounded-xl text-ink-400 hover:bg-brand-50 md:hidden"
        >
          <X className="size-5" />
        </button>

        {/* ย่อ/ขยาย (เฉพาะ sidebar ถาวร) */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
          title={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
          className={cn(
            'hidden size-10 items-center justify-center rounded-xl text-ink-400 transition-colors hover:bg-brand-50 hover:text-brand-600 md:flex',
            compact ? 'mt-1' : 'ml-auto',
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
        </button>
      </div>

      <nav className={cn('flex-1 space-y-1 overflow-y-auto py-2', compact ? 'px-2' : 'px-3')}>
        {nav.map((item) => {
          const active = isActive(item)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              title={compact ? item.label : undefined}
              className={cn(
                'tap-target group flex items-center rounded-xl text-[15px] font-medium transition-colors',
                compact ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                active
                  ? 'bg-brand-600 text-white shadow-[0_8px_20px_-12px_rgba(13,110,224,1)]'
                  : 'text-ink-700 hover:bg-brand-50 active:bg-brand-100',
              )}
            >
              <span className={cn('shrink-0', active ? 'text-white' : 'text-brand-500')}>{item.icon}</span>
              {!compact && (
                <>
                  <span className="truncate">{item.label}</span>
                  {active && <ChevronRight className="ml-auto size-4 opacity-80" />}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      <div className={cn('border-t border-line py-3', compact ? 'px-2' : 'px-3')}>
        <div
          className={cn('flex items-center rounded-xl py-2', compact ? 'justify-center px-0' : 'gap-3 px-2')}
          title={compact ? `${userName} · ${companyName ?? ROLE_LABEL[role]}` : undefined}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {userName.trim().charAt(0) || '?'}
          </div>
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">{userName}</p>
              <p className="truncate text-xs text-ink-400">{companyName ?? ROLE_LABEL[role]}</p>
            </div>
          )}
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            title={compact ? 'ออกจากระบบ' : undefined}
            className={cn(
              'tap-target mt-1 flex w-full items-center rounded-xl text-[15px] font-medium text-ink-500 transition-colors hover:bg-rose-50 hover:text-rose-600',
              compact ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
            )}
          >
            <LogOut className="size-5" />
            {!compact && 'ออกจากระบบ'}
          </button>
        </form>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar ถาวร — ตั้งแต่ iPad แนวตั้งขึ้นไป, ย่อเป็นรางไอคอนได้ */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-line bg-surface transition-[width] duration-200 md:block',
          collapsed ? 'w-[4.75rem]' : 'w-64',
        )}
      >
        <div className="sticky top-0 h-dvh">{renderSidebar(collapsed)}</div>
      </aside>

      {/* Drawer (จอมือถือ) */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink-900/25 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="animate-fade-up absolute inset-y-0 left-0 w-72 border-r border-line bg-surface shadow-[var(--shadow-lift)]">
            {renderSidebar(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — แสดงทุกขนาดจอ */}
        <header className="glass sticky top-0 z-30 flex items-center gap-3 border-b border-line px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="เปิดเมนู"
            className="flex size-11 items-center justify-center rounded-xl text-ink-700 hover:bg-brand-50 md:hidden"
          >
            <Menu className="size-6" />
          </button>

          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink-900">
              {currentSection?.label ?? 'Dream Tire'}
            </p>
            <p className="truncate text-xs text-ink-400">{companyName ?? ROLE_LABEL[role]}</p>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {topbarActions}
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
              title={`${userName} · ${companyName ?? ROLE_LABEL[role]}`}
            >
              {userName.trim().charAt(0) || '?'}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}

/** หัวข้อหน้า + breadcrumb + ปุ่ม action */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  action,
}: {
  title: string
  subtitle?: React.ReactNode
  breadcrumb?: string[]
  action?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <p className="mb-1 truncate text-xs text-ink-400">{breadcrumb.join(' / ')}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-500">{subtitle}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}
