import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * โทนสีความหมายเดียวทั้งหน้า dashboard
 * good = ปกติ/ใช้งานอยู่, info = อยู่ในคลัง, warn = วิ่งเกินระยะ, bad = ดอกยางต่ำ/ต้องจัดการ, scrap = ตัดจำหน่าย
 */
export type DashTone = 'brand' | 'good' | 'info' | 'warn' | 'bad' | 'scrap'

const TONE_TEXT: Record<DashTone, string> = {
  brand: 'text-brand-700',
  good: 'text-emerald-700',
  info: 'text-sky-700',
  warn: 'text-orange-700',
  bad: 'text-rose-700',
  scrap: 'text-rose-800',
}

const TONE_BORDER: Record<DashTone, string> = {
  brand: 'border-brand-600',
  good: 'border-emerald-600',
  info: 'border-sky-600',
  warn: 'border-orange-600',
  bad: 'border-rose-600',
  scrap: 'border-rose-700',
}

const TONE_SOFT: Record<DashTone, string> = {
  brand: 'bg-brand-100 text-brand-800',
  good: 'bg-emerald-100 text-emerald-800',
  info: 'bg-sky-100 text-sky-800',
  warn: 'bg-orange-100 text-orange-800',
  bad: 'bg-rose-100 text-rose-800',
  scrap: 'bg-rose-100 text-rose-900',
}

const TONE_SOLID: Record<DashTone, string> = {
  brand: 'bg-brand-600 text-white',
  good: 'bg-emerald-600 text-white',
  info: 'bg-sky-600 text-white',
  warn: 'bg-orange-600 text-white',
  bad: 'bg-rose-600 text-white',
  scrap: 'bg-rose-700 text-white',
}

/** class สำหรับหัวตาราง — ใหญ่ขึ้น ไม่ uppercase สีเข้ม (override Th โดยไม่แก้ shared component) */
export const TH_LG = 'text-[15px] font-bold normal-case tracking-normal text-ink-900 bg-surface-alt border-b-2 border-brand-200'
/** class สำหรับเซลล์ตาราง — ตัวใหญ่ขึ้น แถวสูงขึ้น */
export const TD_LG = 'py-4 text-base text-ink-700'

/**
 * ป้ายสถานะแบบมีไอคอน + ข้อความ (ไม่พึ่งสีอย่างเดียว)
 * @param tone โทนสีตามความหมาย
 * @param icon ไอคอน lucide
 */
export function StatusChip({
  tone,
  icon,
  children,
  className,
}: {
  tone: DashTone
  icon: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-2.5 py-1 text-sm font-bold',
        TONE_SOFT[tone],
        TONE_BORDER[tone],
        className,
      )}
    >
      <span className="[&>svg]:size-4" aria-hidden>{icon}</span>
      {children}
    </span>
  )
}

/**
 * การ์ดตัวเลขสรุป — ขอบซ้ายหนาสีตามความหมาย ตัวเลขใหญ่
 * @param label หัวข้อ
 * @param value ตัวเลข
 * @param unit หน่วย
 */
export function KpiCard({
  label,
  value,
  unit,
  tone = 'brand',
  icon,
}: {
  label: string
  value: string
  unit?: string
  tone?: DashTone
  icon: React.ReactNode
}) {
  return (
    <Card className={cn('border-l-8 p-5', TONE_BORDER[tone])}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-ink-700">{label}</p>
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl [&>svg]:size-6', TONE_SOFT[tone])}>
          {icon}
        </span>
      </div>
      <p className="mt-3 flex items-baseline gap-2">
        <span className={cn('text-4xl font-bold leading-none tracking-tight', tone === 'brand' ? 'text-ink-900' : TONE_TEXT[tone])}>
          {value}
        </span>
        {unit && <span className="text-base text-ink-500">{unit}</span>}
      </p>
    </Card>
  )
}

/**
 * กล่อง "ต้องทำวันนี้" — ลิงก์กระโดดไปตารางที่เกี่ยวข้อง
 * @param count จำนวนรายการ (0 = แสดงโทนเขียวว่าปกติ)
 */
export function TodayCard({
  href,
  count,
  unit,
  title,
  detail,
  okTitle,
  icon,
}: {
  href: string
  count: number
  unit: string
  title: string
  detail: string
  okTitle: string
  icon: React.ReactNode
}) {
  const tone: DashTone = count > 0 ? 'bad' : 'good'
  return (
    <Link
      href={href}
      className={cn(
        'grid grid-cols-[auto_1fr] items-center gap-4 rounded-2xl border-2 p-5 shadow-[var(--shadow-soft)] transition-colors sm:grid-cols-[auto_1fr_auto]',
        TONE_SOFT[tone],
        TONE_BORDER[tone],
        count > 0 ? 'hover:bg-rose-200/70' : 'hover:bg-emerald-200/70',
      )}
    >
      <span className={cn('flex size-14 items-center justify-center rounded-xl [&>svg]:size-8', TONE_SOLID[tone])}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-tight">
          {count > 0 ? (
            <>
              <span className={cn('text-4xl font-bold', TONE_TEXT[tone])}>{count}</span>
              <span className="ml-2">{unit} {title}</span>
            </>
          ) : okTitle}
        </span>
        <span className="mt-1 block text-[15px] opacity-90">{detail}</span>
      </span>
      <span className="inline-flex items-center gap-1 text-[15px] font-semibold whitespace-nowrap sm:col-auto col-span-2 justify-self-end">
        ดูรายการ <ArrowRight className="size-4" />
      </span>
    </Link>
  )
}
