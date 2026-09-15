/**
 * UI primitives — modern minimal โทนฟ้าอ่อน
 * ทุก control ออกแบบให้กดง่ายบน iPad (min-height 44px)
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

/* ---------------------------------------------------------- Card */

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface shadow-[var(--shadow-soft)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-5', className)} {...props} />
}

/* -------------------------------------------------------- Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-[0_6px_16px_-8px_rgba(13,110,224,0.9)]',
  secondary:
    'bg-white text-ink-700 border border-line hover:bg-brand-50 hover:border-brand-200 active:bg-brand-100',
  ghost: 'text-ink-700 hover:bg-brand-50 active:bg-brand-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-10 px-3.5 text-sm rounded-lg gap-1.5',
  md: 'h-12 px-4.5 text-[15px] rounded-xl gap-2',
  lg: 'h-14 px-6 text-base rounded-xl gap-2.5',
}

export interface ButtonProps extends React.ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex select-none items-center justify-center font-medium transition-all',
        'disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.985]',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

/* --------------------------------------------------------- Input */

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-ink-700', className)} {...props} />
}

const FIELD_BASE =
  'w-full rounded-xl border border-line bg-white px-3.5 text-base text-ink-900 ' +
  'placeholder:text-ink-400 transition-colors ' +
  'hover:border-brand-200 focus:border-brand-400 focus:outline-none ' +
  'focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-ink-400'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(FIELD_BASE, 'h-12', className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(FIELD_BASE, 'min-h-24 py-2.5 leading-relaxed', className)} {...props} />
}

export function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(FIELD_BASE, 'h-12 appearance-none pr-11', className)}
        {...props}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
        viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      {label && (
        <Label>
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------- Badge */

type Tone = 'sky' | 'emerald' | 'rose' | 'amber' | 'slate' | 'brand'

// สีเข้มขึ้นกว่าเดิม (100/800/300) ให้สถานะอ่านออกชัดบนจอหน้างานที่แสงจ้า
const TONE: Record<Tone, string> = {
  sky: 'bg-sky-100 text-sky-800 ring-sky-300',
  emerald: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  rose: 'bg-rose-100 text-rose-800 ring-rose-300',
  amber: 'bg-amber-100 text-amber-800 ring-amber-300',
  slate: 'bg-slate-100 text-slate-700 ring-slate-300',
  brand: 'bg-brand-100 text-brand-800 ring-brand-300',
}

export function Badge({
  tone = 'slate',
  className,
  ...props
}: React.ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        TONE[tone],
        className,
      )}
      {...props}
    />
  )
}

/** พื้นหลังแถวตารางตามระดับการแจ้งเตือน — ใช้ให้เหมือนกันทุกตาราง */
export const ALERT_ROW: Record<'none' | 'warn' | 'danger', string> = {
  none: 'transition-colors hover:bg-brand-50/40',
  // วิ่งเกินระยะ: เหลืองส้ม
  warn: 'bg-amber-50 transition-colors hover:bg-amber-100/70',
  // ดอกยางต่ำกว่าเกณฑ์: แดง (ความปลอดภัย)
  danger: 'bg-rose-50 transition-colors hover:bg-rose-100/70',
}

/**
 * ระดับการแจ้งเตือนของยาง 1 เส้น (ใช้เลือกสีแถว/ตัวเลข)
 * @param mounted ยางติดตั้งอยู่บนรถหรือไม่
 * @param runKm ระยะรอบนี้
 * @param alertKm เกณฑ์ระยะ
 * @param treadMm ดอกยางปัจจุบัน
 * @param alertTreadMm เกณฑ์ดอกยาง
 */
export function alertLevel(
  mounted: boolean,
  runKm: number,
  alertKm: number,
  treadMm: number | null,
  alertTreadMm: number,
): 'none' | 'warn' | 'danger' {
  if (!mounted) return 'none'
  if (treadMm !== null && treadMm <= alertTreadMm) return 'danger'
  if (runKm >= alertKm) return 'warn'
  return 'none'
}

/* ---------------------------------------------------- Empty state */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
          {icon}
        </div>
      )}
      <p className="text-base font-medium text-ink-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* --------------------------------------------------------- Table */

export function TableWrap({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('w-full overflow-x-auto', className)} {...props} />
}

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-left', className)} {...props} />
}

export function Th({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-line bg-brand-50/50 px-4 py-3.5',
        'text-xs font-semibold tracking-wide text-ink-500 uppercase',
        className,
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('border-b border-line px-4 py-3.5 text-[15px] text-ink-700', className)} {...props} />
}

/* ---------------------------------------------------------- Stat */

export function StatTile({
  label,
  value,
  unit,
  tone = 'brand',
  icon,
}: {
  label: string
  value: React.ReactNode
  unit?: string
  tone?: Tone
  icon?: React.ReactNode
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-500">{label}</p>
        {icon && (
          <span className={cn('flex size-9 items-center justify-center rounded-xl ring-1 ring-inset', TONE[tone])}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight text-ink-900">{value}</span>
        {unit && <span className="text-sm text-ink-400">{unit}</span>}
      </p>
    </Card>
  )
}
