'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, X } from 'lucide-react'
import { Card, Field, Input } from '@/components/ui'
import { cn, formatThaiDate, todayISO } from '@/lib/utils'
import { dateRangeLabel, type DateRange } from './removal-report-types'
import { isRangeInvalid, parseDashboardRange } from './dashboard-filters'

/**
 * วันที่ย้อนหลังจากวันนี้ (YYYY-MM-DD) — ใช้กับปุ่มลัดช่วงเวลา
 * @param months จำนวนเดือนที่ย้อนกลับ (0 = วันที่ 1 ของเดือนนี้)
 */
function monthsAgoISO(months: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (months === 0) d.setDate(1)
  else d.setMonth(d.getMonth() - months)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** วันที่ 1 มกราคมของปีนี้ (YYYY-MM-DD) */
function startOfYearISO(): string {
  return `${new Date().getFullYear()}-01-01`
}

const EMPTY_RANGE: DateRange = { from: '', to: '' }

/** ปุ่มลัดช่วงเวลา — "ทั้งหมด" = ล้างตัวกรอง (ค่าเริ่มต้นของหน้า) */
const RANGE_PRESETS: Array<{ key: string; label: string; range: () => DateRange }> = [
  { key: 'month', label: 'เดือนนี้', range: () => ({ from: monthsAgoISO(0), to: todayISO() }) },
  { key: '3m', label: '3 เดือน', range: () => ({ from: monthsAgoISO(3), to: todayISO() }) },
  { key: '6m', label: '6 เดือน', range: () => ({ from: monthsAgoISO(6), to: todayISO() }) },
  { key: 'year', label: 'ปีนี้', range: () => ({ from: startOfYearISO(), to: todayISO() }) },
  { key: 'all', label: 'ทั้งหมด', range: () => EMPTY_RANGE },
]

/**
 * แถบกรองช่วงวันที่ของหน้า dashboard — เก็บค่าใน URL (?from=&to=) ให้ server ดึงข้อมูลตามช่วง
 * และแชร์ลิงก์/รีเฟรชแล้วตัวกรองยังอยู่ ค่าเริ่มต้นคือว่าง = ทั้งหมด
 */
export function DashboardDateFilter({ basePath = '/dashboard' }: { basePath?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const range = parseDashboardRange({
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  })
  const hasRange = Boolean(range.from || range.to)
  const invalid = isRangeInvalid(range)

  /** preset ที่ตรงกับช่วงปัจจุบัน (ใช้ไฮไลต์ปุ่มลัด) */
  const activePreset = RANGE_PRESETS.find((p) => {
    const r = p.range()
    return r.from === range.from && r.to === range.to
  })?.key

  /** อัปเดต query string (ค่าว่าง = ลบ param นั้น) โดยคง param อื่นไว้ */
  function updateRange(next: DateRange) {
    const qs = new URLSearchParams(params.toString())
    if (next.from) qs.set('from', next.from)
    else qs.delete('from')
    if (next.to) qs.set('to', next.to)
    else qs.delete('to')
    const query = qs.toString()
    router.replace(`${basePath}${query ? `?${query}` : ''}`, { scroll: false })
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-col gap-3 px-4 py-4 xl:flex-row xl:items-end">
        <Field
          label="ช่วงวันที่"
          className="w-full xl:max-w-md"
          error={invalid ? 'วันเริ่มต้นต้องไม่เกินวันสิ้นสุด' : undefined}
        >
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={(event) => updateRange({ ...range, from: event.target.value })}
              aria-label="วันเริ่มต้น"
            />
            <span className="text-ink-400">–</span>
            <Input
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={(event) => updateRange({ ...range, to: event.target.value })}
              aria-label="วันสิ้นสุด"
            />
          </div>
        </Field>

        <div className="flex flex-wrap gap-2 self-start xl:self-auto xl:pb-0.5">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => updateRange(preset.range())}
              aria-pressed={activePreset === preset.key}
              className={cn(
                'min-h-12 rounded-xl border-2 px-4 text-base font-semibold transition-colors',
                activePreset === preset.key
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-line bg-white text-ink-900 hover:border-brand-300 hover:bg-brand-50',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {hasRange && (
          <button
            type="button"
            onClick={() => updateRange(EMPTY_RANGE)}
            className="inline-flex min-h-12 items-center gap-1.5 self-start rounded-xl border-2 border-line bg-white px-4 text-[15px] font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50 xl:self-auto"
          >
            <X className="size-4" />
            ล้างวันที่
          </button>
        )}

        <p className="inline-flex items-center gap-1.5 text-[15px] text-ink-700 xl:ml-auto xl:pb-3">
          <CalendarDays className="size-4.5 text-brand-700" />
          กำลังแสดง: {dateRangeLabel(range, (iso) => formatThaiDate(iso))}
        </p>
      </div>
    </Card>
  )
}
